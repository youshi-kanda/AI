// ================================
// JavaScript全体コード (再設計版 + 修正版)
// ================================

// グローバル変数
let conversationId = "";        // 会話ID
let isAudioInitialized = false; // 音声再生初期化フラグ(未使用例)
let mediaRecorder;              // MediaRecorderインスタンス
let autoCalibrated = false;
let calibrationStartTs = 0;
let lastNonSilenceTime = 0;
let audioChunks = [];           // 録音データ格納
let lastBotResponse = "";       // 最新のBot返答
let historyList;                // 会話履歴表示用の<ul>参照
let isProcessingHistory = false;  // 履歴取得中フラグ
let historyRetryCount = 0;      // 履歴取得リトライカウント
let isProcessingInput = false;  // 送信処理中フラグ（重複送信防止）
let tokenRefreshTimer = null;   // ログインセッション維持用タイマー
let suggestedQuestionsSupported = true;
// リトライ制御用変数の追加
let isRetrying = false;
let retryBackoff = [1000, 2000, 4000, 8000]; // バックオフ時間 (ミリ秒)
let failedRequestCache = new Map(); // 失敗したリクエストの一時キャッシュ
const suggestionRetryMap = new Map();
const failKey = "token-balance-fail";
const CF_LIMIT = 95 * 1024;
const SSE_TIMEOUT_MS = 120_000;
const STREAM_IDLE_MS   = 30000;
const MAX_RETRY        = 2;
let logoutAlertShown   = false;
let lastMessageId = null;
let historyListEl  = null;
let historyModalEl   = null;
const ALLOWED_UPLOAD_ROLES = ["社長", "役員"];
const userName = localStorage.getItem("userName") ||
                 prompt("ユーザー名を入力してください") || "guest";
localStorage.setItem("userName", userName);        // 旧 email の代替

async function fetchRemainingTokens(){ return null; }
async function consumeTokens(){ }
function updateBalanceDisplay(){ }
function setGlobalTokenBadge(){ }

async function fetchMediaList(){ return []; }

/** 質問テキストの長さで response_mode を決める */
function chooseMode(query) {
  const THRESHOLD = 500;           // ここを調整すれば比率を変えられる
  return query.length < THRESHOLD ? "streaming" : "blocking";
}
/* ===========================================================
   iOS Safari のオーディオ自動再生制限を解除するユーティリティ
   最初のユーザー操作時に無音を 1 フレームだけ鳴らす
   =========================================================== */
(function unlockIOSAudio(){
  const unlock = async () => {
    try{
      /* -- WebAudio をアンロック -- */
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource(); src.buffer = buf;
      src.connect(ctx.destination); src.start(0);

      /* -- <audio> タグもアンロック -- */
      const silent = new Audio("");
      silent.play().catch(()=>{});        // 空 URL でも OK

      /* -- 一度実行したらリスナーを外す -- */
      window.removeEventListener("touchstart", unlock, true);
      window.removeEventListener("click",       unlock, true);
    }catch(e){
      console.warn("audio unlock failed:", e);
    }
  };

  window.addEventListener("touchstart", unlock, true); // iOS Safari
  window.addEventListener("click",      unlock, true); // Mac Safari
})();

/* -------------------------------------------------
   fetch(Request, {duplex:'half'}) を判定（PC = true、
   iOS/Android Safari などは例外→false）
--------------------------------------------------*/
const supportsDuplex = (() => {
  try {
    new Request("", { duplex: "half" });
    return true;
  } catch (e) {             // iOS Safari など duplex 非対応
    return false;
  }
})();
/**
 * 共通フェッチ関数 ― 失敗時は指数バックオフで再試行
 * @param {string} url
 * @param {object} opt
 * @returns {Promise<Response>}
 */
async function executeFetch(url, opt = {}) {
  const backoff = retryBackoff.concat(16000); // 最終 16s まで延長

  for (let i = 0; i < backoff.length; i++) {
    const ctrl = new AbortController();
    const timeoutMs =
          opt.timeout === undefined ? 30000 : opt.timeout; // ← 0 を有効に扱う
    const to = timeoutMs > 0
        ? setTimeout(() => ctrl.abort(), timeoutMs)
        : null;
    try {
      const res = await fetch(url, { ...opt, signal: ctrl.signal });
      clearTimeout(to);
      /* ---- 401 なら一度だけ再発行 ---- */
      if (res.status === 401 && !opt._retried) {
        const ok = await tryRefresh();
        if (ok) {
          // 新アクセストークンでヘッダを差し替えて再試行
          const newOpt = { ...opt, _retried: true };
          if (newOpt.headers && newOpt.headers.Authorization)
            newOpt.headers.Authorization = `Bearer ${localStorage.getItem("accessToken")}`;
          continue;                    // for ループの先頭へ
        }
        logoutUser();                  // ← リフレッシュ失敗
        showLoginModal();
        throw new Error("AUTH_FAILED");  // 以降の処理を止める
      }
      /* ---- 4xx (404 など) ---- */
      if (res.status >= 400 && res.status < 500) {
        return res;
      }
      if (res.ok) return res;               // 2xx
      if (i === backoff.length - 1) return res;  // 5xx 最終リトライ
    } catch (err) {
       if (to) clearTimeout(to);
      if (i === backoff.length - 1) throw err; // 最終リトライも失敗
    }
    // 次のリトライまで待機
    await new Promise(r => setTimeout(r, backoff[i]));
  }
}

/* ==== avatar globals ==== */
let avatarVideo   = null;
let avatarAudio   = null;
let isAvatarPlaying = false;

const API_BASE    = "https://sirupha.tsuji-090.workers.dev";
const TOKEN_KEY   = "accessToken";
const REFRESH_KEY = "refreshToken";
const MEDIA_API_BASE = "https://sirupha.tsuji-090.workers.dev/media/";
// 簡易的なインメモリキャッシュ
const apiCache = {
  data: new Map(),
  ttl: new Map(),
  
  // キャッシュにデータを設定（ttlはミリ秒単位）
  set(key, data, ttl = 60000) {
    this.data.set(key, data);
    this.ttl.set(key, Date.now() + ttl);
  },
  
  // キャッシュからデータを取得
  get(key) {
    if (!this.data.has(key)) return null;
    if (Date.now() > this.ttl.get(key)) {
      // 期限切れならキャッシュ削除
      this.data.delete(key);
      this.ttl.delete(key);
      return null;
    }
    return this.data.get(key);
  },
  
  // キャッシュをクリア
  clear(key) {
    if (key) {
      this.data.delete(key);
      this.ttl.delete(key);
    } else {
      this.data.clear();
      this.ttl.clear();
    }
  }
};

/* ---------------------------------------------------------
   返答文にメディアのファイル名が含まれていれば引用リンクを追加
   ---------------------------------------------------------*/
async function guessMediaCitations(answer){
  const mediaList = await fetchMediaList();
  if(!mediaList.length) return;
  const lowerAns = answer.toLowerCase();
  const added = new Set();
  mediaList.forEach(doc=>{
    const name = doc.title || doc.name || "";
    if(!added.has(name) && lowerAns.includes(name.toLowerCase())){
      added.add(name);
      addCitation({
        document_name: name,
        content      : "メディアファイルを開く",
        url          : doc.custom_file_url || doc.attached_file,
        _src         : "media"
      });
    }
  });
}

// 無音検出用(必要なら再度追加)
let audioContext;
let analyser;
let source;
let silenceDetectionTimer;
let silenceThreshold = 0;    // 無音判定しきい値
let silenceDuration = 2000;   // 2秒続いたら停止

// 送信ボタン、録音ボタン
const sendButton = document.getElementById("send-button");
const recordButton = document.getElementById("record-button");


// ================================
// 1.5) PDFからテキスト抽出（新機能追加）
// ================================

// pdf.js を動的に読み込む関数
function loadPDFjsLib() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Tesseract.js を動的に読み込む関数
function loadTesseractJS() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * PDFファイル（application/pdf）から、1ページ目を画像化しTesseract.jsでOCR処理を実行してテキストを抽出する
 * @param {File} file - PDFファイル
 * @returns {Promise<string>} - 抽出されたテキスト（失敗時は空文字列）
 */
async function extractTextFromPDF(file) {
  try {
    // ファイルがPDFか確認
    if (file.type !== "application/pdf") return "";
    // ファイルをDataURLとして読み込み
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    // pdf.js を読み込む
    await loadPDFjsLib();
    const loadingTask = window.pdfjsLib.getDocument(dataUrl);
    const pdfDoc = await loadingTask.promise;
    // 1ページ目を取得
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 }); // 拡大して精度向上
    // オフスクリーンCanvas作成
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    const renderContext = { canvasContext: context, viewport: viewport };
    await page.render(renderContext).promise;
    // Canvasから画像データURLを取得
    const imageDataUrl = canvas.toDataURL("image/png");
    // Tesseract.js を読み込む
    await loadTesseractJS();
    const worker = await Tesseract.createWorker();
    await worker.load();
    await worker.loadLanguage("jpn");
    await worker.initialize("jpn");
    const { data: { text } } = await worker.recognize(imageDataUrl);
    await worker.terminate();
    return text;
  } catch (error) {
    console.error("PDF OCR抽出エラー:", error);
    return "";
  }
}


// ================================
// 1) 入力欄の有効/無効制御
// ================================
function disableUserInput() {
  const inputField = document.getElementById("user-input");
  if (inputField) {
    inputField.disabled = true;
  }
}

function enableUserInput() {
  const inputField = document.getElementById("user-input");
  if (inputField) {
    inputField.disabled = false;
  }
}


// ================================
// 2) 入力された内容を処理
// ================================
async function processInput(inputText, audioFile, uploadedFileId = null) {
  try {
    // 既に処理中なら何もしない（重複送信防止）
    if (isProcessingInput) return;
    
    // 処理中フラグをON
    isProcessingInput = true;
    
    // 送信中の重複防止
    disableUserInput();

    let userInput = inputText;

    // 音声ファイル → テキスト認識
    if (audioFile) {
      const textFromAudio = await uploadAudio(audioFile);
      if (textFromAudio) {
        userInput = textFromAudio;
        // addMessage(`音声入力: ${userInput}`, "user");
      } else {
        throw new Error("音声→テキスト変換に失敗しました。");
      }
    }

    // ファイルアップロードのIDがある場合
    const filesParam = [];
    if (uploadedFileId) {
      filesParam.push({
        type: "document",
        transfer_method: "local_file",
        upload_file_id: uploadedFileId
      });
    }

    /* --- ③ 最終 userInput が決まったのでここで長文ガード --- */
    const byteLen = new TextEncoder().encode(userInput).length;
    if (byteLen > CF_LIMIT) {
        const tmpFile = new File([userInput], "long_prompt.txt", { type:"text/plain" });
        const { id: uploadId } = await uploadFileAndRegisterToKnowledge(tmpFile);
        userInput = "長文を添付しました。内容はファイルを参照してください。";
        filesParam.push({
          type: "document",
          transfer_method: "local_file",
          upload_file_id: uploadId
        });
    }

    if (!userInput) {
      addMessage("入力が空です。もう一度お試しください。", "system");
      return;
    }

    // メッセージ送信
    addMessage(userInput, "user");
    const botReply = await sendMessage(userInput, filesParam);
    await consumeTokens(1);
    const newBalance = await fetchRemainingTokens();
    updateBalanceDisplay(newBalance);
  } catch (err) {
    console.error("Error in processInput:", err);
    addMessage("エラーが発生しました。もう一度試してください。", "system");
  } finally {
    // 入力欄クリア & 有効化
    const inputField = document.getElementById("user-input");
    if (inputField) {
      inputField.value = "";
      enableUserInput();
    }
    // 処理中フラグをOFF
    isProcessingInput = false;
  }
}


/* =========================================================
   チャットメッセージ送信
   ---------------------------------------------------------
   - PC (duplex 対応ブラウザ)   : SSE ストリーミング描画
   - モバイル Safari など       : blocking モードにフォールバック
   - 途中で 401 が返れば executeFetch が自動でリフレッシュ
   ========================================================= */
