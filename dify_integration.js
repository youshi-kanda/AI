class DifyAPIClient {
    constructor(apiKey, baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl || 'https://api.dify.ai/v1';
        this.conversationId = null;
    }
    
    async sendMessage(message, user = 'user') {
        try {
            const response = await fetch(`${this.baseUrl}/chat-messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: {},
                    query: message,
                    response_mode: 'blocking',
                    conversation_id: this.conversationId,
                    user: user
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.conversation_id) {
                this.conversationId = data.conversation_id;
            }
            
            return {
                success: true,
                message: data.answer || data.message || 'すみません、回答を生成できませんでした。',
                conversationId: data.conversation_id
            };
            
        } catch (error) {
            console.error('Dify API Error:', error);
            return {
                success: false,
                message: 'すみません、システムエラーが発生しました。もう一度お試しください。',
                error: error.message
            };
        }
    }
    
    async getConversationHistory(conversationId) {
        try {
            const response = await fetch(`${this.baseUrl}/messages?conversation_id=${conversationId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.data || [];
            
        } catch (error) {
            console.error('Error fetching conversation history:', error);
            return [];
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DifyAPIClient;
} else {
    window.DifyAPIClient = DifyAPIClient;
}
