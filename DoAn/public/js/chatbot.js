(function() {
    // Inject CSS
    const injectStyles = () => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';
        document.head.appendChild(link);

        const customStyles = document.createElement('link');
        customStyles.rel = 'stylesheet';
        customStyles.href = 'chatbot/styles_bot.css'; // Đường dẫn tới file CSS của bạn
        document.head.appendChild(customStyles);
    };

    // Inject HTML
    const injectHTML = () => {
        const chatHTML = `
            <div class="chat-container">
                <div class="chat-header">
                    <div class="avatar">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="info">
                        <h3>Nhân viên hỗ trợ</h3>
                        <p>Online</p>
                    </div>
                    <button class="minimize-btn">
                        <i class="fas fa-minus"></i>
                    </button>
                </div>
                <div id="chatMessages" class="chat-messages">
                    <div id="typingIndicator" class="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
                <div class="input-container">
                    <div class="input-wrapper">
                        <input type="text" id="messageInput" placeholder="Type your message...">
                    </div>
                    <button id="sendButton">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
            <div class="chat-bubble">
                <i class="fas fa-comment"></i>
            </div>
        `;
        
        const div = document.createElement('div');
        div.id = 'chatbot-container';
        div.innerHTML = chatHTML;
        document.body.appendChild(div);
    };

    // Initialize chatbot
    const initChatbot = () => {
        injectStyles();
        injectHTML();
        
        // Load chat.js
        const script = document.createElement('script');
        script.src = 'chatbot/chat.js'; // Đường dẫn tới file chat.js của bạn
        document.body.appendChild(script);

        // Toggle chatbot visibility
        const chatBubble = document.querySelector('.chat-bubble');
        const chatContainer = document.querySelector('.chat-container');
        const minimizeBtn = document.querySelector('.minimize-btn');

        chatBubble.addEventListener('click', () => {
            chatContainer.style.display = 'flex';
            chatBubble.style.display = 'none';
        });

        minimizeBtn.addEventListener('click', () => {
            chatContainer.style.display = 'none';
            chatBubble.style.display = 'flex';
        });
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChatbot);
    } else {
        initChatbot();
    }
})(); 