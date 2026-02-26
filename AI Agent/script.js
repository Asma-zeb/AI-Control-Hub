document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const typingIndicator = document.getElementById('typingIndicator');

    // Function to add a message to the chat
    function addMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        messageElement.textContent = text;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to bottom
    }

    // Function to show/hide typing indicator
    function showTypingIndicator(show) {
        if (show) {
            typingIndicator.classList.add('visible');
        } else {
            typingIndicator.classList.remove('visible');
        }
    }

    // Function to send message to backend
    async function sendMessageToBackend(userMessage) {
        showTypingIndicator(true);
        try {
            const response = await fetch('http://127.0.0.1:5000/chat', { // Flask backend URL
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: userMessage })
            });

            const data = await response.json();
            
            showTypingIndicator(false);
            if (response.ok) {
                addMessage(data.bot_response, 'bot');
            } else {
                addMessage(`Error from backend: ${data.bot_response || 'Unknown error'}`, 'bot');
            }

        } catch (error) {
            console.error('Error sending message to backend:', error);
            showTypingIndicator(false);
            addMessage('Oops! Could not connect to the backend. Please ensure it is running.', 'bot');
        }
    }

    // Event listener for send button click
    sendButton.addEventListener('click', () => {
        const userMessage = chatInput.value.trim();
        if (userMessage) {
            addMessage(userMessage, 'user');
            chatInput.value = ''; // Clear input
            sendMessageToBackend(userMessage);
        }
    });

    // Event listener for Enter key press
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendButton.click(); // Trigger send button click
        }
    });

    // Initial bot message
    addMessage("Hello! I'm your AI Assistant. How can I help you today?", 'bot');
});