async function sendMessage(userInput, files = []) {
  try {
    startLoadingState();

    /* ---------- payload & response_mode 選択 ---------- */
    const payload = {
      query         : userInput,
      response_mode : supportsDuplex && userInput.length < 500
                      ? "streaming"
                      : "blocking",
      ...(conversationId && { conversation_id: conversationId }),
      user          : localStorage.getItem("userName") || "guest",
      files
    };
    const streamingChosen = supportsDuplex && payload.response_mode === "streaming";

    /* ---------- fetch ---------- */
    const opt = {
      method : "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept"      : streamingChosen ? "text/event-stream" : "application/json"
      },
      body   : JSON.stringify(payload),
      timeout: 0
    };
    if (streamingChosen) opt.duplex = "half";

    const response = await apiFetch(`${API_BASE}/chat-messages`, opt);
    if (!response.ok) throw new Error(await response.text());

    /* ---------- blocking だけならここで完了 ---------- */
    if (!streamingChosen) {
      const full = await response.json();
      const bot  = addMessage("", "bot");
      bot.innerHTML = DOMPurify.sanitize(marked.parse(full.answer ?? ""));
      bot.scrollIntoView({ block: "start" });
      attachTTSButton(bot, full.answer ?? "");
      (full.retriever_resources || []).forEach(addCitation);
      guessMediaCitations(full.answer ?? "");
      lastBotResponse = full.answer ?? "";
      return lastBotResponse;
    }

    /* =================================================
       streaming 処理
       ================================================= */
    const reader  = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    const botDiv = addMessage("", "bot");
    let sseBuf = "", answerBuf = "", rafId = null;
    const citations = [];

    /* ---- idle タイマー --------------- */
    let idleTimer = null;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => reader.cancel().catch(() => {}), STREAM_IDLE_MS);
    };
    resetIdle();

    /* ---- DOM レンダリングを間引き ---- */
    const scheduleRender = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        botDiv.innerHTML = DOMPurify.sanitize(marked.parse(answerBuf));
        botDiv.scrollIntoView({ block: "start" });
        rafId = null;
      });
    };

    /* ---- メインループ ---- */
    while (true) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) break;
      resetIdle();

      sseBuf += decoder.decode(value, { stream: true });
      const events = sseBuf.split("\n\n");
      sseBuf = events.pop();

      for (const evt of events) {
        for (const raw of evt.split("\n")) {
          if (!raw.startsWith("data:")) continue;
          const eventData = raw.replace(/^data:\s*/i, "");
          if (!eventData || eventData === "[DONE]") continue;

          let j;
          try { j = JSON.parse(eventData); }
          catch { continue; }

          const chunk =
            j.answer ??
            j.delta ??
            j.content ??
            j.answer_chunk ??
            j.choices?.[0]?.delta?.content ?? "";

          if (chunk) {
            answerBuf += chunk;
            scheduleRender();
          }

          if (Array.isArray(j.retriever_resources)) {
            citations.push(...j.retriever_resources);
          }
          if (j.conversation_id) conversationId = j.conversation_id;
          if (j.message_id || j.id) lastMessageId = j.message_id || j.id;
        }
      }
    }

    /* ---- ストリーム完了：最終描画 ---- */
    cancelAnimationFrame(rafId);
    botDiv.innerHTML = DOMPurify.sanitize(marked.parse(answerBuf));
    botDiv.scrollIntoView({ block: "start" });
    attachTTSButton(botDiv, answerBuf);

    /* ---- 付随情報 ---- */
    lastBotResponse = answerBuf;
    citations.forEach(addCitation);

      /* ================================================
         ▼ 新しいメッセージを送信したので関連キャッシュを破棄
            1) 会話一覧 ('conversation-list')
            2) 当該会話履歴 (history-<conversationId>)
         ================================================= */
    apiCache.clear("conversation-list");
    if (conversationId) apiCache.clear(`history-${conversationId}`);

    /* モーダルが開いている場合は
       ① 選択中の会話履歴 (#history-list)
       ② 会話一覧 (#conversation-list)
       の両方を更新する */
    if (historyModalEl?.style.display === "flex") {
      if (conversationId) {
        await populateHistoryModal(conversationId).catch(() => {});
      }
      /* 会話一覧は新着メッセージで "更新日" が変わるので再取得 */
      await fetchConversationList().catch(()=>{});
    }
    return lastBotResponse;

  } catch (e) {
    console.error("Error in sendMessage:", e);

    /* ★ streamingChosen のときだけ blocking へ自動フォールバック */
    if (supportsDuplex && e.name !== "AUTH_FAILED") {
      try {
        const botDiv = addMessage("", "bot");          // fallback 用
        return await fetchBlocking(payload, botDiv);
      } catch (fallbackErr) {
        console.error("Blocking fallback failed:", fallbackErr);
      }
    }

    addMessage("エラーが発生しました。もう一度お試しください。", "bot");
  } finally {
    endLoadingState();
  }
}

// ================================
// 4) 送信ボタンのローディング制御
// ================================
function startLoadingState() {
  const btn = document.getElementById("send-button");
  if (!btn) return;
  btn.disabled = true;
  btn.classList.add("loading");
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
}

function endLoadingState() {
  const btn = document.getElementById("send-button");
  if (!btn) return;
  btn.disabled = false;
  btn.classList.remove("loading");
  btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
}

// ================================
// 5) ファイルアップロード(ナレッジ登録込み)
// ================================
/**
 * @param {File} file - アップロードしたいファイル
 * @returns {Promise<string>} - ファイルID (Dify 側などで発行されると想定)
 */
async function uploadFileAndRegisterToKnowledge(file) {
  try {
    const formData = new FormData();
    formData.append("file", file);
    
    // PDFの場合、OCRでテキスト抽出を試みる
    let extractedText = "";
    if (file.type === "application/pdf") {
      extractedText = await extractTextFromPDF(file);
    }
    
    // metaJson に抽出結果を追加（extracted_text がある場合のみ）
    const metaJson = {
      indexing_technique: "high_quality",
      process_rule: {
        mode: "custom",
        rules: {
          pre_processing_rules: [
            { id: "remove_extra_spaces", enabled: true },
            { id: "remove_urls_emails", enabled: true }
          ],
          segmentation: {
            separator: "\n\n",
            max_tokens: 2000
          },
          subchunk_segmentation: {
            separator: "\n",
            max_tokens: 2000,
            chunk_overlap: 500
          }
        }
      }
    };
    if (extractedText) {
      metaJson.extracted_text = extractedText;
    }
    // 重要: metaJson をテキストとして追加
    formData.append("data", JSON.stringify(metaJson));

    const resp = await apiFetch(`${API_BASE}/files/upload`, { 
      method: "POST",
      body: formData
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`HTTP error! status: ${resp.status}, detail: ${errText}`);
    }

    const data = await resp.json();    
    // ファイル一覧のキャッシュをクリア
    apiCache.clear('file-list');
    
    return data;
  } catch (err) {
    console.error("Error uploading & registering knowledge:", err);
    throw err;
  }
}


// ================================
// 6) 引用情報をチャットに追加
// ================================
function addCitation(resource){
  const chat = document.getElementById("chat-messages");
  if(!chat) return;

  /* ① 直近 bot メッセージを取得 */
  const botMsgs = chat.querySelectorAll(".message.bot");
  const lastBot = botMsgs[botMsgs.length-1];
  if(!lastBot) return;

  /* ② botMsg の直後に “container” を確保 (flex 横並び) */
  let cont = lastBot.nextSibling;
  if(!(cont && cont.classList && cont.classList.contains("citations-container"))){
    cont = document.createElement("div");
    cont.className = "citations-container";
    lastBot.insertAdjacentElement("afterend", cont);
  }

  /* ③ 同じファイル名が既に入っていればスキップ */
  const exists = Array.from(cont.children).some(
      el => el.dataset.name === (resource.document_name||""));
  if(exists) return;

  /* ④ 新しい citation を作成 */
  const cite = document.createElement("div");
  cite.className = "citation";
  cite.dataset.name = resource.document_name || "";
  cite.textContent  = resource.document_name
                  || resource.title
                  || resource.name
                  || "不明なファイル";
  cite.style.cursor = "pointer";
  cite.style.pointerEvents = "auto";   // テーマ側の none を打ち消す

  /* --- ① メディア: 直接開く ---------------------- */
  if (resource._src === "media" && resource.url){
    cite.addEventListener("click", ()=>window.open(resource.url,"_blank"));
  }
  /* --- ② retriever_resources に content がある ---- */
  else if (resource.content){
     cite.addEventListener("click", ()=>{
       showPopup(resource.content);
     });
  }
 
  /* --- ③ Dify ドキュメント: segment 完全文を fetch -- */
  else if (resource.document_id){
    cite.addEventListener("click", async ()=>{
      try{
        const segText = await fetchCitationDetail(resource);
        showPopup(segText || "引用元の取得に失敗しました。");
      }catch(e){
        console.error("fetchCitationDetail:",e);
        showPopup("引用元の取得に失敗しました。");
      }
    });
  }
  /* --- ③ フォールバック --- */
  else{
    cite.addEventListener("click", ()=>{
      showPopup(resource.content||"引用元の内容が取得できません。");
    });
  }
  cont.appendChild(cite);

  /* スクロール末尾へ */
  chat.scrollTop = chat.scrollHeight;
}

async function fetchCitationDetail(res){
  /* キャッシュキー: docId + segmentId */
  const key = `cite-${res.document_id}-${res.segment_id}`;
  const cached = apiCache.get(key);
  if (cached) return cached;

  /* ① ドキュメント全セグメントを取得 */
  const r = await apiFetch(
       `/files/detail?docId=${encodeURIComponent(res.document_id)}`,
       { method:"GET", timeout:10000 });
  if (!r.ok){
    console.warn("cite detail fetch:", await r.text());
    return "";
  }
  const data = await r.json();           // { data:[{segment_id,content...}] }
  if (!Array.isArray(data.data)) return "";

  /* ② segment_id が一致するものを探す */
  const seg = data.data.find(s=> String(s.segment_id) === String(res.segment_id));
  const text = seg?.content || "";

  /* ③ 30 分キャッシュ */
  apiCache.set(key, text, 30*60*1000);
  return text;
}

// ================================
// 7) ポップアップを表示
// ================================
function showPopup(content){
  const container = document.getElementById('popup-container');
  const body      = document.getElementById('popup-text');
  if(!container||!body) return;

  body.textContent = content;
  container.style.display = 'flex';          // ← block → flex に変更

  // 既にハンドラがあれば二重登録しない
  if(!container.dataset.bound){
    const close = () => {
      container.style.display = 'none';
      body.textContent = '';
    };
    document.getElementById('close-popup').onclick = close;
    const overlay = document.getElementById('popup-overlay');
    if(overlay) overlay.onclick = close;
    container.dataset.bound = '1';
  }
}

