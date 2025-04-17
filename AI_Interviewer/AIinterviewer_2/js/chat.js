document.addEventListener('DOMContentLoaded', () => {
    const chatArea = document.querySelector('.chat-area');
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const backButton = document.querySelector('.back-button');

    const handleSendMessage = () => {
        const text = userInput.value.trim();
        if (text) {
            addUserMessage(text, 'url("image/user_avatar.jpg")');
            setTimeout(() => {
                userInput.value = '';
            }, 0);
            userInput.focus();
        }
    };

    sendButton.addEventListener('click', handleSendMessage);

    userInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            handleSendMessage();
        }
    });

    function addUserMessage(text, imageURL) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'sent' ,'my-message');

        const iconContainer = document.createElement('div');
        iconContainer.classList.add('icon-container');
        iconContainer.style.backgroundImage = imageURL;

        const messageBubble = document.createElement('div');
        messageBubble.classList.add('message-bubble');

        const messageText = document.createElement('div');
        messageText.classList.add('message-text');
        messageText.textContent = text;

        messageBubble.appendChild(messageText);

        messageDiv.appendChild(iconContainer);
        messageDiv.appendChild(messageBubble);

        chatArea.appendChild(messageDiv);
        scrollToBottom();
    }

    function addReceivedMessage(text, imageURL) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'received');

        const iconContainer = document.createElement('div');
        iconContainer.classList.add('icon-container');
        iconContainer.style.backgroundImage = imageURL;

        const messageBubble = document.createElement('div');
        messageBubble.classList.add('message-bubble');

        const messageText = document.createElement('div');
        messageText.classList.add('message-text');
        messageText.textContent = text;

        messageBubble.appendChild(messageText);

        messageDiv.appendChild(iconContainer);
        messageDiv.appendChild(messageBubble);

        chatArea.appendChild(messageDiv);
        scrollToBottom();
    }

    // 初期メッセージ表示
    addReceivedMessage("何か質問はありますか？", 'url("image/ai_avatar.png")');

    function scrollToBottom() {
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    backButton.addEventListener('click', function() {
      window.location.href = 'introduction.html'; 
    });
});