const chatContainer = document.getElementById("chatContainer");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const input = document.getElementById("userInput");

let currentQuestion = 0;

// 面接官の質問リスト（自己紹介を1文に統合）
const questions = [
  "本日はよろしくお願いします。それでは面接を始めて行きたいと思います。簡単に自己紹介をお願いします。",
  "大学ではどのようなことを学んでいましたか？",
  "志望動機を教えてください。",
  "最後に何かご質問はありますか？"
];

// 面接官の吹き出し（アイコン付き）
function showBotMessage(text) {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble bot";
  bubble.innerHTML = `
    <div class="icon">
      <img src="images/interviewer.png" alt="面接官" />
    </div>
    <div class="text">${text}</div>
  `;
  chatContainer.appendChild(bubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 面接者の吹き出し
function showUserMessage(text) {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble user";
  bubble.innerHTML = `<div class="text">${text}</div>`;
  chatContainer.appendChild(bubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 初期表示
window.onload = () => {
  showBotMessage(questions[currentQuestion]);
};

// テキスト送信
sendBtn.addEventListener("click", () => {
  const text = input.value.trim();
  if (text === "") return;
  showUserMessage(text);
  input.value = "";

  // 次の質問
  currentQuestion++;
  if (currentQuestion < questions.length) {
    setTimeout(() => {
      showBotMessage(questions[currentQuestion]);
    }, 1000);
  }
});

// 音声認識
micBtn.addEventListener("click", () => {
  if (!('webkitSpeechRecognition' in window)) {
    alert("音声認識はこのブラウザではサポートされていません。");
    return;
  }

  const recognition = new webkitSpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.start();
  micBtn.disabled = true;
  micBtn.textContent = "🎤…";

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    micBtn.disabled = false;
    micBtn.textContent = "🎤";
  };

  recognition.onerror = function () {
    micBtn.disabled = false;
    micBtn.textContent = "🎤";
    alert("音声の取得に失敗しました。もう一度お試しください。");
  };
});