// ================================
// 8) 録音開始 (record-button)
// ================================
recordButton.addEventListener("click", async () => {
  // 既に処理中なら何もしない
  if (isProcessingInput) return;

  // 録音中なら停止だけして戻る
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    addMessage("録音停止しました。", "system");
    return;
  }

  startRecordLoadingState();

  try {
    addMessage("マイクへのアクセスをリクエストしています...", "system");

    /* ==== ① デバイス取得：ノイズ抑制付き mono 48 kHz ==== */
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 48000,
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true
      }
    });

    /* ==== ② MediaRecorder を Opus 固定で作成 ==== */
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus"
    });

    /* ==== ③ dataavailable で即送信 ==== */
    mediaRecorder.ondataavailable = async (e) => {
      if (!(e.data && e.data.size)) return;

      // 無音タイマー停止 & オーディオコンテキスト解除
      if (silenceDetectionTimer) {
        clearTimeout(silenceDetectionTimer);
        silenceDetectionTimer = null;
      }
      // audioContext?.close();

      endRecordLoadingState();          // UI 戻す
      await processInput("", e.data);   // 音声→テキスト→送信
    };

    /* ==== ④ stop は後片付けのみ ==== */
    mediaRecorder.onstop = () => {
      if (silenceDetectionTimer) {
        clearTimeout(silenceDetectionTimer);
        silenceDetectionTimer = null;
      }
    
      // ★ AudioContext も閉じてメモリ解放
      audioContext?.close();
      endRecordLoadingState();
      recordButton.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    };

    mediaRecorder.start();              // 録音開始
    recordButton.innerHTML = '<i class="fa-solid fa-stop"></i>';
    addMessage("録音を開始しました。マイク使用中...", "system");
    setupSilenceDetection(stream);

  } catch (err) {
    console.error("Error accessing microphone:", err);
    endRecordLoadingState();
    addMessage(
      err.name === "NotAllowedError"  ? "マイクアクセスが拒否されました。ブラウザ設定を確認してください。"
    : err.name === "NotFoundError"    ? "マイクが検出されませんでした。"
                                      : "マイクアクセス中にエラーが発生しました。",
      "system"
    );
  }
});

// ================================
// 9) 録音ボタンのローディング制御
// ================================
// 無音検出のセットアップ関数 - 追加
async function setupSilenceDetection(stream) {
  try {
    // AudioContext の作成
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;              // 256 で問題なければそのまま

    // マイク入力を Analyser に接続
    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    // 追加: AudioContext が suspend されていたら再開
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    // ★ 追加: キャリブレーション用の初期化
    autoCalibrated     = false;
    calibrationStartTs = 0;

    lastNonSilenceTime = Date.now();     // タイマー初期化    
    detectSilence();                    // 無音検出ループ開始
  } catch (err) {
    console.error("無音検出のセットアップに失敗:", err);
  }
}

// ================================
// 無音検出ループ（detectSilence）
// ================================
function detectSilence() {
  // 録音が終わっていれば何もしない
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;

  /* === 1. 時間波形を取得して RMS を算出 === */
  const dataArray = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(dataArray);

  let sumSq = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = (dataArray[i] - 128) / 128; // -1 ～ 1 に正規化
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / dataArray.length) * 100; // 0～100 目安

  /* === 2. 自動キャリブレーション（開始 1 秒間）=== */
  if (!autoCalibrated) {
    if (!calibrationStartTs) calibrationStartTs = Date.now();

    // 1 秒間 RMS の最大値を収集
    if (Date.now() - calibrationStartTs < 1000) {
      silenceThreshold = Math.max(silenceThreshold, rms);
    } else {
      // 1 秒経過したら 1.3 倍マージンを取って確定
      silenceThreshold = Math.max(5, silenceThreshold * 1.3);
      autoCalibrated = true;
    }
  }

  /* === 3. 無音判定 === */
  if (rms > silenceThreshold) {
    lastNonSilenceTime = Date.now();           // 音あり → タイマーリセット
  } else if (Date.now() - lastNonSilenceTime > silenceDuration) {
    console.log(`${silenceDuration} ms 無音 - 録音停止`);
    mediaRecorder.stop();                      // 2 秒無音 → stop
    return;
  }

  /* === 4. 次フレームへ === */
  silenceDetectionTimer = setTimeout(detectSilence, 16); // 約 60 fps
}

// 録音ボタンのローディング制御
function startRecordLoadingState() {
  if (!recordButton) return;
  recordButton.disabled = false; // 録音中も押せるようにする（停止のため）
  recordButton.classList.add("recording");
}

function endRecordLoadingState() {
  if (!recordButton) return;
  recordButton.disabled = false;
  recordButton.classList.remove("recording");
  recordButton.classList.remove("loading");
  // 元のマイクアイコンに戻す
  recordButton.innerHTML = '<i class="fa-solid fa-microphone"></i>';
}


// ================================
// 10) 録音停止ボタン (stop-button)
// ================================
const stopBtn = document.getElementById("stop-button");
if (stopBtn) {
  stopBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      // addMessage("録音停止しました。", "system");
    } else {
      // addMessage("録音中ではありません。", "system");
    }
  });
}


// ================================
// 11) 音声読み上げ開始
// ================================
document.getElementById("text-to-audio-button").addEventListener("click", async () => {
  if (!lastBotResponse) {
    addMessage("読み上げる返答がありません。", "system");
    return;
  }
  try {
    await playBotResponse(lastBotResponse);
  } catch (err) {
    console.error("Error in text-to-audio:", err);
    addMessage("読み上げ中にエラーが発生しました。", "system");
  }
});


// ================================
// 12) 音声ファイルを送信しテキスト変換
// ================================
async function uploadAudio(file) {
  try {
    
    const resp = await apiFetch(`${API_BASE}/audio-to-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioContent: await fileToBase64(file),
        user: userName
      })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Audio-to-Text API Error:", errText);
      throw new Error(`HTTP error: ${resp.status}`);
    }
    const data = await resp.json();
    if (!data.text) {
      throw new Error("音声認識結果が空です。");
    }
    return data.text;
  } catch (err) {
    console.error("Error in uploadAudio:", err);
    throw err;
  }
}


// ================================
// 13) ファイルをBase64に変換
// ================================
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


// ================================
// 14) チャットボット返答を音声再生
// ================================
async function playBotResponse(text) {
  try {
    
    const resp = await apiFetch(`${API_BASE}/text-to-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        user: userName
      }),
      auth: false
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Text-to-Audio API Error:", errText);
      throw new Error(`HTTP error: ${resp.status}`);
    }
    const audioBuffer = await resp.arrayBuffer();
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
    const audioUrl = URL.createObjectURL(blob);

    const audio = new Audio(audioUrl);
    audio.playsInline = true;
    audio.play();
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(audioUrl);
    });
  } catch (err) {
    console.error("Error playing bot response:", err);
    addMessage("返答内容の再生中にエラーが発生しました。", "system");
  }
}


// ================================
// 15) チャットメッセージ表示 (Markdown)
// ================================
 function addMessage(text, sender) {
   const area = document.getElementById("chat-messages");
   if (!area) return null;

   const div = document.createElement("div");
   div.className = `message ${sender}`;
   if (sender === "bot") div.innerHTML = marked.parse(text || "");
   else                  div.textContent = text;

   area.appendChild(div);

   if (sender === "bot") {
     div.scrollIntoView({block:"start"});
   } else {
     area.scrollTop = area.scrollHeight;
   }
   // cleanupChatMessages();
   return div;
 }

/* =====================================================
   bot メッセージに再生ボタンを付けるユーティリティ
   ===================================================== */
function attachTTSButton(botDiv, markdownText){
  if(!botDiv || botDiv.querySelector('.text-to-audio-btn')) return; // 重複防止
  const btn = document.createElement('button');
  btn.className = 'text-to-audio-btn';
  btn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
  btn.title = '読み上げ';
  btn.addEventListener('click', async e=>{
    e.stopPropagation();
    // playBotResponse(markdownText);
    try{
      await playBotResponse(markdownText);    // ← 音声のみ
    }catch(err){ console.error(err); }
  });
  botDiv.appendChild(btn);
}

// 16) チャットメッセージ削除 ― 直近 1 往復だけ残す
// ================================
function cleanupChatMessages() {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages) return;

  /* ① 最新の user / bot メッセージを 2 件取得 */
  const keeps = Array.from(
    chatMessages.querySelectorAll(".message.user, .message.bot")
  ).slice(-2);          // 後ろから 2 つ

  /* ② 画面に残すべき要素を Set にして高速判定 */
  const keepSet = new Set(keeps);

  /* ③ 全メッセージを走査し、keepSet 以外を削除 */
  Array.from(chatMessages.children).forEach(node => {
    if (!keepSet.has(node)) chatMessages.removeChild(node);
  });
}


