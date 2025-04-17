document.addEventListener("DOMContentLoaded", () => {
    const cameraIcon = document.getElementById("camera-icon");
    const micIcon = document.getElementById("mic-icon");

    // カメラアイコン切り替え
    document.getElementById("camera-icon-container").addEventListener("click", () => {
        cameraIcon.classList.toggle("bi-camera-video");
        cameraIcon.classList.toggle("bi-camera-video-off");
    });

    // マイクアイコン切り替え
    document.getElementById("mic-icon-container").addEventListener("click", () => {
        micIcon.classList.toggle("bi-mic");
        micIcon.classList.toggle("bi-mic-mute-fill");
    });
});
