export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

// ==== CORS origin check helper ===============================
function isAllowedOrigin(origin, env) {
  if (!origin) return true;                 // same-origin / server 発 → 許可
  const list = (env.ALLOWED_ORIGINS || "")
                 .split(",")
                 .map(o => o.trim())
                 .filter(Boolean);
  return list.length === 0 ? true : list.includes(origin);
}

async function handleRequest(request, env) {
  // === Origin 制限 ==========================================
  const origin = request.headers.get("Origin") || "";
  if (origin && !isAllowedOrigin(origin, env)) {
    return new Response(
      JSON.stringify({ error: "Origin not allowed" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  if (request.method === "OPTIONS") {
    return handleOptions(request, env);
  }

  const url  = new URL(request.url);
  const path = url.pathname;

  /* === media knowledge API ================================= */
  // == GET ==
  if (request.method === "GET") {
    if (path === "/files/list")           return handleFileList(request, env);
    if (path === "/files/detail")         return handleFileDetail(request, env);
    if (path === "/conversation-history") return handleConversationHistory(request, env);
    if (path === "/conversation-list")    return handleConversationList(request, env);
    if (path === "/api-status")           return handleApiStatus(request, env);
    {
      const m = path.match(/^\/messages\/([^/]+)\/suggested$/);
      if (m) return handleMessageSuggested(request, env);
    }
  }

  // == POST ==
  else if (request.method === "POST") {
    if (path === "/chat-messages")      return handleChatMessages(request, env);
    if (path === "/audio-to-text")      return handleAudioToText(request, env);
    if (path === "/text-to-audio")      return handleTextToAudio(request, env);
    if (path === "/files/upload")       return handleFileUpload(request, env);
    if (path === "/conversations/new")  return handleConversationNew(request, env);
    if (path === "/files/update")       return handleFileUpdate(request, env);
    return createErrorResponse(request, env, 404, "Invalid API path.");
  }

  // == DELETE ==
  else if (request.method === "DELETE") {
    const m = path.match(/^\/documents\/([^/]+)$/);
    if (m) return handleFileDelete(request, env, env.DATASET_ID, m[1]);
    return createErrorResponse(request, env, 404, "Invalid API path for DELETE.");
  }

  return createErrorResponse(request, env, 405, "Method not allowed.");
}

// ================================
// CORS & 共通ヘルパー
// ================================
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const list   = (env.ALLOWED_ORIGINS || "")
                   .split(",")
                   .map(o => o.trim())
                   .filter(Boolean);
  const allow  = origin && list.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin":      allow,
     "Access-Control-Allow-Credentials": "true",
     "Access-Control-Allow-Methods":     "GET, POST, DELETE, OPTIONS",
     "Access-Control-Allow-Headers":     "Content-Type, Authorization"
   };
}

function createErrorResponse(request, env, status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders(request, env)
  });
}

function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env)
  });
}

// ================================
// 1. 会話履歴ハンドラ
// ================================
async function handleConversationHistory(request, env) {
  try {
    const url            = new URL(request.url);
    const user           = url.searchParams.get("user");
    const conversationId = url.searchParams.get("conversation_id");
    const version        = url.searchParams.get("version") || "v1";
    if (!user || !conversationId) {
      return createErrorResponse(request, env, 400, "Missing 'user' or 'conversation_id'.");
    }

    const targetUrl = `https://api.dify.ai/${version}/messages?user=${encodeURIComponent(user)}&conversation_id=${encodeURIComponent(conversationId)}&limit=100`;
    const headers   = {
      "Authorization": `Bearer ${env.API_KEY}`,
      "Content-Type":  "application/json"
    };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 20000);
    const res        = await fetch(targetUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      let err = await res.text();
      try { err = JSON.stringify({ error: JSON.parse(err) }); }
      catch { err = JSON.stringify({ error: err }); }
      return new Response(err, { status: res.status, headers: corsHeaders(request, env) });
    }

    const data = await res.json();
    if (data.data) data.data.sort((a, b) => a.created_at - b.created_at);
    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders(request, env) });

  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "Dify API 接続がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 2. 会話一覧ハンドラ