// ================================
// 17) DOM構築後のイベント設定
// ================================
document.addEventListener("DOMContentLoaded", () => {
  /* --- (a) トークン残高をページ読込時に反映 --- */
  (async ()=>{
    const bal = await fetchRemainingTokens();
    if (bal !== null) setGlobalTokenBadge(bal);
  })();

  updateNavMenu();
  updateUploadButtonVisibility();
  // ログイン状態のチェック - 新規追加
  
  
  // ネットワーク監視を開始 - 新規追加
  setupNetworkMonitoring();
  
  // ナビゲーションのトグル
  const menuToggle = document.getElementById("menu-toggle");
  const headerNav = document.getElementById("header-nav");
  if (menuToggle && headerNav) {
    menuToggle.addEventListener("click", () => {
      headerNav.classList.toggle("open");
      setTimeout(() => {
      }, 500);
    });
  }

  // 送信ボタン
  const sendBtn = document.getElementById("send-button");
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      // 処理中なら何もしない
      if (isProcessingInput) return;
      
      const userInput = document.getElementById("user-input").value.trim();
      processInput(userInput, null);
    });
  }

  // エンターキー (Shift+Enterで改行)
  const userInputField = document.getElementById("user-input");
  if (userInputField) {
    userInputField.addEventListener("keydown", e => {
      if (e.isComposing) return;
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // 処理中なら何もしない
        if (isProcessingInput) return;
        
        const userInput = userInputField.value.trim();
        processInput(userInput, null);
      }
    });
  }

  // ====================================
  // アップロードモーダル関連
  // ====================================
  historyModalEl = document.getElementById("history-modal");
  const openUploadModalButton = document.getElementById("open-upload-modal-button");
  const uploadModal = document.getElementById("upload-modal");
  const closeUploadModalButton = document.getElementById("close-upload-modal");
  const confirmUploadButton = document.getElementById("confirm-upload-button");
  const fileInput = document.getElementById("file-input");
  const mediaUploadBtn = document.getElementById("confirm-media-upload-button");

  if (mediaUploadBtn) {
    mediaUploadBtn.addEventListener("click", async ()=>{
       const file = fileInput.files[0];
       if(!file){ alert("メディアファイルが選択されていません");return; }
  
       // 同名チェック
       const mediaList = await fetchMediaList();
       const exists = mediaList.some(f=>f.title===file.name);
       if (exists && !confirm("同じ名前のメディアが存在します。上書きしますか？")) return;
  
       try{
          const fd = new FormData();
          fd.append("title", file.name);
          fd.append("content", "");               // テキストは空
          fd.append("attached_file", file);       // multipart に乗せる
          const tenantId = parseInt(localStorage.getItem("userTenant"), 10) || 1;
          fd.append("tenant", tenantId);
  
           const res = await apiFetch(MEDIA_API_BASE, {
             method:"POST",
             headers:{},          // FormData なので Content-Type 自動
             body:fd
          });
          if(!res.ok){ throw new Error(await res.text()); }
          alert("メディアナレッジを登録しました");
          apiCache.clear('media-file-list');
       }catch(e){
          alert("アップロード失敗: "+e.message);
       }finally{
          uploadModal.style.display="none";
          fileInput.value="";
       }
    });
  }

  if (
    openUploadModalButton &&
    uploadModal &&
    closeUploadModalButton &&
    confirmUploadButton &&
    fileInput
  ) {
    // モーダルを開くボタン
    openUploadModalButton.addEventListener("click", () => {
      uploadModal.style.display = "flex";
    });

    // モーダルを閉じるボタン
    closeUploadModalButton.addEventListener("click", () => {
      uploadModal.style.display = "none";
      fileInput.value = "";
    });

    // 「アップロード」確定ボタン
    confirmUploadButton.addEventListener("click", async () => {
      const file = fileInput.files[0];
      if (!file) {
        alert("ファイルが選択されていません。");
        return;
      }

      try {
        const cacheKey = 'file-list';
        const cachedData = apiCache.get(cacheKey);
        
        if (cachedData) {
          let duplicateExists = false;
          let similarFiles = [];
          if (cachedData.data && Array.isArray(cachedData.data)) {
            // ファイル名から拡張子を除いた部分を取得する関数
            const getFileNameWithoutExtension = (filename) => {
              const lastDotIndex = filename.lastIndexOf('.');
              return lastDotIndex !== -1 ? filename.substring(0, lastDotIndex) : filename;
            };

            cachedData.data.forEach(doc => {
              if (doc.name) {
                const docNameBase = getFileNameWithoutExtension(doc.name).toLowerCase();
                const fileNameBase = getFileNameWithoutExtension(file.name).toLowerCase();

                if (doc.name === file.name) {
                  duplicateExists = true;
                } else if (
                  docNameBase.includes(fileNameBase) || 
                  fileNameBase.includes(docNameBase) ||
                  (docNameBase.length > 3 && fileNameBase.length > 3 && 
                   docNameBase.substring(0, 3) === fileNameBase.substring(0, 3))
                ) {
                  similarFiles.push(doc.name);
                }
              }
            });
          }
          if (duplicateExists) {
            if (!confirm("同じ名前のファイルが既に存在します。上書きしますか？")) {
              return;
            }
          }
          if (similarFiles.length > 0) {
            if (!confirm("似た名前のファイルが見つかりました: " + similarFiles.join(", ") + "。内容がバッティングしていないかご確認ください。続行しますか？")) {
              return;
            }
          }
        } else {
          const response = await apiFetch(`${API_BASE}/files/list`, { method:"GET" });
          if (response.ok) {
            const data = await response.json();
            apiCache.set('file-list', data, 5 * 60 * 1000); // 5分間キャッシュ
            
            let duplicateExists = false;
            let similarFiles = [];
            if (data.data && Array.isArray(data.data)) {
              // ファイル名から拡張子を除いた部分を取得する関数
              const getFileNameWithoutExtension = (filename) => {
                const lastDotIndex = filename.lastIndexOf('.');
                return lastDotIndex !== -1 ? filename.substring(0, lastDotIndex) : filename;
              };

              data.data.forEach(doc => {
                if (doc.name) {
                  const docNameBase = getFileNameWithoutExtension(doc.name).toLowerCase();
                  const fileNameBase = getFileNameWithoutExtension(file.name).toLowerCase();

                  if (doc.name === file.name) {
                    duplicateExists = true;
                  } else if (
                    docNameBase.includes(fileNameBase) || 
                    fileNameBase.includes(docNameBase) ||
                    (docNameBase.length > 3 && fileNameBase.length > 3 && 
                     docNameBase.substring(0, 3) === fileNameBase.substring(0, 3))
                  ) {
                    similarFiles.push(doc.name);
                  }
                }
              });
            }
            if (duplicateExists) {
              if (!confirm("同じ名前のファイルが既に存在します。上書きしますか？")) {
                return;
              }
            }
            if (similarFiles.length > 0) {
              if (!confirm("似た名前のファイルが見つかりました: " + similarFiles.join(", ") + "。内容がバッティングしていないかご確認ください。続行しますか？")) {
                return;
              }
            }
          }
        }
      } catch (err) {
        console.error("ファイル名のチェック中にエラーが発生しました:", err);
      }

      addMessage("ファイルをアップロードしています...", "system");
try {
        const result = await uploadFileAndRegisterToKnowledge(file);
        addMessage("アップロード完了。", "system");
        alert("アップロードが完了しました。");
        // ファイル一覧のキャッシュをクリア
        apiCache.clear('file-list');
      } catch (err) {
        addMessage("アップロード中にエラーが発生しました。", "system");
        console.error(err);
        alert("アップロード中にエラー：" + err.message);
      } finally {
        uploadModal.style.display = "none";
        fileInput.value = "";
      }
    });
  } else {
    console.error("アップロードモーダル関連要素が見つかりません。");
  }

  /* ===========================================================
     履歴モーダル関連（共通で使う DOM 要素を 1 回だけ宣言）
     =========================================================== */
  const historyBtn   = document.getElementById("history-button");   // ヘッダー
  const historyLink  = document.getElementById("history-link");     // サイドバー
  const historyModal = document.getElementById("history-modal");
  const historyList  = document.getElementById("history-list");
  historyListEl = document.getElementById("history-list");
  const closeHistoryModalBtn = document.getElementById("close-history-modal");

  /* 1) ヘッダーの「履歴」ボタン
       ── モーダルを開くだけ。チャット欄は触らない ── */
  if (historyBtn && historyModal) {
    historyBtn.addEventListener("click", async () => {
      /* ① 会話一覧をサーバから取り直す */
      await fetchConversationList().catch(()=>{});

      /* ② 履歴モーダルの中身を更新（選択会話 + 会話一覧） */
      await populateHistoryModal(conversationId || "");

      /* ③ モーダルを表示 */
      historyModal.style.display = "flex";
    });
  }

  /* 2) サイドバーのリンク */
  if (historyLink && historyModal) {
    historyLink.addEventListener("click", async (e) => {
      await fetchConversationList().catch(()=>{});
      await populateHistoryModal(conversationId || "");
      historyModal.style.display = "flex";
    });
  }

  /* 3) 閉じる (×) ボタン */
  if (closeHistoryModalBtn && historyModal) {
    closeHistoryModalBtn.addEventListener("click", () => {
      historyModal.style.display = "none";
    });
  }
  // 会話一覧、新規会話
  const conversationListRefreshBtn = document.getElementById("conversation-refresh");
  const newConversationBtn = document.getElementById("new-conversation-btn");

  if (conversationListRefreshBtn) {
    conversationListRefreshBtn.addEventListener("click", async () => {
      await fetchConversationList();
    });
  }
  if (newConversationBtn) {
    newConversationBtn.addEventListener("click", async () => {
      await createNewConversation();
    });
  }

  // ページアクセス時に会話一覧自動取得
  fetchConversationList();

  /*****************************************************
   * ファイル一覧：モーダル表示
   *****************************************************/
  const fileListLink = document.getElementById("file-list-link");
  const fileListModal = document.getElementById("file-list-modal");
  const fileListUl = document.getElementById("file-list");
  const closeFileListModalButton = document.getElementById("close-file-list-modal");

  if (fileListLink && fileListModal && fileListUl && closeFileListModalButton) {
    fileListLink.addEventListener("click", async () => {
      try {
        fileListUl.innerHTML = "";
        // キャッシュの確認
        const cacheKey = 'file-list';
        const cachedData = apiCache.get(cacheKey);
        
        if (cachedData) {
          displayFileList(cachedData);
        } else {
          const response = await apiFetch(`${API_BASE}/files/list`, {
            method: "GET"
          });
          if (!response.ok) {
            const errorText = await response.text();
            console.error("Get File List Error:", errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const difyData = response.ok ? await response.json() : { data: [] };
          // const data = await response.json();
          // キャッシュに保存（5分間）
          apiCache.set(cacheKey, difyData, 5*60*1000);
          await displayFileList(difyData);
        }
        
        fileListModal.style.display = "flex";
      } catch (error) {
        console.error("Error getting file list:", error);
        addMessage("ファイル一覧の取得中にエラーが発生しました。", "system");
      }
    });
    closeFileListModalButton.addEventListener("click", () => {
      fileListModal.style.display = "none";
    });
  }

  // ファイル一覧表示関数
  async function displayFileList(difyData) {
    const joined = difyData.data || [];

    if (!joined.length) {
      fileListUl.innerHTML = "<li>登録されているファイルはありません。</li>";
    } else {
      joined.forEach(doc => {
        const li = document.createElement("li");

        /* ---------- タイトル ---------- */
        const title = doc.title                 // メディア API
                   || doc.name                  // Dify
                   || `ID:${doc.id}`;

        /* ---------- 登録日 ---------- */
        let dateStr = "";
        if (doc.created_at){
          /* 文字列 ISO8601 or unixtime → どちらでも OK にする */
          const ts = typeof doc.created_at === "number"
                     ? doc.created_at * 1000
                     : Date.parse(doc.created_at);
          if (!isNaN(ts)){
            const dt = new Date(ts);
            dateStr = `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日`;
          }
        }

        li.textContent = `${title}${dateStr ? "  ("+dateStr+")" : ""}`;
        li.dataset.docId = doc.id;
        if (doc._src === "media"){
          /* ---------- メディア ---------- */
          li.style.cursor = "pointer";
          li.addEventListener("click", ()=>{
            const url = doc.custom_file_url || doc.attached_file;
            if (url) window.open(url, "_blank");
            else alert("URL が登録されていません");
          });
          /* メディアは削除ボタン無し */
        } else {
          /* ---------- Dify ---------- */
          li.addEventListener("click", async function(){
            await showFileDetail(this.dataset.docId);
          });
          addDeleteBtn(li, doc.id);
        }
        fileListUl.appendChild(li);
        updateUploadButtonVisibility();
      });
    }
  }

  function addDeleteBtn(li, docId){
    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.className   = "delete-file-btn";
    btn.addEventListener("click", async (e)=>{
      e.stopPropagation();
      if(!confirm("このファイルを削除しますか？")) return;
      const res = await apiFetch(`${API_BASE}/documents/${docId}`, { method:"DELETE" });
      if(res.ok){ li.remove(); apiCache.clear("file-list"); }
      else       alert("削除に失敗しました");
    });
    li.appendChild(btn);
  }

  async function showFileDetail(docId) {
  try {
    if (!docId) {
      alert("ファイル詳細を取得できません: 無効なドキュメントIDです");
      return;
    }
    
    // モーダル関連の要素を取得
    const modal = document.getElementById("file-detail-modal");
    const viewDiv = document.getElementById("file-detail-view");
    const editTextarea = document.getElementById("file-detail-edit");
    const closeBtn = document.getElementById("close-file-detail-modal");
    const toggleEditBtn = document.getElementById("toggle-edit-mode-button");
    const updateFileBtn = document.getElementById("update-file-button");
    
    if (!modal || !viewDiv || !editTextarea || !closeBtn || !toggleEditBtn || !updateFileBtn) {
      alert("ファイル詳細モーダル関連の要素が見つかりません。");
      return;
    }
    
    // 読み込み中の表示
    viewDiv.textContent = "ファイル内容を読み込み中...";
    editTextarea.value = "";
    
    // ドキュメントIDを設定
    modal.setAttribute("data-doc-id", docId);
    
    // モーダルを表示
    modal.style.display = "flex";
    
    // ファイル詳細のキャッシュキー
    const cacheKey = `file-detail-${docId}`;
    const cachedData = apiCache.get(cacheKey);
    
    let contentText = "";
    
    if (cachedData) {
      contentText = cachedData;
    } else {
      // docIdを明確にパラメータとして含むURLを使用
      const detailUrl = `https://sirupha.tsuji-090.workers.dev/files/detail?docId=${encodeURIComponent(docId)}`;
      
      const res = await apiFetch(detailUrl);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTPエラー! ステータス: ${res.status}`);
      }
      
      const data = await res.json();
      if (!data.data || data.data.length === 0) {
        throw new Error("ドキュメント内容が空です。");
      }
      
      contentText = data.data.map(seg => seg.content).join("\n---\n");
      
      // キャッシュに保存（10分間）
      apiCache.set(cacheKey, contentText, 10 * 60 * 1000);
    }
    
    // コンテンツを表示
    viewDiv.textContent = contentText;
    editTextarea.value = contentText;
    
    // 閉じるボタンのイベントを設定（既存のリスナーを削除して新規作成）
    closeBtn.onclick = null; // 既存のイベントをクリア
    closeBtn.onclick = function() {
      modal.style.display = "none";
    };
    
    // 編集モード切替ボタンを設定
    toggleEditBtn.onclick = null;
    toggleEditBtn.onclick = function() {
      if (viewDiv.style.display === "none") {
        // 閲覧モードに戻す
        viewDiv.style.display = "block";
        editTextarea.style.display = "none";
        this.textContent = "編集モード";
        updateFileBtn.style.display = "none";
      } else {
        // 編集モードにする
        viewDiv.style.display = "none";
        editTextarea.style.display = "block";
        this.textContent = "閲覧モード";
        updateFileBtn.style.display = "inline-block";
      }
    };
    
    // 更新ボタンのイベントを設定
    updateFileBtn.onclick = null;
    updateFileBtn.onclick = async function() {
      const currentDocId = modal.getAttribute("data-doc-id");
      
      const updatedText = editTextarea.value.trim();
      if (!updatedText) {
        alert("内容が空です。");
        return;
      }
      
      // ボタンを無効化
      this.disabled = true;
      const originalText = this.textContent;
      this.textContent = "更新中...";
      
      try {
        const resp = await apiFetch(`${API_BASE}/files/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docId: currentDocId,
            text: updatedText
          })
        });
        
        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`更新エラー: ${resp.status} - ${errText}`);
        }
        
        const responseData = await resp.json();
        
        if (responseData.success) {
          alert("更新が完了しました。");
          // 表示を更新
          viewDiv.textContent = updatedText;
          // 編集モードを終了
          viewDiv.style.display = "block";
          editTextarea.style.display = "none";
          toggleEditBtn.textContent = "編集モード";
          updateFileBtn.style.display = "none";
          
          // キャッシュを更新
          const cacheKey = `file-detail-${currentDocId}`;
          apiCache.set(cacheKey, updatedText, 10 * 60 * 1000);
        } else {
          alert("更新に失敗しました: " + (responseData.message || "不明なエラー"));
        }
      } catch (err) {
        alert("更新中にエラーが発生しました: " + err.message);
      } finally {
        // ボタンを元に戻す
        this.disabled = false;
        this.textContent = originalText;
      }
    };
    
  } catch (error) {
    alert(`ファイル詳細取得中にエラーが発生しました: ${error.message}`);
    
    // エラーが発生した場合はモーダルを閉じる
    const modal = document.getElementById("file-detail-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }
}
});

