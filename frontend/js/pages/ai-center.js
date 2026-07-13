/* ═══════════════════════════════════════════════════════════════════════════
   EventPro — AI Center Page (Chat Interface)
   ═══════════════════════════════════════════════════════════════════════════ */

registerPage('ai-center', initAICenter);

let chatSessionId = null;

async function initAICenter() {
    // Get or create session ID
    if (!chatSessionId) {
        chatSessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="chat-container fade-in">
            <!-- Chat Header -->
            <div class="chat-header">
                <div class="chat-header-info">
                    <div class="chat-ai-avatar">
                        <span class="material-icons-round">smart_toy</span>
                    </div>
                    <div>
                        <div class="chat-ai-name">EventPro AI Assistant</div>
                        <div class="chat-ai-status">Online</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-sm btn-secondary" onclick="startNewChatSession()" title="New Chat">
                        <span class="material-icons-round">add</span>
                        New Chat
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="confirmClearChat()" title="Clear History">
                        <span class="material-icons-round">delete_sweep</span>
                    </button>
                </div>
            </div>

            <!-- Suggestion Chips -->
            <div class="chat-suggestions" id="chat-suggestions">
                <button class="chat-suggestion" onclick="sendSuggestion('Help me plan a wedding')">🎊 Wedding Planning</button>
                <button class="chat-suggestion" onclick="sendSuggestion('How to organize a corporate event?')">💼 Corporate Event</button>
                <button class="chat-suggestion" onclick="sendSuggestion('Birthday party ideas')">🎂 Birthday Party</button>
                <button class="chat-suggestion" onclick="sendSuggestion('Budget planning tips for events')">💰 Budget Tips</button>
                <button class="chat-suggestion" onclick="sendSuggestion('How to select the best vendors?')">📋 Vendor Selection</button>
            </div>

            <!-- Chat Messages -->
            <div class="chat-messages" id="chat-messages">
                <!-- Welcome message -->
                <div class="chat-message assistant">
                    <div class="chat-msg-avatar">
                        <span class="material-icons-round">smart_toy</span>
                    </div>
                    <div class="chat-msg-bubble">
                        <strong>👋 Welcome to EventPro AI Assistant!</strong><br><br>
                        I'm here to help you plan and manage your events professionally. I can assist with:<br><br>
                        🎊 Wedding planning<br>
                        💼 Corporate events<br>
                        🎂 Birthday parties<br>
                        📋 Vendor selection<br>
                        💰 Budget planning<br><br>
                        How can I help you today?
                    </div>
                </div>
            </div>

            <!-- Chat Input -->
            <div class="chat-input-area">
                <div class="chat-input-wrapper">
                    <textarea class="chat-input" id="chat-input" placeholder="Type your message..." rows="1"></textarea>
                </div>
                <button class="chat-send-btn" id="chat-send-btn" onclick="sendChatMessage()">
                    <span class="material-icons-round">send</span>
                </button>
            </div>
        </div>
    `;

    // Auto-resize textarea
    const input = document.getElementById('chat-input');
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Send on Enter (Shift+Enter for new line)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Load chat history
    await loadChatHistory();
}

async function loadChatHistory() {
    if (!chatSessionId) return;

    try {
        const history = await api.get(`/chat/history/${chatSessionId}`);
        if (history && history.length > 0) {
            const messagesDiv = document.getElementById('chat-messages');
            // Clear welcome message if there's history
            messagesDiv.innerHTML = '';

            history.forEach(msg => {
                appendMessage(msg.role, msg.content, false);
            });

            // Hide suggestions if there's history
            document.getElementById('chat-suggestions').style.display = 'none';

            scrollToBottom();
        }
    } catch (err) {
        // History load failed, keep welcome message
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Hide suggestions
    document.getElementById('chat-suggestions').style.display = 'none';

    // Append user message
    appendMessage('user', message);

    // Show typing indicator
    showTypingIndicator();

    try {
        const response = await api.post('/chat', {
            message: message,
            session_id: chatSessionId,
        });

        // Remove typing indicator
        removeTypingIndicator();

        // Append AI response
        appendMessage('assistant', response.reply);
    } catch (err) {
        removeTypingIndicator();
        appendMessage('assistant', '❌ Sorry, I encountered an error. Please make sure the backend server is running and try again.');
    }
}

function sendSuggestion(text) {
    document.getElementById('chat-input').value = text;
    sendChatMessage();
}

function appendMessage(role, content, animate = true) {
    const messagesDiv = document.getElementById('chat-messages');
    const icon = role === 'assistant' ? 'smart_toy' : 'person';

    // Format content: convert markdown-like bold and line breaks
    const formattedContent = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

    const messageHtml = `
        <div class="chat-message ${role}" ${animate ? '' : 'style="animation:none"'}>
            <div class="chat-msg-avatar">
                <span class="material-icons-round">${icon}</span>
            </div>
            <div class="chat-msg-bubble">
                ${formattedContent}
            </div>
        </div>
    `;

    messagesDiv.insertAdjacentHTML('beforeend', messageHtml);
    scrollToBottom();
}

function showTypingIndicator() {
    const messagesDiv = document.getElementById('chat-messages');
    const html = `
        <div class="chat-message assistant" id="typing-indicator">
            <div class="chat-msg-avatar">
                <span class="material-icons-round">smart_toy</span>
            </div>
            <div class="chat-msg-bubble">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    messagesDiv.insertAdjacentHTML('beforeend', html);
    scrollToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    const messagesDiv = document.getElementById('chat-messages');
    if (messagesDiv) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function startNewChatSession() {
    chatSessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    initAICenter();
    showToast('New chat session started', 'info');
}

function confirmClearChat() {
    openModal('Clear Chat', `
        <div class="confirm-dialog">
            <span class="material-icons-round">warning</span>
            <h4>Clear Chat History?</h4>
            <p>This will permanently delete all messages in this chat session. This action cannot be undone.</p>
            <div class="confirm-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-danger" onclick="clearChatHistory()">
                    <span class="material-icons-round">delete_forever</span>
                    Clear History
                </button>
            </div>
        </div>
    `);
}

async function clearChatHistory() {
    try {
        await api.delete(`/chat/history/${chatSessionId}`);
        closeModal();
        initAICenter();
        showToast('Chat history cleared', 'success');
    } catch (err) {
        showToast('Failed to clear chat history', 'error');
    }
}
