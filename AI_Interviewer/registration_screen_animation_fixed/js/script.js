
// 1. ページ読み込み時に入力欄が1つずつ出現
window.addEventListener("DOMContentLoaded", () => {
  const fields = document.querySelectorAll(".form input");
  fields.forEach((field, index) => {
    field.style.opacity = 0;
    field.style.transform = "translateY(20px)";
    setTimeout(() => {
      field.style.transition = "all 0.5s ease";
      field.style.opacity = 1;
      field.style.transform = "translateY(0)";
    }, 300 * index);
  });
});

// 2. 送信ボタン押下時の処理（バリデーション→アニメーション）
document.querySelector(".register-btn").addEventListener("click", (e) => {
  e.preventDefault();

  const form = document.querySelector(".form");
  const inputs = document.querySelectorAll(".form input");

  let hasError = false;

  inputs.forEach((input) => {
    if (input.value.trim() === "") {
      input.classList.add("shake");
      input.style.borderColor = "red";
      hasError = true;

      setTimeout(() => {
        input.classList.remove("shake");
        input.style.borderColor = "#ddd";
      }, 500);
    }
  });

  // エラーがなければ送信アニメーション
  if (!hasError) {
    form.style.transition = "transform 0.5s ease-out, opacity 0.5s ease-out";
    form.style.transform = "translateX(100%)";
    form.style.opacity = 0;
  }
});

// 3. スクロールでヘッダーをパララックス風に動かす
window.addEventListener("scroll", () => {
  const header = document.querySelector(".curved");
  const offset = window.scrollY * 0.3;
  header.style.backgroundPosition = `center ${offset}px`;
});
