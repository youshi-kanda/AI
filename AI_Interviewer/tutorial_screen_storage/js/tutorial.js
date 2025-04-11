
document.addEventListener("DOMContentLoaded", () => {
  const username = localStorage.getItem("username") || "ユーザー";
  const interviewer = localStorage.getItem("interviewer") || "面接官";

  const textBox = document.querySelector(".tutorial-text");

  const rawText = `
    はじめまして${username}さん。<br />
    本日面接を担当する${interviewer}と申します。<br />
    これからAI面接を始めるにあたり、いくつかチュートリアルを挟み準備していただきます。
  `;

  textBox.innerHTML = rawText;
});
