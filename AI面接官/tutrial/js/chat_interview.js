document.addEventListener("DOMContentLoaded", function() {
    const nextButton = document.getElementById("next_button");
    if (nextButton) {
        nextButton.addEventListener("click", function() {
            window.location.href = "web_interview.html"; // 次に表示したいページ
        });
    }
});