// ================================
// 18) 会話一覧を取得・表示
// ================================
async function fetchConversationList() {
  try {
    // キャッシュチェック
    const cacheKey = 'conversation-list';
    const cachedData = apiCache.get(cacheKey);
    
    if (cachedData) {
      displayConversationList(cachedData.data || []);
      return;
    }
    
    // ユーザーID取得（メールアドレスをIDとして使用）
    
    
    // 会話一覧を取得
    const resp = await apiFetch(
      `https://sirupha.tsuji-090.workers.dev/conversation-list?user=${encodeURIComponent(userName)}`,
      {
        method: "GET",
        timeout: 10000  // 10秒タイムアウト
      }
    );
    
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Conversation List Error:", errText);
      
      // エラーの場合でも空の会話一覧を表示
      displayConversationList([]);
      return;
    }
    
    const data = await resp.json();
    
    // キャッシュに保存（1分間）
    apiCache.set(cacheKey, data, 60 * 1000);
    
    // 会話一覧を表示
    displayConversationList(data.data || []);
  } catch (err) {
    console.error("Error fetching conversation list:", err);
    
    // エラーメッセージ表示（システムメッセージとして）
    addMessage("会話一覧の取得中にエラーが発生しました。", "system");
    
    // エラーの場合でも空の会話一覧を表示
    displayConversationList([]);
  }
}

function displayConversationList(conversations) {
  const conversationListUL = document.getElementById("conversation-list");
  if (!conversationListUL) return;

  // リストを空にする
  conversationListUL.innerHTML = "";

  // 会話がない場合
  if (!conversations.length) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "会話がありません";
    emptyItem.className = "empty-conversation";
    conversationListUL.appendChild(emptyItem);
    return;
  }

  // 各会話のリストアイテムを作成
  conversations.forEach(conv => {
    const li = document.createElement("li");
    
    // 会話名を設定（なければ「名称未設定」）
    li.textContent = conv.name || "(名称未設定)";
    
    // データ属性を設定（ID・名前）
    li.dataset.convId = conv.conversation_id || conv.id;
    li.dataset.convName = conv.name || "(名称未設定)";
    
    // 作成日時を表示（あれば）
    if (conv.created_at) {
      const date = new Date(conv.created_at * 1000);
      const formattedDate = date.toLocaleDateString('ja-JP');
      const timeElem = document.createElement("span");
      timeElem.className = "conversation-date";
      timeElem.textContent = formattedDate;
      li.appendChild(timeElem);
    }

    // クリックイベント設定
    li.addEventListener("click", async () => {
      // 既に選択されている場合は何もしない
      if (li.classList.contains("selected")) return;
      
      // 選択状態を更新
      const selected = conversationListUL.querySelector(".selected");
      if (selected) selected.classList.remove("selected");
      li.classList.add("selected");
      
      // 会話IDを設定して履歴取得
      conversationId = conv.id;
      await fetchConversationHistory(conv.id, li.dataset.convName);
    });

    // リストに追加
    conversationListUL.appendChild(li);
  });
}


// ================================
// 19) 新規会話作成
// ================================
async function createNewConversation() {
  try {
    // 読み込み中メッセージを表示
    clearChatMessages();
    addMessage("新規会話を作成しています...", "system");
    
    // ユーザーID取得
    
    
    // 新規会話作成API呼び出し
    const resp = await apiFetch(`${API_BASE}/conversations/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: userName
      })
    });
    
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Create New Conversation Error:", errText);
      
      // エラーメッセージを表示
      clearSystemMessages("新規会話を作成しています...");
      addMessage("新規会話の作成中にエラーが発生しました。", "system");
      return;
    }
    
    // 成功した場合
    const data = await resp.json();
    
    // 会話IDを設定
    conversationId = data.id || "";
    
    // 読み込み中メッセージを削除
    clearSystemMessages("新規会話を作成しています...");
    
    // 新規会話メッセージを表示
    addMessage("新規会話を開始しました。メッセージを入力してください。", "system");
    
    // 最初のメッセージがあれば表示
    if (data.first_message) {
      addMessage(data.first_message, "bot");
    }
    
    // 会話一覧のキャッシュをクリア
    apiCache.clear('conversation-list');
    
    // 会話一覧を再取得
    await fetchConversationList();
    
    // 新しく作成された会話を選択状態にする
    const conversationListUL = document.getElementById("conversation-list");
    if (conversationListUL) {
      const items = conversationListUL.querySelectorAll("li");
      items.forEach(item => {
        if (item.dataset.convId === conversationId) {
          // 選択状態を更新
          const selected = conversationListUL.querySelector(".selected");
          if (selected) selected.classList.remove("selected");
          item.classList.add("selected");
        }
      });
    }
  } catch (err) {
    console.error("Error creating new conversation:", err);
    
    // 読み込み中メッセージを削除
    clearSystemMessages("新規会話を作成しています...");
    
    // エラーメッセージを表示
    addMessage("新規会話の作成中にエラーが発生しました。", "system");
  }
}


// ================================
// 20) 会話履歴を取得しチャット更新
// ================================
async function fetchConversationHistory(convId, convName) {
  // 既に処理中なら何もしない
  if (isProcessingHistory) return;
  isProcessingHistory = true;
  
  try {
    // 会話IDがなければ空表示
    if (!convId) {
      if (historyListEl) {
        historyListEl.innerHTML = "<li>会話を選択または新規作成してください</li>";
      }
      clearChatMessages();
      isProcessingHistory = false;
      return;
    }
    
    // キャッシュチェック
    const cacheKey = `history-${convId}`;
    const cachedData = apiCache.get(cacheKey);
    
    if (cachedData) {
      displayHistoryFromData(cachedData, convName);
      isProcessingHistory = false;
      return;
    }
    
    // 読み込み中メッセージを表示
    clearChatMessages();
    addMessage("会話履歴を読み込み中...", "system");
    
    // ユーザーID取得
    
    
    // 履歴取得API呼び出し
    const resp = await apiFetch(
      `https://sirupha.tsuji-090.workers.dev/conversation-history?user=${encodeURIComponent(userName)}&conversation_id=${convId}`,
      {
        method: "GET",
        timeout: 15000  // 15秒タイムアウト
      }
    );
    
    if (!resp.ok) {
      // エラーメッセージを解析
      let friendlyMessage = "会話履歴の取得に失敗しました。新しいメッセージを送信して会話を継続できます。";
      let shouldRetry = false;
      
      try {
        const errorText = await resp.text();
        console.error("ConversationHistory error:", errorText);
        
        // サーバーエラーの場合
        if (resp.status >= 500) {
          friendlyMessage = "現在サーバーがメンテナンス中か一時的な問題が発生しています。新しいメッセージを送信することで会話を継続できます。";
          shouldRetry = historyRetryCount < MAX_HISTORY_RETRIES;
        }
      } catch (parseErr) {
        console.error("Error parsing error message:", parseErr);
      }
      
      // 読み込み中メッセージを削除（clearSystemMessagesの代わりに）
      removeSpecificSystemMessage("会話履歴を読み込み中...");
      
      // リトライするか決定
      if (shouldRetry) {
        historyRetryCount++;
        addMessage(`会話履歴の取得中にエラーが発生しました。再試行します (${historyRetryCount}/${MAX_HISTORY_RETRIES})...`, "system");
        
        // 1秒後に再試行
        setTimeout(() => {
          isProcessingHistory = false;
          fetchConversationHistory(convId, convName);
        }, 1000);
        return;
      } else {
        // リトライせず、エラーメッセージを表示
        historyRetryCount = 0;
        addMessage(friendlyMessage, "system");
        
        // 空の会話履歴として処理
        displayHistoryFromData({ data: [] }, convName);
        isProcessingHistory = false;
        return;
      }
    }
    
    // 成功した場合
    historyRetryCount = 0;
    const data = await resp.json();
    
    // キャッシュに保存（5分間）
    apiCache.set(cacheKey, data, 5 * 60 * 1000);
    
    // 読み込み中メッセージを削除（clearSystemMessagesの代わりに）
    removeSpecificSystemMessage("会話履歴を読み込み中...");
    
    // 履歴を表示
    displayHistoryFromData(data, convName);
  } catch (err) {
    console.error("Error fetching conversation history:", err);
    
    // 読み込み中メッセージを削除（clearSystemMessagesの代わりに）
    removeSpecificSystemMessage("会話履歴を読み込み中...");
    
    // エラーメッセージを表示
    let errorMessage = "会話履歴の取得中にエラーが発生しました。";
    
    // タイムアウトエラーの場合
    if (err.name === "TimeoutError" || err.message.includes("timeout")) {
      errorMessage = "サーバーからの応答がありません。しばらくしてからもう一度お試しください。";
    }
    
    addMessage(errorMessage, "system");
    
    // 空の会話履歴として処理
    displayHistoryFromData({ data: [] }, convName);
  } finally {
    isProcessingHistory = false;
  }
}

// 特定のテキストを持つシステムメッセージを削除する関数
function removeSpecificSystemMessage(text) {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages) return;
  
  const systemMessages = chatMessages.querySelectorAll(".message.system");
  systemMessages.forEach(msg => {
    if (msg.textContent === text) {
      chatMessages.removeChild(msg);
    }
  });
}

// 履歴データから表示を行う関数
function displayHistoryFromData(data, convName) {
  // チャットメッセージをクリア
  clearChatMessages();
  
  // データがあれば表示
  if (data.data && data.data.length > 0) {
    data.data.forEach(msg => {
      if (msg.query) addMessage(msg.query, "user");
      if (msg.answer) addMessage(msg.answer, "bot");
    });
  }

  // 会話名を表示
  if (convName) {
    addMessage(`「${convName}」に切り替えました`, "system");
  }
}

// チャットメッセージをクリアする関数
function clearChatMessages() {
  const chatMessages = document.getElementById("chat-messages");
  if (chatMessages) {
    chatMessages.innerHTML = "";
  }
}


