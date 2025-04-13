const chatLog = document.getElementById("chatLog");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const input = document.getElementById("userInput");
const userVideo = document.getElementById("userVideo");
const recordBtn = document.getElementById("recordBtn");

let currentQuestion = 0;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];

// 面接官の質問
const questions = [
  "本日はよろしくお願いします。それでは面接を始めていきます。",
  "まずは自己紹介をお願いします。",
  "大学ではどのようなことを学ばれましたか？",
  "志望動機を教えてください。",
  "最後に何か質問はありますか？"
];

// 初期表示（カメラ・マイクは起動しない）
window.onload = () => {
  speakAndDisplayBot(questions[currentQuestion]);
};

// 音声読み上げとチャット表示
function speakAndDisplayBot(text) {
  const bubble = document.createElement("div");
  bubble.className = "bot";
  bubble.textContent = text;
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ja-JP";
  speechSynthesis.speak(utter);
}

// 面接者の回答を送信
sendBtn.addEventListener("click", () => {
  const text = input.value.trim();
  if (!text) return;

  const bubble = document.createElement("div");
  bubble.className = "user";
  bubble.textContent = text;
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  input.value = "";

  currentQuestion++;
  if (currentQuestion < questions.length) {
    setTimeout(() => speakAndDisplayBot(questions[currentQuestion]), 1000);
  }
});

// 音声入力（マイクボタン）
micBtn.addEventListener("click", () => {
  if (!("webkitSpeechRecognition" in window)) {
    alert("音声認識はこのブラウザではサポートされていません。");
    return;
  }

  const recognition = new webkitSpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.start();
  micBtn.disabled = true;
  micBtn.textContent = "🎤…";

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    micBtn.disabled = false;
    micBtn.textContent = "🎤";
  };

  recognition.onerror = () => {
    micBtn.disabled = false;
    micBtn.textContent = "🎤";
    alert("音声の取得に失敗しました。");
  };
});

// カメラ・マイクを起動（明示操作時のみ）
async function requestCameraAndMic() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    userVideo.srcObject = mediaStream;
    console.log("カメラ・マイク許可完了");
  } catch (e) {
    alert("カメラまたはマイクの使用許可が必要です：" + e.message);
  }
}

// 🎥 ボタン：カメラ起動または切り替え
document.getElementById("videoBtn").addEventListener("click", () => {
  if (!mediaStream) {
    requestCameraAndMic(); // 初回：許可を求める
  } else {
    const videoTrack = mediaStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
  }
});

// 🎙️ ボタン：マイクのON/OFF
document.getElementById("micToggleBtn").addEventListener("click", () => {
  if (!mediaStream) {
    alert("マイクがまだ有効になっていません（🎥ボタンを先に押してください）");
    return;
  }
  const audioTrack = mediaStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
});

// ⏺ ボタン：録画の開始／停止
recordBtn.addEventListener("click", () => {
  if (!mediaStream) {
    alert("まず 🎥 ボタンでカメラ・マイクを起動してください。");
    return;
  }

  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    startRecording();
  } else {
    stopRecording();
  }
});

// 録画スタート
function startRecording() {
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(mediaStream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview_recording.webm";
    a.click();
    URL.revokeObjectURL(url);
  };

  mediaRecorder.start();
  document.querySelector("#recordBtn img").src = "icons/stop.svg";
  recordBtn.title = "録画停止";
}

// 録画ストップ
function stopRecording() {
  mediaRecorder.stop();
  document.querySelector("#recordBtn img").src = "icons/record.svg";
  recordBtn.title = "録画開始";
}
