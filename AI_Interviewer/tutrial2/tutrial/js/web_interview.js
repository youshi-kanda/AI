document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll('.menu button').forEach(button => {
        button.addEventListener('click', function() {
            const icon = this.querySelector('i');
            if (icon.classList.contains('fa-video-slash')) {
                icon.classList.toggle('fa-video');
                icon.classList.toggle('fa-video-slash');
            } else if (icon.classList.contains('fa-video')) {
                icon.classList.toggle('fa-video');
                icon.classList.toggle('fa-video-slash');
            } else if (icon.classList.contains('fa-microphone-slash')) {
                icon.classList.toggle('fa-microphone');
                icon.classList.toggle('fa-microphone-slash');
            } else if (icon.classList.contains('fa-microphone')) {
                icon.classList.toggle('fa-microphone');
                icon.classList.toggle('fa-microphone-slash');
            } else if (icon.classList.contains('fa-phone-slash')) {
                icon.classList.toggle('fa-phone');
                icon.classList.toggle('fa-phone-slash');
            } else if (icon.classList.contains('fa-phone')) {
                icon.classList.toggle('fa-phone');
                icon.classList.toggle('fa-phone-slash');
            }
        });
    });
});