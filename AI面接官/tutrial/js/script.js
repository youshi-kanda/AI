document.addEventListener("DOMContentLoaded", function() {
    const nextButton = document.getElementById("next_button");
    if (nextButton) {
        nextButton.addEventListener("click", function() {
            window.location.href = "chat_interview.html"; // 次に表示したいページ
        });
    }
});

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("register-form");

    form.addEventListener("submit", function (e) {
        e.preventDefault(); // フォームの送信をキャンセル
        window.location.href = "tutorial.html"; // tutorial.html に遷移
    });
});
