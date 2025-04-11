document.addEventListener("DOMContentLoaded", function() {
    const nextButton = document.getElementById("next_button");
    if (nextButton) {
        nextButton.addEventListener("click", function() {
            window.location.href = "web_interview.html"; // 次に表示したいページ
        });
    }
});

document.querySelectorAll('.menu button').forEach(button => {
    button.addEventListener('click', function() {
        const icon = this.querySelector('i');
        if (icon.classList.contains('fa-video-slash')) {
            icon.classList.toggle('fa-video');
            icon.classList.toggle('fa-video-slash');
        } else if (icon.classList.contains('fa-microphone-slash')) {
            icon.classList.toggle('fa-microphone');
            icon.classList.toggle('fa-microphone-slash');
        } else if (icon.classList.contains('fa-phone-slash')) {
            icon.classList.toggle('fa-phone');
            icon.classList.toggle('fa-phone-slash');
        }
    });
});