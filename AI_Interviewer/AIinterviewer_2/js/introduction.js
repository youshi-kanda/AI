document.addEventListener('DOMContentLoaded', function () {
    const backButton = document.getElementById('backButton');
    const nextButton = document.querySelector('.next-button');
    const bars = document.querySelectorAll('.bar');
    const comment = document.querySelector('.text-area p');
    const choiceArea = document.getElementById('choiceArea');
    const voiceCallButton = document.getElementById('voiceCallButton');
    const chatCallButton = document.getElementById('chatCallButton');
    const deviceCheck = document.getElementById('device-check');
    const videoPreview = document.getElementById('videoPreview');
    const micStatus = document.getElementById('mic-status');
    const videoStatus = document.getElementById('video-status');
    const deviceCheckButton = document.getElementById('deviceCheckButton');
    const toggleVideoButton = document.getElementById('toggleVideoButton');
    const toggleMicButton = document.getElementById('toggleMicButton');
    const micLevel = document.getElementById('mic-level');
  
    let mediaStream = null;
    let audioContext, analyser, dataArray;
  
    const micIcon = document.createElement('span');
    micIcon.id = 'mic-icon';
    micIcon.style.marginLeft = '8px';
    micIcon.textContent = '🎤';
    micStatus.appendChild(micIcon);
  
    const videoIcon = document.createElement('span');
    videoIcon.id = 'video-icon';
    videoIcon.style.marginLeft = '8px';
    videoIcon.textContent = '🎥';
    videoStatus.appendChild(videoIcon);
  
    const name = localStorage.getItem('intervieweeName') || '';
    const messages = [
      name.trim() ? `はじめまして、${name}さん。` : 'はじめまして。',
      '私はあなたの面接を担当するAI面接官です。',
      'これからいくつかの質問を行いますので、リラックスしてお答えください。',
      '音声入力やカメラが正しく動作しているか確認をお願いします。',
      '通話方法を選んでください。'
    ];
  
    let currentStep = 1;
    typeText(messages[0], comment);
  
    backButton.addEventListener('click', () => window.location.href = 'index.html');
  
    nextButton.addEventListener('click', () => {
      if (currentStep < bars.length) bars[currentStep].classList.add('active');
      if (currentStep < messages.length) typeText(messages[currentStep], comment);
      if (currentStep === 3) deviceCheck.style.display = 'flex';
      if (currentStep === 4) deviceCheck.style.display = 'none';
      if (currentStep === messages.length - 1) {
        nextButton.style.display = 'none';
        choiceArea.style.display = 'flex';
      }
      currentStep++;
    });
  
    deviceCheckButton.addEventListener('click', () => {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        mediaStream = stream;
        if (videoPreview) videoPreview.srcObject = stream;
  
        micStatus.textContent = "マイク状態: 使用可能 ✅";
        micStatus.appendChild(micIcon);
        micIcon.textContent = '🎤 ON';
  
        videoStatus.textContent = "カメラ状態: 使用可能 ✅";
        videoStatus.appendChild(videoIcon);
        videoIcon.textContent = '🎥 ON';
  
        setupMicLevelVisualizer(stream);
      }).catch(error => {
        micStatus.textContent = "マイク・カメラが許可されていません ❌";
        micIcon.textContent = '🎤 OFF';
        micStatus.appendChild(micIcon);
        videoStatus.textContent = "カメラ状態: 不明 ❌";
        videoIcon.textContent = '🎥 OFF';
        videoStatus.appendChild(videoIcon);
        console.warn("デバイスアクセス失敗:", error);
      });
    });
  
    toggleVideoButton.addEventListener('click', () => {
      if (!mediaStream) return;
      const videoTrack = mediaStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      videoStatus.textContent = videoTrack.enabled ? "カメラ状態: ON ✅" : "カメラ状態: OFF ❌";
      videoIcon.textContent = videoTrack.enabled ? '🎥 ON' : '🎥 OFF';
      videoStatus.appendChild(videoIcon);
    });
  
    toggleMicButton.addEventListener('click', () => {
      if (!mediaStream) return;
      const micTrack = mediaStream.getAudioTracks()[0];
      micTrack.enabled = !micTrack.enabled;
      micStatus.textContent = micTrack.enabled ? "マイク状態: ON ✅" : "マイク状態: OFF ❌";
      micIcon.textContent = micTrack.enabled ? '🎤 ON' : '🎤 OFF';
      micStatus.appendChild(micIcon);
    });
  
    function setupMicLevelVisualizer(stream) {
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      updateMicLevel();
    }
  
    function updateMicLevel() {
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);
      const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
  
      const scale = 0.8; // 音声感度を落とす（大きくなりすぎ防止）
      const width = Math.min(volume * scale, 100);
      micLevel.style.width = `${width}%`;
  
      // 音量に応じて色を変える
      if (width < 30) {
        micLevel.style.backgroundColor = "#4CAF50"; // 緑（小声）
      } else if (width < 70) {
        micLevel.style.backgroundColor = "#FFC107"; // 黄〜オレンジ（中音）
      } else {
        micLevel.style.backgroundColor = "#F44336"; // 赤（大声）
      }
  
      requestAnimationFrame(updateMicLevel);
    }
  
    voiceCallButton.addEventListener('click', () => window.location.href = 'voiceCall.html');
    chatCallButton.addEventListener('click', () => window.location.href = 'chat.html');
  
    function typeText(text, element) {
      let i = 0;
      element.innerHTML = '';
      const interval = setInterval(() => {
        element.innerHTML += text.charAt(i++);
        if (i > text.length) clearInterval(interval);
      }, 40);
    }
  });
  