const dialog = document.getElementById("dialog");
const nextBtn = document.getElementById("nextBtn");
const steps = document.querySelectorAll(".step-indicator span");
const avatar = document.getElementById("avatar");
const choiceArea = document.getElementById("choiceArea");

const phrases = [
  "はじめまして。",
  "私は本日、あなたの面接を担当するAI面接官です。",
  "これからいくつかの質問を行いますので、リラックスしてお答えください。",
  "事前に、音声入力やカメラが正しく動作しているか確認をお願いします。",
  "準備が整いましたら、右下のボタンで進んでください。"
];

let current = 0;

showPhrase();
highlightStep();

nextBtn.addEventListener("click", () => {
  current++;
  if (current < phrases.length) {
    showPhrase();
    highlightStep();
  }

  if (current === phrases.length - 1) {
    nextBtn.style.display = "none";
    choiceArea.style.display = "flex";
  }
});

function showPhrase() {
  dialog.innerHTML = "";

  const p = document.createElement("p");
  p.textContent = phrases[current];
  dialog.appendChild(p);

  avatar.classList.add("talking");

  setTimeout(() => {
    p.style.opacity = 1;
  }, 100);

  setTimeout(() => {
    avatar.classList.remove("talking");
  }, 1200);
}

function highlightStep() {
  steps.forEach((step, index) => {
    step.classList.toggle("active", index <= current);
  });
}