// ================================
// 21) フォローアップ(質問候補)取得＆表示
// ================================
async function fetchSuggestedQuestions(messageId, maxRetry = 5) {
  /* maxRetry==0 ならネットワークを呼ばずに終了
     （stream 側で suggestions が入らなかった時のフォールバック抑止） */
  if (maxRetry === 0) return;
  try {
    // キャッシュキー
    const cacheKey = `suggested-${messageId}`;
    const cachedData = apiCache.get(cacheKey);
    
    if (cachedData) {
      displaySuggestedQuestions(cachedData.data || []);
      return;
    }
    
    /* ? ログイン中メールアドレス（＝ user ID）を付与 */
    
    const resp = await apiFetch(
      `/messages/${messageId}/suggested?user=${encodeURIComponent(userName)}`
    );
    /* 404 = まだ生成中 ⇒ 最大 maxRetry 回、指数バックオフで再試行 */
    if (resp.status === 404 && maxRetry > 0) {
      const cnt = (suggestionRetryMap.get(messageId) || 0) + 1;
      suggestionRetryMap.set(messageId, cnt);
      if (cnt > maxRetry) return;
      const delay = 800 * cnt;                   // 0.8s,1.6s,2.4s…
      console.debug(`suggested retry #${cnt} after ${delay}ms`);
      setTimeout(() => fetchSuggestedQuestions(messageId), delay);
      return;
    }
    /* 成功 or 別ステータスで来たらカウンタを掃除 */
    suggestionRetryMap.delete(messageId);
    if (!resp.ok){
       console.error("Get Suggested Questions:", await resp.text());
       return;
    }
    const data = await resp.json();
    
    // 30分間キャッシュ（質問候補は変わりにくいため）
    apiCache.set(cacheKey, data, 30 * 60 * 1000);
    
    displaySuggestedQuestions(data.data || []);
  } catch (err) {
    console.error("Error fetching suggestions:", err);
  }
}

function displaySuggestedQuestions(suggestions) {
  const container = document.getElementById("suggested-questions");
  if (!container) return;

  container.innerHTML = "";

  if (!suggestions.length) {
    /* 取得できない/サポートなし → コンテナ自体を非表示 */
    container.style.display = "none";
    return;
  }
  container.style.display = "block";

  suggestions.forEach(suggestion => {
    const btn = document.createElement("button");
    btn.textContent = suggestion;
    btn.style.margin = "4px";
    btn.style.padding = "6px 10px";
    btn.style.background = "#444";
    btn.style.color = "#fff";
    btn.style.border = "none";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
      processInput(suggestion, null);
    });
    container.appendChild(btn);
  });
}

// ログイン成功時の処理（トークン保存とタイマー設定）
function loginSuccess(data) {
  localStorage.setItem("accessToken", data.access);
  localStorage.setItem("refreshToken", data.refresh);
  localStorage.setItem("userId", data.user?.email ?? "");
  localStorage.setItem("userName", data.user.email || "");
  localStorage.setItem("userRoles", JSON.stringify(data.user.roles || []));
  // localStorage.setItem("userTenant", data.user.tenant || "");
  const tid = typeof data.user.tenant === "object"
              ? data.user.tenant.tenant_id
              : data.user.tenant;
  localStorage.setItem("userTenant", tid || "");
  localStorage.setItem("userTokenBalance", data.user.token_balance ?? 0);

  logoutAlertShown = false;
  updateBalanceDisplay(data.user.token_balance ?? 0);
  updateUploadButtonVisibility();
  
  // トークン更新タイマーを設定
  setupTokenRefreshTimer();
  enableUserInteractions();

  setTimeout(async () => {
    try {
      // キャッシュをクリアして最新データを取得
      apiCache.clear('conversation-list');
      
      // 会話一覧を取得して表示
      await fetchConversationList();
      
      // 最新の会話を読み込む（会話一覧が取得できていれば）
      const conversationListUL = document.getElementById("conversation-list");
      if (conversationListUL && conversationListUL.firstChild && 
          conversationListUL.firstChild.dataset && 
          conversationListUL.firstChild.dataset.convId) {
        // 一番上の会話を選択
        const firstConv = conversationListUL.firstChild;
        conversationId = firstConv.dataset.convId;
        await fetchConversationHistory(conversationId, firstConv.dataset.convName);
      } else {
        // 会話がない場合は新規会話を作成
        await createNewConversation();
      }
    } catch (err) {
      console.error("ログイン後の会話履歴更新エラー:", err);
      addMessage("会話履歴の更新中にエラーが発生しました。", "system");
    }
    removeSpecificSystemMessage("操作するにはログインが必要です。");
  }, 500); // 少し遅延させてUIの更新が完了するのを待つ
}

// ログインセッション維持のためのトークン更新タイマー設定
function setupTokenRefreshTimer() {
  // 既存のタイマーがある場合はクリア
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
  }
  
  // アクセストークンがある場合のみタイマーを設定
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    // 20分ごとにトークンをリフレッシュ
    tokenRefreshTimer = setInterval(async () => {
      const success = await tryRefresh();
      if (!success) {
        // リフレッシュ失敗時はタイマー停止
        clearInterval(tokenRefreshTimer);
        tokenRefreshTimer = null;
        // 必ずしもすぐにモーダルを表示する必要はない
        console.warn("トークンの自動更新に失敗しました。");
      }
    }, 20 * 60 * 1000); // 20分
  }
}

function updateNavMenu() {
  const loginLink = document.getElementById("login-link");
  const mypageLink = document.getElementById("mypage-link");
  const accessToken = localStorage.getItem("accessToken");

  if (loginLink) {
    loginLink.style.display = accessToken ? "none" : "inline-block";
  }

  if (mypageLink) {
    mypageLink.style.display = accessToken ? "inline-block" : "none";
  }
}

function showMypageModal() {
  const mypageModal = document.getElementById("mypage-modal");
  const emailSpan = document.getElementById("user-email");
  const rolesSpan = document.getElementById("user-roles");
  const tenantSpan = document.getElementById("user-tenant");
  const tokenSpan = document.getElementById("user-token-balance");

  if (!mypageModal || !emailSpan || !rolesSpan || !tenantSpan || !tokenSpan) {
    console.error("マイページモーダルの要素が見つかりません。");
    return;
  }

  const email = localStorage.getItem("userName") || "";
  const roles = JSON.parse(localStorage.getItem("userRoles") || "[]");
  const tenant = localStorage.getItem("userTenant") || "";
  const tokenBalance = localStorage.getItem("userTokenBalance") || "";

  emailSpan.textContent = email;
  rolesSpan.textContent = roles.join(", ");
  tenantSpan.textContent = tenant;
  tokenSpan.textContent = tokenBalance;

  mypageModal.style.display = "flex";
}

function logoutUser() {
  // 既存のタイマーがある場合はクリア
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
  
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userName");
  localStorage.removeItem("userRoles");
  localStorage.removeItem("userTenant");
  localStorage.removeItem("userTokenBalance");
  
  // キャッシュをクリア
  apiCache.clear();
  
  updateNavMenu();
  setupUnauthorizedInterceptors();
  
  const mypageModal = document.getElementById("mypage-modal");
  if (mypageModal) {
    mypageModal.style.display = "none";
  }
  
  if (!logoutAlertShown) {
    alert("ログアウトしました。");
    logoutAlertShown = true;
  }
  
  // チャットメッセージをクリア
  clearChatMessages();
  addMessage("ログアウトしました。操作するにはログインが必要です。", "system");

  updateUploadButtonVisibility();
  setGlobalTokenBadge("--");
  
  // ここを追加: ログアウト後すぐにログインモーダルを表示
  showLoginModal();
}

async function tryRefresh() {
  const refresh = localStorage.getItem("refreshToken");
  if (!refresh) return false;

  try {
    const resp = await fetch("https://sirupha.tsuji-090.workers.dev/app/api/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh })
    });
    
    if (!resp.ok) {
      return false;
    }

    const data = await resp.json();
    localStorage.setItem("accessToken", data.access);
    if (data.refresh) {
      localStorage.setItem("refreshToken",
data.refresh);
    }
    return true;
  } catch (error) {
    console.error("トークンリフレッシュエラー:", error);
    return false;
  }
}

// 改善されたapiFetch関数
async function apiFetch(url, options = {}) {
  /*** URL 正規化 ***/
  url = url.startsWith("http")
        ? url
        : API_BASE + (url.startsWith("/") ? "" : "/") + url;

  /*** デフォルトヘッダ ***/
  const opt = { ...options };
  opt.headers = { ...(opt.headers||{}) };

  /* --- Content-Type は
         POST/PUT/PATCH かつ FormData 以外 の時だけ自動付与 --- */
  const m = (opt.method || "GET").toUpperCase();
  const needsJson =
        !opt.headers["Content-Type"] &&
        !opt.headers["content-type"] &&     // 大文字小文字両対応
        ["POST","PUT","PATCH"].includes(m) &&
        !(opt.body instanceof FormData);
  if (needsJson) opt.headers["Content-Type"] = "application/json";

  /*** 認証ヘッダ ***/
  /* opt.auth を true にした時だけトークンを付与する方式に変更。
     何も指定しなければ “トークン無しでそのまま実行” となる */
  if (opt.auth === true) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      opt.headers.Authorization = `Bearer ${token}`;
    } else {
      console.warn("アクセストークンが無いまま auth:true で呼ばれました");
    }
  }

  return executeFetch(url, opt);
}

function showLoginModal() {
  const loginModal = document.getElementById("login-modal");
  if (!loginModal) return;

  loginModal.style.display = "flex";

  // 未ログイン状態ではモーダルを閉じられないようにする
  const closeBtn = document.getElementById("close-login-modal");
  if (closeBtn) {
    closeBtn.style.display = "none";
  }

  // 入力欄と送信ボタンを無効化
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-button");
  if (userInput) userInput.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  
  // モーダル外クリックでもログインモーダルを閉じられないようにする
  loginModal.onclick = function(e) {
    if (e.target === loginModal) {
      e.stopPropagation();
      // アラートで表示するので以下の行を削除
      // addMessage("操作するにはログインが必要です。", "system");
      alert("操作するにはログインが必要です。"); // 代わりにアラートで表示
    }
  };
}

function hideLoginModal() {
  const loginModal = document.getElementById("login-modal");
  if (loginModal) {
    loginModal.style.display = "none";
  }

  const closeBtn = document.getElementById("close-login-modal");
  if (closeBtn) {
    closeBtn.style.display = "inline-block";
  }

  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-button");
  if (userInput) userInput.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
}

