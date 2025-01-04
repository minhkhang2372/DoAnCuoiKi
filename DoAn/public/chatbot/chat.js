const userId = 'user_' + Math.random().toString(36).substr(2, 9);
let lastChatId = null;
let isWaitingForResponse = false;
let conversationId = null;
let lastMessageTime = 0;
const MESSAGE_COOLDOWN = 5000; // 1 giây

function formatTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
}

async function initializeConversation() {
    try {
        const response = await fetch('http://localhost:3000/init-conversation', {
            method: 'POST',
        });
        const data = await response.json();
        conversationId = data.conversationId;
        
        // Lấy từ khóa tìm kiếm từ URL
        const urlParams = new URLSearchParams(window.location.search);
        const searchKey = urlParams.get('q') || '';
        
        // Add welcome message với từ khóa tìm kiếm
        setTimeout(() => {
            const welcomeMessage = searchKey 
                ? `Bạn cần tư vấn về "${searchKey}" phải không?`
                : "Xin chào! Bạn cần tư vấn về sản phẩm nào?";
            addMessage(welcomeMessage, 'bot');
        }, 1000);
    } catch (error) {
        console.error('Error initializing conversation:', error);
    }
}

async function waitForBotResponse() {
    let attempts = 0;
    const maxAttempts = 15;
    
    while (attempts < maxAttempts) {
        try {
            const response = await fetch('http://localhost:3000/check-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ conversationId })
            });

            const data = await response.json();
            
            if (data.data && data.data.length > 0) {
                const messages = data.data.sort((a, b) => b.created_at - a.created_at);
                
                const botMessage = messages.find(msg => 
                    msg.role === 'assistant' && 
                    (!lastChatId || msg.chat_id !== lastChatId)
                );
                
                if (botMessage) {
                    return botMessage;
                }
            }
        } catch (error) {
            console.error('Error checking message:', error);
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return null;
}

async function sendMessage() {
    const now = Date.now();
    if (now - lastMessageTime < MESSAGE_COOLDOWN) {
        return;
    }
    lastMessageTime = now;
    
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const typingIndicator = document.getElementById('typingIndicator');
    const message = messageInput.value.trim();
    
    if (!message || isWaitingForResponse) return;

    isWaitingForResponse = true;
    messageInput.disabled = true;
    sendButton.disabled = true;
    typingIndicator.style.display = 'flex';

    addMessage(message, 'user');
    messageInput.value = '';

    try {
        await fetch('http://localhost:3000/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                userId,
                conversationId
            }),
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const botMessage = await waitForBotResponse();
        if (botMessage) {
            addMessage(botMessage.content, 'bot');
            lastChatId = botMessage.chat_id;
        } else {
            addMessage('I apologize, but I seem to be having trouble responding. Could you please try again?', 'bot');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        addMessage('Sorry, there was an error sending your message. Please try again.', 'bot');
    } finally {
        isWaitingForResponse = false;
        messageInput.disabled = false;
        sendButton.disabled = false;
        typingIndicator.style.display = 'none';
        messageInput.focus();
    }
}

function addMessage(content, type) {
const chatMessages = document.getElementById('chatMessages');
const typingIndicator = document.getElementById('typingIndicator');

const messageDiv = document.createElement('div');
messageDiv.className = `message ${type}-message`;

const messageContent = document.createElement('div');
messageContent.className = 'message-content';

// Sử dụng hàm format thay vì textContent
messageContent.innerHTML = formatMessage(content);

const timeSpan = document.createElement('span');
timeSpan.className = 'time';
timeSpan.textContent = formatTime();

messageDiv.appendChild(messageContent);
messageDiv.appendChild(timeSpan);

chatMessages.insertBefore(messageDiv, typingIndicator);
chatMessages.scrollTop = chatMessages.scrollHeight;

messageDiv.style.opacity = '0';
messageDiv.style.transform = 'translateY(20px)';
requestAnimationFrame(() => {
messageDiv.style.transition = 'all 0.3s ease';
messageDiv.style.opacity = '1';
messageDiv.style.transform = 'translateY(0)';
});
}

function formatMessage(content) {
    // Xử lý Markdown headings và bold text
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Xử lý links
    content = content.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    // Xử lý bullet points (chỉ khi bắt đầu dòng)
    content = content.replace(/^[-*]\s(.*)$/gm, '<li>$1</li>');
    
    // Gom nhóm các bullet points liên tiếp
    let lines = content.split('\n');
    let inList = false;
    content = lines.map(line => {
        if (line.startsWith('<li>')) {
            if (!inList) {
                inList = true;
                return '<ul>' + line;
            }
            return line;
        } else if (inList) {
            inList = false;
            return '</ul>' + line;
        }
        return line;
    }).join('\n');
    if (inList) content += '</ul>';
    
    // Xử lý xuống dòng
    content = content.replace(/\n/g, '<br>');
    
    // Wrap trong paragraph
    if (!content.includes('<p>')) {
        content = '<p>' + content + '</p>';
    }
    
    return content;
}

window.onload = initializeConversation;

document.getElementById('messageInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && !this.disabled && !isWaitingForResponse) {
        e.preventDefault();
        sendMessage();
    }
});

document.getElementById('sendButton').addEventListener('click', sendMessage);


