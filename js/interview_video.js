const chatLog = document.getElementById("chatLog");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const input = document.getElementById("userInput");
const userVideo = document.getElementById("userVideo");
const recordBtn = document.getElementById("recordBtn");
const recordIcon = recordBtn.querySelector("i");

let currentQuestion = 0;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];

const questions = [
  "本日はよろしくお願いします。それでは面接を始めていきます。",
  "まずは自己紹介をお願いします。",
  "大学ではどのようなことを学ばれましたか？",
  "志望動機を教えてください。",
  "最後に何か質問はありますか？"
];

window.onload = () => {
  speakAndDisplayBot(questions[currentQuestion]);
};

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

    const bubble = document.createElement("div");
    bubble.className = "user";
    bubble.textContent = transcript;
    chatLog.appendChild(bubble);
    chatLog.scrollTop = chatLog.scrollHeight;

    currentQuestion++;
    if (currentQuestion < questions.length) {
      setTimeout(() => speakAndDisplayBot(questions[currentQuestion]), 1000);
    }
  };

  recognition.onerror = () => {
    micBtn.disabled = false;
    micBtn.textContent = "🎤";
    alert("音声の取得に失敗しました。");
  };
});

async function requestCameraAndMic() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    userVideo.srcObject = mediaStream;
    console.log("カメラ・マイク許可完了");
  } catch (e) {
    alert("カメラまたはマイクの使用許可が必要です：" + e.message);
  }
}

document.getElementById("videoBtn").addEventListener("click", () => {
  if (!mediaStream) {
    requestCameraAndMic();
  } else {
    const videoTrack = mediaStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
  }
});

document.getElementById("micToggleBtn").addEventListener("click", () => {
  if (!mediaStream) {
    alert("マイクがまだ有効になっていません（🎥ボタンを先に押してください）");
    return;
  }
  const audioTrack = mediaStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
});

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
  recordIcon.setAttribute("data-lucide", "stop-circle");
  lucide.createIcons();
  recordBtn.title = "録画停止";
}

function stopRecording() {
  mediaRecorder.stop();
  recordIcon.setAttribute("data-lucide", "circle");
  lucide.createIcons();
  recordBtn.title = "録画開始";
}