// ファイル削除用の関数（削除APIへのリクエスト）
async function deleteFile(docId) {
  try {
    // ここでは、DELETEリクエストで削除を実行する例です。
    // ※エンドポイントのURLは、環境に合わせて修正してください。
    const response = await apiFetch(`https://sirupha.tsuji-090.workers.dev/datasets/your_dataset_id/documents/${docId}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }
    alert("ファイルが削除されました。");
    
    // ファイル一覧キャッシュをクリア
    apiCache.clear('file-list');
  } catch (err) {
    console.error("ファイル削除エラー:", err);
    alert("ファイル削除に失敗しました: " + err.message);
  }
}

// ================================
// ログイン状態のチェック (新規追加)
// ================================
function checkLoginStatus() {
  const token = localStorage.getItem("accessToken");
  
  if (!token) {
    showLoginModal();
    setupUnauthorizedInterceptors();
  } else {
    // トークンの有効性を確認（オプション）
    validateTokenSilently();
    // トークン更新タイマーを設定
    setupTokenRefreshTimer();
    // ユーザー操作を有効化
    enableUserInteractions();
  }
  
  updateNavMenu();
}

// 保存されたトークンの有効性を静かに確認
async function validateTokenSilently() {
  try {
    // 軽量なAPIエンドポイントを叩いて有効性確認
    const token = localStorage.getItem("accessToken");
    if (!token) return;                // ← トークンが無ければチェックしない
    const resp = await apiFetch("/app/api/tokens/balance", {
      method : "GET",
      // ここは手動でトークンを渡し、apiFetch には二重付与させない
      auth   : false,
      headers: { Authorization: `Bearer ${token}` }
    });

    /* 401 → まずトークンを再発行。それでもダメならログインを促す */
    if (resp.status === 401) {
      const refreshed = await tryRefresh();   // アクセストークン更新
      if (!refreshed) {
        logoutUser();
        showLoginModal();                     // ただし logout はしない
        return;
      }
      return;  // リフレッシュ成功ならそのまま続行
    }
  } catch (error) {
    console.error("Token validation error:", error);
    // エラー時もそのまま続行
  }
}

// 未ログイン時にユーザー操作を傍受してログインモーダルを表示
function setupUnauthorizedInterceptors() {
  const interceptElements = [
    document.getElementById("send-button"),
    document.getElementById("record-button"),
    document.getElementById("open-upload-modal-button"),
    document.getElementById("file-list-link"),
    document.getElementById("new-conversation-btn"),
    document.getElementById("conversation-refresh")
  ];
  
  interceptElements.forEach(elem => {
    if (elem) {
      // 元のclickイベントを保存
      const originalClick = elem.onclick;
      
      // 新しいclickイベントで上書き
      elem.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        alert("操作するにはログインが必要です。"); // チャット欄ではなくアラートで表示
        showLoginModal();
      };
    }
  });
  
  // フォーム送信に対する傍受
  const userInput = document.getElementById("user-input");
  if (userInput) {
    userInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        alert("メッセージを送信するにはログインが必要です。"); // チャット欄ではなくアラートで表示
        showLoginModal();
      }
    }, true);
  }
}

// ユーザー操作を有効化
function enableUserInteractions() {
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-button");
  if (userInput) userInput.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  
  // 傍受していたイベントを元に戻す
  const elements = [
    document.getElementById("send-button"),
    document.getElementById("record-button"),
    document.getElementById("open-upload-modal-button"),
    document.getElementById("file-list-link"),
    document.getElementById("new-conversation-btn"),
    document.getElementById("conversation-refresh")
  ];
  
  elements.forEach(elem => {
    if (elem) {
      // イベントリスナーをクリア（より確実な方法）
      elem.onclick = null;
      
      // 元々のイベントリスナーが設定されていた場合は再設定
      if (elem.id === "send-button") {
        elem.addEventListener("click", () => {
          // 処理中なら何もしない
          if (isProcessingInput) return;
          
          const userInput = document.getElementById("user-input").value.trim();
          processInput(userInput, null);
        });
      }
      
      // 他のボタンについても同様に元々の機能を再設定する
      // 例：record-buttonなど必要に応じて
      updateUploadButtonVisibility();
    }
  });
  
  // キーボードイベントも元に戻す
  const inputField = document.getElementById("user-input");
  if (inputField) {
    // 既存のイベントリスナーを一度削除（重複防止）
    inputField.removeEventListener("keydown", function(){});
    
    // 正しいイベントリスナーを設定し直す
    inputField.addEventListener("keydown", e => {
      if (e.isComposing) return;
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // 処理中なら何もしない
        if (isProcessingInput) return;
        
        const userInput = inputField.value.trim();
        processInput(userInput, null);
      }
    });
  }
}

// ネットワーク状態の監視
function setupNetworkMonitoring() {
  window.addEventListener('online', () => {
    console.log('オンラインに戻りました');
    addMessage("インターネット接続が回復しました。", "system");
    // 必要ならキャッシュをクリアして最新データを取得
    apiCache.clear('conversation-list');
    fetchConversationList();
  });
  
  window.addEventListener('offline', () => {
    console.log('オフラインになりました');
    addMessage("インターネット接続が切断されました。一部機能が利用できません。", "system");
  });
}

// システムメッセージを削除する関数 - 追加して問題を解決
function clearSystemMessages(text) {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages) return;
  
  const systemMessages = chatMessages.querySelectorAll(".message.system");
  systemMessages.forEach(msg => {
    // 特定のテキストを含むメッセージのみ削除
    if (msg.textContent === text) {
      chatMessages.removeChild(msg);
    }
  });
}

// 全てのシステムメッセージを削除する関数（オプション）
function clearAllSystemMessages() {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages) return;
  
  const systemMessages = chatMessages.querySelectorAll(".message.system");
  systemMessages.forEach(msg => {
    chatMessages.removeChild(msg);
  });
}

// ================================
// デバッグ機能とエラー対策
// ================================

// API状態をチェックする関数
async function checkApiStatus() {
  try {
    const resp = await fetch("https://sirupha.tsuji-090.workers.dev/api-status", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("accessToken") || ""}`
      }
    });
    
    if (!resp.ok) {
      console.error("API status check failed:", await resp.text());
      return false;
    }
    
    const data = await resp.json();
    console.log("API status:", data);
    
    // Dify APIの状態を確認
    const difyApiStatus = data.api_checks?.parameters?.status || "unknown";
    return difyApiStatus === "ok";
  } catch (err) {
    console.error("Error checking API status:", err);
    return false;
  }
}

// クライアントサイドのAPI呼び出しをデバッグするラッパー関数
async function debugApiCall(url, options = {}) {
  console.log(`?? API呼び出し: ${url}`);
  console.log("オプション:", options);
  
  const startTime = performance.now();
  
  try {
    const response = await fetch(url, options);
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`? API応答時間: ${duration.toFixed(2)}ms`);
    console.log(`応答ステータス: ${response.status}`);
    
    // ステータスコードに応じたログ
    if (response.ok) {
      console.log("成功: 正常なレスポンスを受信");
    } else {
      console.error(`エラー: HTTP ${response.status} - ${response.statusText}`);
      
      try {
        // エラーレスポンスの中身を確認
        const errorText = await response.text();
        console.error("エラー詳細:", errorText);
        
        // JSONかどうか確認
        try {
          const errorJson = JSON.parse(errorText);
          console.error("エラーJSON:", errorJson);
        } catch (e) {
          console.log("エラーレスポンスはJSONではありません");
        }
      } catch (err) {
        console.error("エラーレスポンスの読み取りに失敗:", err);
      }
    }
    
    // レスポンスのクローンを作成して返す（元のレスポンスはすでに消費されている可能性がある）
    return response.clone();
  } catch (err) {
    console.error(`? API呼び出し失敗: ${err.message}`, err);
    throw err;
  }
}