// ================================
async function handleConversationList(request, env) {
  try {
    const url  = new URL(request.url);
    const user = url.searchParams.get("user");
    if (!user) return createErrorResponse(request, env, 400, "Missing 'user'.");

    const targetUrl = `https://api.dify.ai/v1/conversations?user=${encodeURIComponent(user)}&limit=50&sort_by=-updated_at`;
    const headers   = {
      "Authorization": `Bearer ${env.API_KEY}`,
      "Content-Type":  "application/json"
    };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15000);
    const res        = await fetch(targetUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      let err = await res.text();
      try { err = JSON.stringify({ error: JSON.parse(err) }); }
      catch { err = JSON.stringify({ error: err }); }
      return new Response(err, { status: res.status, headers: corsHeaders(request, env) });
    }

    const data = await res.json();
    if (Array.isArray(data.data)) {
      data.data.forEach(conv => {
        if (!/[ぁ-んァ-ン一-龥]/.test(conv.name)) {
          conv.name = "新しい会話";
        }
      });
    }
    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders(request, env) });

  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "Dify API 接続がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 3. 新規会話作成ハンドラ
// ================================
async function handleConversationNew(request, env) {
  try {
    const bodyJson = await request.json();
    if (!bodyJson.user) {
      return createErrorResponse(request, env, 400, "Missing 'user'.");
    }

    const targetUrl = "https://api.dify.ai/v1/chat-messages";
    const headers   = {
      "Authorization": `Bearer ${env.API_KEY}`,
      "Content-Type":  "application/json"
    };
    const body      = JSON.stringify({
      query:             "会話を開始します。",
      user:              bodyJson.user,
      inputs:            {},
      response_mode:     "blocking",
      conversation_id:   "",
      files:             [],
      auto_generate_name:true
    });

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 20000);
    const res        = await fetch(targetUrl, { method: "POST", headers, body, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      return createErrorResponse(request, env, res.status, err);
    }

    const data = await res.json();
    if (!data.conversation_id) {
      return createErrorResponse(request, env, 500, "No conversation_id returned.");
    }
    return new Response(JSON.stringify({
      id:            data.conversation_id,
      first_message: data.answer || ""
    }), { status: 200, headers: corsHeaders(request, env) });

  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "新規会話作成がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 4. API状態チェックハンドラ
// ================================
async function handleApiStatus(request, env) {
  try {
    const endpoints = [
      { name: "parameters", url: "https://api.dify.ai/v1/parameters" },
      { name: "ping",       url: "https://api.dify.ai/ping"       }
    ];
    const results = {};
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url, {
          method:  "GET",
          headers: { "Authorization": `Bearer ${env.API_KEY}` },
          signal:  AbortSignal.timeout(5000)
        });
        results[ep.name] = {
          status:     res.ok ? "ok" : "error",
          statusCode: res.status,
          time:       new Date().toISOString()
        };
      } catch (err) {
        results[ep.name] = {
          status: "error",
          error:  err.message,
          time:   new Date().toISOString()
        };
      }
    }
    return new Response(JSON.stringify({
      status:      "ok",
      api_checks:  results,
      server_time: new Date().toISOString()
    }), { status: 200, headers: corsHeaders(request, env) });
  } catch (e) {
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 5. チャットメッセージ送信ハンドラ
// ================================
async function handleChatMessages(request, env) {
  try {
    const req = await request.json();
    if (!req.query || !req.user) {
      return createErrorResponse(request, env, 400, "Missing 'query' or 'user'.");
    }

    const targetUrl = "https://api.dify.ai/v1/chat-messages";
    const headers   = {
      "Authorization": `Bearer ${env.API_KEY}`,
      "Content-Type":  "application/json"
    };
    const body = JSON.stringify({
      query:           req.query,
      user:            req.user,
      inputs:          req.inputs || {},
      response_mode:   "streaming",          // ★ 変更点
      conversation_id: req.conversation_id || "",
      files:           req.files || []
    });

    /* ❶ duplex:'half' を付けないと Workers がストリームを流してくれない */
    const res = await fetch(targetUrl, {
      method : "POST",
      headers,
      body,
      duplex : "half"
    });

    /* ❷ Dify の SSE 本体をそのままブラウザへ返す */
    return new Response(res.body, {
      status : res.status,
      headers: {
        ...corsHeaders(request, env),
        "Content-Type": "text/event-stream"
      }
    });
  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "レスポンス生成がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 6. ファイル一覧取得ハンドラ
// ================================
async function handleFileList(request, env) {
  try {
    const datasetId = env.DATASET_ID;
    const targetUrl = `https://api.dify.ai/v1/datasets/${datasetId}/documents`;
    const headers   = { "Authorization": `Bearer ${env.KNOWLEDGE_API_KEY}` };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15000);
    const res        = await fetch(targetUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      return createErrorResponse(request, env, res.status, err);
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders(request, env) });
  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "ファイル一覧取得がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 7. ファイル詳細取得ハンドラ
// ================================
async function handleFileDetail(request, env) {
  try {
    const url   = new URL(request.url);
    const docId = url.searchParams.get("docId");
    if (!docId) {
      return createErrorResponse(request, env, 400, "Missing 'docId'.");
    }

    const datasetId = env.DATASET_ID;
    const targetUrl = `https://api.dify.ai/v1/datasets/${datasetId}/documents/${docId}/segments`;
    const headers   = { "Authorization": `Bearer ${env.KNOWLEDGE_API_KEY}` };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15000);
    const res        = await fetch(targetUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      return createErrorResponse(request, env, res.status, err);
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders(request, env) });
  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "ファイル詳細取得がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 8. ファイルアップロードハンドラ
// ================================
async function handleFileUpload(request, env) {
  try {
    if (!hasUploadPrivilege(request, env)) {
      return createErrorResponse(request, env, 403, "ファイルのアップロード権限がありません");
    }
    const formData = await request.formData();
    const file     = formData.get("file");
    if (!file) {
      return createErrorResponse(request, env, 400, "No file uploaded.");
    }

    const datasetId     = env.DATASET_ID;
    const knowledgeForm = new FormData();
    knowledgeForm.append("file", file, file.name);

    const metaJson = {
      indexing_technique: "high_quality",
      process_rule: {
        mode: "custom",
        rules: {
          pre_processing_rules: [
            { id: "remove_extra_spaces", enabled: true },
            { id: "remove_urls_emails",  enabled: true }
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
    knowledgeForm.append("data", JSON.stringify(metaJson));

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 120000);
    const res        = await fetch(
      `https://api.dify.ai/v1/datasets/${datasetId}/document/create-by-file`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${env.KNOWLEDGE_API_KEY}` },
      body:    knowledgeForm,
      signal:  controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      return createErrorResponse(request, env, res.status, err);
    }
    const data = await res.json();
    return new Response(JSON.stringify({ knowledgeDoc: data }), {
      status:  200,
      headers: corsHeaders(request, env)
    });
  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "ファイルアップロードがタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 9. ファイル更新ハンドラ
// ================================
async function handleFileUpdate(request, env) {
  try {
    if (!hasUploadPrivilege(request, env)) {
      return createErrorResponse(
        request, env, 403, "ファイルの更新権限がありません");
    }
    const { docId, text } = await request.json();
    if (!docId || !text) {
      return createErrorResponse(request, env, 400, "Missing 'docId' or 'text'.");
    }

    const datasetId = env.DATASET_ID;
    const apiKey    = env.KNOWLEDGE_API_KEY;

    // （1）文書情報取得（ファイル名取得用）
    const controller1 = new AbortController();
    const timeoutId1  = setTimeout(() => controller1.abort(), 10000);
    const detailRes   = await fetch(
      `https://api.dify.ai/v1/datasets/${datasetId}/documents/${docId}/upload-file`, {
      method:  "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal:  controller1.signal
    });
    clearTimeout(timeoutId1);

    if (!detailRes.ok) {
      const err = await detailRes.text();
      return createErrorResponse(request, env, detailRes.status, `Failed to get document details: ${err}`);
    }
    const detailData       = await detailRes.json();
    const originalFileName = detailData.name || "UpdatedDocument";

    // （2）テキスト更新
    const updateUrl    = `https://api.dify.ai/v1/datasets/${datasetId}/documents/${docId}/update-by-text`;
    const body         = JSON.stringify({ name: originalFileName, text });
    const controller2  = new AbortController();
    const timeoutId2   = setTimeout(() => controller2.abort(), 30000);
    const updateRes    = await fetch(updateUrl, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json"
      },
      body,
      signal:  controller2.signal
    });
    clearTimeout(timeoutId2);

    if (!updateRes.ok) {
      const err = await updateRes.text();
      return createErrorResponse(request, env, updateRes.status, `Failed to update document: ${err}`);
    }
    const updatedData = await updateRes.json();
    return new Response(JSON.stringify({ success: true, updatedDoc: updatedData }), {
      status:  200,
      headers: corsHeaders(request, env)
    });
  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "ファイル更新がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 10. ファイル削除ハンドラ
// ================================
async function handleFileDelete(request, env, datasetId, documentId) {
  try {
    if (!hasUploadPrivilege(request, env)) {
      return createErrorResponse(
        request, env, 403, "ファイルの削除権限がありません");
    }
    const targetUrl = `https://api.dify.ai/v1/datasets/${datasetId}/documents/${documentId}`;
    const headers   = {
      "Authorization": `Bearer ${env.KNOWLEDGE_API_KEY}`,
      "Content-Type":  "application/json"
    };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15000);
    const res        = await fetch(targetUrl, { method: "DELETE", headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      return createErrorResponse(request, env, res.status, err);
    }
    return new Response(JSON.stringify({ result: "success" }), {
      status:  200,
      headers: corsHeaders(request, env)
    });
  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "ファイル削除がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 11. 音声→テキストハンドラ
// ================================
async function handleAudioToText(request, env) {
  try {
    const { audioContent } = await request.json();
    if (!audioContent) {
      return createErrorResponse(request, env, 400, "Missing 'audioContent'.");
    }

    const targetUrl = `https://speech.googleapis.com/v1/speech:recognize?key=${env.GCP_API_KEY}`;
    const headers   = { "Content-Type": "application/json" };
    const body      = JSON.stringify({
      config: {
        encoding:        "WEBM_OPUS",
        sampleRateHertz: 48000,
        languageCode:    "ja-JP"
      },
      audio: { content: audioContent }
    });

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 20000);
    const res        = await fetch(targetUrl, { method: "POST", headers, body, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      return createErrorResponse(request, env, res.status, err);
    }
    const data       = await res.json();
    const transcript = data.results?.[0]?.alternatives?.[0]?.transcript;
    if (!transcript) {
      return createErrorResponse(request, env, 400, "音声認識結果が空です。");
    }
    return new Response(JSON.stringify({ text: transcript }), {
      status: 200,
      headers: corsHeaders(request, env)
    });
  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "音声→テキスト変換がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 12. テキスト→音声ハンドラ
// ================================
async function handleTextToAudio(request, env) {
  try {
    const { text, user } = await request.json();
    if (!text || !user) {
      return createErrorResponse(request, env, 400, "Missing 'text' or 'user'.");
    }

    const targetUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.GCP_API_KEY}`;
    const headers   = { "Content-Type": "application/json" };
    const body      = JSON.stringify({
      input:       { text },
      voice:       { languageCode: "ja-JP", name: "ja-JP-Wavenet-D" },
      audioConfig: { audioEncoding: "MP3" }
    });

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 20000);
    const res        = await fetch(targetUrl, { method: "POST", headers, body, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      return createErrorResponse(request, env, res.status, err);
    }
    const data        = await res.json();
    const audioBuffer = Uint8Array.from(atob(data.audioContent), c => c.charCodeAt(0));

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders(request, env),
        "Content-Type":        "audio/mpeg",
        "Content-Disposition": "inline; filename=response.mp3"
      }
    });
  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "テキスト→音声生成がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}

// ================================
// 13. サジェスト質問取得ハンドラ
// ================================
async function handleMessageSuggested(request, env) {
  try {
    const url       = new URL(request.url);
    const messageId = url.pathname.split("/")[2];
    const user      = url.searchParams.get("user") || "unique-user-id";
    const targetUrl = `https://api.dify.ai/v1/messages/${messageId}/suggested?user=${encodeURIComponent(user)}`;
    const headers   = {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${env.API_KEY}`
    };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10000);
    const res        = await fetch(targetUrl, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      return createErrorResponse(request, env, res.status, err);
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: corsHeaders(request, env)
    });
  } catch (e) {
    if (e.name === "AbortError") {
      return createErrorResponse(request, env, 504, "サジェスト取得がタイムアウトしました");
    }
    return createErrorResponse(request, env, 500, e.message);
  }
}