document.getElementById('sendButton').addEventListener('click', function() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (message) {
        addMessage('user-message', message);
        input.value = '';
        
        // AIからの返信をシミュレート
        setTimeout(() => {
            addMessage('ai-message', 'AIからの返信です。');
        }, 1000);
    }
});

function addMessage(className, text) {
    const chatWindow = document.querySelector('.chat-window');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${className}`;
    messageDiv.textContent = text;
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}