// API呼び出しの改良バージョン
async function improvedApiFetch(url, options = {}) {
  // デバッグモードなら詳細なログを出力
  const isDebugMode = localStorage.getItem("debugMode") === "true";
  
  if (isDebugMode) {
    return debugApiCall(url, options);
  }
  
  // ネットワークが切断されている場合
  if (!navigator.onLine) {
    console.error("ネットワーク接続がありません");
    throw new Error("Network is offline");
  }
  
  // トークンの取得
  const token = localStorage.getItem("accessToken");
  if (!token && !url.includes("/login")) {
    console.warn("認証トークンがありません");
    throw new Error("No authentication token");
  }
  
  // リクエストヘッダーの設定
  const headers = {
    ...(options.headers || {}),
    "Authorization": token ? `Bearer ${token}` : "",
    "Content-Type": options.headers?.["Content-Type"] || "application/json"
  };
  
  // タイムアウト設定
  const timeout = options.timeout || 30000; // デフォルト30秒
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  // フェッチオプションの構築
  const fetchOptions = {
    ...options,
    headers,
    signal: controller.signal
  };
  
  try {
    // APIリクエスト実行
    const response = await fetch(url, fetchOptions);
    
    // ステータスコードが401（認証エラー）かつログインページでない場合
    if (response.status === 401 && !url.includes("/login")) {
      // トークンリフレッシュを試みる
      const refreshSuccess = await tryRefresh();
      
      if (refreshSuccess) {
        // 新しいトークンでリトライ
        headers.Authorization = `Bearer ${localStorage.getItem("accessToken")}`;
        return fetch(url, { ...fetchOptions, headers });
      } else {
        console.error("トークンのリフレッシュに失敗しました");
        throw new Error("Authentication failed");
      }
    }
    
    return response;
  } catch (err) {
    // タイムアウトエラー
    if (err.name === "AbortError") {
      console.error(`タイムアウト: ${timeout}ms経過`);
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    
    // その他のエラー
    console.error("API呼び出しエラー:", err);
    throw err;
  } finally {
    // タイムアウトIDをクリア
    clearTimeout(timeoutId);
  }
}

// デバッグ用モックデータの生成
function generateMockConversationHistory(conversationId) {
  return {
    data: [
      {
        id: "mock-msg-1",
        conversation_id: conversationId,
        query: "これはテスト会話です",
        answer: "こんにちは！APIに接続できないため、テスト会話を表示しています。"
      },
      {
        id: "mock-msg-2",
        conversation_id: conversationId,
        query: "APIの問題はいつ解決しますか？",
        answer: "現在APIサーバーの状態を確認中です。一時的な問題の可能性がありますので、しばらく時間をおいてから再度お試しください。"
      }
    ],
    has_more: false,
    limit: 20
  };
}

// デバッグ用モックデータ（会話一覧）
function generateMockConversationList() {
  const now = Math.floor(Date.now() / 1000);
  return {
    data: [
      {
        id: "mock-conv-1",
        name: "テスト会話1",
        created_at: now - 3600, // 1時間前
        updated_at: now - 1800  // 30分前
      },
      {
        id: "mock-conv-2",
        name: "テスト会話2",
        created_at: now - 86400, // 1日前
        updated_at: now - 43200  // 12時間前
      }
    ],
    has_more: false,
    limit: 20
  };
}

// 現在のキャッシュ内容を表示
function showApiCache() {
  console.log("現在のAPIキャッシュ内容:");
  
  if (!apiCache || !apiCache.data) {
    console.log("キャッシュが初期化されていないか空です");
    return;
  }
  
  const cacheEntries = [];
  apiCache.data.forEach((value, key) => {
    const ttl = apiCache.ttl.get(key);
    const remainingTime = ttl ? Math.max(0, ttl - Date.now()) : 0;
    
    cacheEntries.push({
      key,
      // valueの概要（完全な内容は大きすぎる可能性がある）
      valuePreview: typeof value === 'object' ? 
        `[Object] (${JSON.stringify(value).substring(0, 50)}...)` : 
        value,
      ttl: new Date(ttl).toLocaleTimeString(),
      remainingSecs: Math.floor(remainingTime / 1000),
      expired: Date.now() > ttl
    });
  });
  
  console.table(cacheEntries);
}

async function synthesizeSpeech(text){
  const user = localStorage.getItem("userName") || "guest";
  const resp = await apiFetch(`${API_BASE}/text-to-audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, user }),
    auth: false
  });
  if(!resp.ok){                   // 400 なら音声生成を諦める
    console.warn("TTS skip:", await resp.text());
    return null;
  }
  return resp.arrayBuffer();
}

function prepareRandomVideoSegment(audioDur){
  const vd = avatarVideo.duration;
  const random = (max)=>Math.random()*Math.max(0,max);
  avatarVideo.loop = vd < audioDur;
  avatarVideo.currentTime = avatarVideo.loop
      ? random(vd-1)
      : random(vd - audioDur - 1);
  if(!avatarVideo.loop){
    setTimeout(()=>avatarVideo.pause(), audioDur*1000);
  }
}
function stopAvatarPlayback(){
  if(avatarVideo){
    avatarVideo.pause();
    avatarVideo.loop = false;
    avatarVideo.querySelector("source").src = "avatar1.mp4";
    avatarVideo.load();
    avatarVideo.setAttribute("poster","avatar.png");
    avatarVideo.muted = false;
  }
  if(avatarAudio){ avatarAudio.pause(); }
  isAvatarPlaying = false;
}

async function playAvatarWithResponse(markdown){
  const video = document.getElementById("avatar-video");
  video.muted = true;
  const TIMEOUT_MS = 4000;
  if (audioContext && audioContext.state === "suspended") {
      await audioContext.resume();
  }
  avatarVideo = document.getElementById("avatar-video");
  avatarVideo.muted = true;
  avatarVideo.playsInline = true;
  if (isAvatarPlaying) stopAvatarPlayback();

  /* ――― ① 動画ソースをランダムに差し替え ――― */
  const files = ["avatar1.mp4","avatar2.mp4","avatar3.mp4"];
  const choose = files[Math.floor(Math.random() * files.length)];
  const vSrc   = avatarVideo.querySelector("source");
  vSrc.src = choose;
  avatarVideo.load();                       // <video> をリロード

  /* ――― ② TTS 音声を生成 ――― */
  const clean = cleanTextForSpeech(markdown).slice(0, 500); // 長過ぎると TTS が失敗するため 500 文字で打ち切り
  const wav   = await synthesizeSpeech(clean);
  if (!wav) { console.warn("TTS skip"); return; }
  // iOS でも確実に鳴るよう「隠し <audio>」を 1 つだけ body にぶら下げる
  const audioUrl = URL.createObjectURL(new Blob([wav], {type:"audio/mpeg"}));

  if (!avatarAudio) {                       // 初回だけ生成
    avatarAudio = document.createElement("audio");
    avatarAudio.style.display = "none";     // 画面には出さない
    avatarAudio.setAttribute("playsinline", "");
    document.body.appendChild(avatarAudio);
  } else {
    avatarAudio.pause();                    // 旧音声を停止
  }

  avatarAudio.src = audioUrl;
  avatarAudio.load();                       // iOS は明示的 load() が安全

  /* ――― ③ audio / video の読み込み完了を待つ ――― */
  const waitLoad = Promise.all([
    new Promise(res => {
      if (avatarVideo.readyState >= 1) res();
      else avatarVideo.addEventListener("loadedmetadata", res, { once:true });
    }),
    new Promise(res => {
      if (avatarAudio.readyState >= 3) res();          // canplaythrough
      else avatarAudio.addEventListener("canplaythrough", res, { once:true });
    })
  ]);

  // ── “video or audio never becomes ready” guard ──
  await Promise.race([
    waitLoad,
    new Promise((_,rej)=>setTimeout(()=>rej(new Error("media-timeout")), TIMEOUT_MS))
  ]);

  /* ――― ④ 同期して再生 ――― */
  prepareRandomVideoSegment(avatarAudio.duration);     // 動画の開始位置・ループ設定
  try {
    await avatarVideo.play();
    await avatarAudio.play();        // ← play() が拒否されたら catch
  } catch(e){
    console.warn("iOS audio blocked:", e);
    showTapToPlayOverlay(async () => {   // ★オーバーレイで音声＋動画を再生
      try{
        if (avatarVideo.paused) await avatarVideo.play();
        await avatarAudio.play();
      }catch(err){ console.error("manual-play error:", err); }
    });
  }
  isAvatarPlaying = true;
  avatarAudio.onended = stopAvatarPlayback;
}

function cleanTextForSpeech(md){
  // コードブロックと行頭>引用を除去 → 改行／強調をスペースに
  return md
    .replace(/```[\s\S]*?```/g, " ")      // コード
    .replace(/^>.*$/gm, " ")              // blockquote
    .replace(/[_*~`>#-]/g, "")            // 記号類
    .replace(/\s+/g, " ")                 // 連続空白
    .trim();
}

/* === アスペクト比に応じて最適化 === */
function fitAvatarToScreen(){
  const video = document.getElementById("avatar-video");
  if(!video) return;

  const container = video.parentElement;
  const cRatio = container.clientWidth / container.clientHeight;
  const vRatio = video.videoWidth  / video.videoHeight;

  if (vRatio > cRatio){          // 横に長い ⇒ 幅100%
    video.style.width  = "100%";
    video.style.height = "auto";
  }else{                         // 縦に長い or 正方形 ⇒ 高さ100%
    video.style.width  = "auto";
    video.style.height = "100%";
  }
}

/* メタデータが読めた瞬間 & 画面リサイズ時 */
document.addEventListener("DOMContentLoaded", ()=>{
  const video = document.getElementById("avatar-video");
  if(!video) return;
  video.addEventListener("loadedmetadata", fitAvatarToScreen, { once:true });
});
window.addEventListener("resize", fitAvatarToScreen);


async function fetchBlocking(payload, botDiv, attempt=0){
  if (attempt>MAX_RETRY){
    botDiv.innerHTML = "? 返答を取得できませんでした。もう一度お試しください。";
    return "";
  }
  const res = await apiFetch(`${API_BASE}/chat-messages`, {
      method : "POST",
      headers: { "Content-Type":"application/json","Accept":"application/json" },
      body   : JSON.stringify({...payload, response_mode:"blocking" }),
      timeout: 70000
  }).catch(()=>null);

  if(!(res && res.ok)){               // 失敗: バックオフして再送
    await new Promise(r=>setTimeout(r, 800*(attempt+1)));
    return fetchBlocking(payload, botDiv, attempt+1);
  }
  const j = await res.json();
  botDiv.innerHTML = DOMPurify.sanitize(marked.parse(j.answer??""));
  guessMediaCitations(j.answer??"");
  (j.retriever_resources||[]).forEach(addCitation);
  attachTTSButton(botDiv, j.answer??"");
  return j.answer??"";
}

/* 中央オーバーレイを表示して iOS のユーザー操作を拾う */
function showTapToPlayOverlay(onTap){
  /* ===== PC ではオーバーレイを出さず直ちに再生 ===== */
  const ua = navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(ua);
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (!isiOS || !isTouchDevice){      // ← iOS 以外（＝PC等）はここで終了
    onTap();                          // そのまま再生を試みる
    return;
  }
  // 旧オーバーレイがあれば削除
  const old = document.getElementById('tap-to-play');
  if (old) old.remove();

  // オーバーレイ全体
  const ov = document.createElement('div');
  ov.id = 'tap-to-play';
  ov.style.cssText = `
    position:fixed; inset:0;
    display:flex; justify-content:center; align-items:center;
    background:rgba(0,0,0,.4); z-index:9999;
  `;

  /* ----------   ここが今回の変更ポイント   ---------- */
  // 既存 HTML と同じ構造のボタンをそのまま挿入
  ov.innerHTML = `
    <!-- 音声読み上げボタン -->
    <button class="overlay-audio-button" style="
      font-size:48px; width:96px; height:96px;
      border-radius:50%; border:none; background:#fff; cursor:pointer;
      display:flex; justify-content:center; align-items:center;
    ">
      <i class="fa-solid fa-play"></i>
    </button>
  `;
  /* --------------------------------------------------- */

  // ボタンがクリックされたら再生をリトライ
  ov.querySelector('.overlay-audio-button').addEventListener('click', async ()=>{
    ov.remove();           // オーバーレイを閉じる
    await onTap();         // 音声＋動画を再生
  });

  document.body.appendChild(ov);
}

async function populateHistoryModal(convId){
  historyListEl.innerHTML = "<li>読み込み中…</li>";

  /* ① キャッシュ優先 */
  const ck = `history-${convId}`;
  let data = apiCache.get(ck);

  /* ② なければ API 取得 */
  if(!data){
    const email = localStorage.getItem("userName") || "anonymous";
    const resp  = await apiFetch(
      `${API_BASE}/conversation-history?user=${encodeURIComponent(email)}&conversation_id=${convId}`,
      { method:"GET", timeout:15000 }
    );
    if(!resp.ok){
      historyListEl.innerHTML = "<li>取得に失敗しました</li>";
      return;
    }
    data = await resp.json();
    apiCache.set(ck, data, 5*60*1000);           // 5 分キャッシュ
  }

  /* ③ モーダルに描画 */
  historyListEl.innerHTML = "";
  if(Array.isArray(data.data) && data.data.length){
    data.data.forEach(msg=>{
      const li = document.createElement("li");
      /* --- 質問：インライン Markdown を HTML へ --- */
      const userHtml   = DOMPurify.sanitize(marked.parseInline(msg.query || ""));
      /* --- 回答：全文 Markdown を HTML へ --- */
      const answerHtml = DOMPurify.sanitize(marked.parse(msg.answer  || ""));
      li.innerHTML =
        `<strong>あなた：</strong> ${userHtml}<br>` +
        `<strong>SIRUSIRU：</strong><div class="hist-answer">${answerHtml}</div>`;
      historyListEl.appendChild(li);
    });
  }else{
    historyListEl.innerHTML = "<li>履歴がありません</li>";
  }
}

/* ==========================================================
   iOS / iPadOS の自動再生制限を解除するユーティリティ
   ========================================================== */
let iOSMediaUnlocked = false;
function unlockIOSMedia() {
  if (iOSMediaUnlocked) return;
  iOSMediaUnlocked = true;

  /* --- (1) Web Audio を resume -------------------------------- */
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch (_) {}

  /* --- (2) 無音 0.05 s の MP3 をミュート再生 ------------------ */
  const silent = new Audio(
    "data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAA=="
  );
  silent.volume = 0;
  silent.play().catch(() => {});
}

/* 1 回だけ実行：touchstart / click / pointerdown いずれかで */
["touchstart","pointerdown","click"].forEach(ev =>
  window.addEventListener(ev, unlockIOSMedia, { once:true, capture:true })
);


/* ────────── お問い合わせ mailto リンク ────────── */
document.getElementById("contact-mail-link")?.addEventListener("click", e => {
  e.preventDefault();

  /* ① ログイン情報を取得 */
  const email   = localStorage.getItem("userName")        || "";
  const roles   = JSON.parse(localStorage.getItem("userRoles")||"[]").join(", ");
  const tenant  = localStorage.getItem("userTenant")       || "";
  const balance = localStorage.getItem("userTokenBalance") || "";

  /* ② 本文テンプレート */
  const body = [
    "◆ ログイン情報",
    `メールアドレス : ${email}`,
    `ロール         : ${roles}`,
    `テナント       : ${tenant}`,
    `トークン残高   : ${balance}`,
    "",
    "お問い合わせ内容を入力してください。原則、3営業日以内で返信します。"
  ].join("\n");

  /* ③ 件名・本文を URI エンコード (%20 でスペースを保持) */
  const subjectEnc = encodeURIComponent("SIRUSIRUからの問い合わせ");
  const bodyEnc = encodeURIComponent(body).replace(/%0A/g, "%0D%0A");

  /* ④ mailto リンクを生成してメーラーを呼び出し */
  window.location.href =
    `mailto:info@noce-creative.co.jp?subject=${subjectEnc}&body=${bodyEnc}`;
});

function hasUploadPrivilege() {
  const roles = JSON.parse(localStorage.getItem("userRoles") || "[]");
  return roles.some(r => {
    const tail = r.split("_").pop();  // 「会社名_社長」→ "社長"
    return ALLOWED_UPLOAD_ROLES.includes(tail);
  });
}

function updateUploadButtonVisibility() {
  const btn = document.getElementById("open-upload-modal-button");
  if (btn) btn.style.display = hasUploadPrivilege() ? "inline-block" : "none";
  const can = hasUploadPrivilege();

  /* アップロード */
  const uploadBtn = document.getElementById("open-upload-modal-button");
  if (uploadBtn) uploadBtn.style.display = can ? "inline-block" : "none";

  /* ファイル詳細 ─ 編集系 */
  const editToggle = document.getElementById("toggle-edit-mode-button");
  const updateBtn  = document.getElementById("update-file-button");
  if (editToggle) editToggle.style.display = can ? "inline-block" : "none";
  if (updateBtn)  updateBtn.style.display  = "none";           // 初期は常に隠す

  /* ファイル削除ボタン（一覧 & 詳細） */
  document.querySelectorAll(".delete-file-btn, .delete-file-button").forEach(b => {
    b.style.display = can ? "inline-block" : "none";
  });
  const deleteBtn = document.getElementById("delete-file-button");
  if (deleteBtn) deleteBtn.style.display = can ? "inline-block" : "none";
}