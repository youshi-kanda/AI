
// 1. 登録ボタン押下でフォーム全体をスライドアウト
document.querySelector(".register-btn").addEventListener("click", (e) => {
  e.preventDefault(); // デモ用に送信はキャンセル
  const form = document.querySelector(".form");
  form.style.transition = "transform 0.5s ease-out, opacity 0.5s ease-out";
  form.style.transform = "translateX(100%)";
  form.style.opacity = 0;
});

// 2. ページ読み込み時に入力項目が1つずつ出現
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

// 3. エラー（未入力）時に該当フィールドを震わせる
document.querySelector(".register-btn").addEventListener("click", () => {
  const inputs = document.querySelectorAll(".form input");
  inputs.forEach((input) => {
    if (input.value.trim() === "") {
      input.classList.add("shake");
      setTimeout(() => {
        input.classList.remove("shake");
      }, 500);
    }
  });
});

// 4. スクロールに応じてヘッダーの背景が動く（パララックス）
window.addEventListener("scroll", () => {
  const header = document.querySelector(".curved");
  const offset = window.scrollY * 0.3;
  header.style.backgroundPosition = `center ${offset}px`;
});
