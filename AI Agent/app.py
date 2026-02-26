from flask import Flask, request, jsonify
from datetime import datetime
import requests
import uuid
import os
import re

app = Flask(__name__)

# --- Configuration ---
# Set to None to use built-in AI responses, or set your n8n webhook URL
N8N_WEBHOOK_URL = None  # e.g., "http://localhost:5678/webhook/email-agent-webhook"

# Optional: OpenAI API Key for AI responses (leave empty to use basic responses)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# --- CORS Configuration (for local development) ---
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response


def extract_email_intent(user_prompt):
    """Extract email-related information from user prompt."""
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, user_prompt)
    
    intent = {
        "is_email_request": False,
        "emails": emails,
        "subject": "",
        "message": ""
    }
    
    email_keywords = ["send email", "write email", "draft email", "email to", "send an email"]
    if any(keyword in user_prompt.lower() for keyword in email_keywords):
        intent["is_email_request"] = True
        intent["message"] = user_prompt
    
    return intent


def get_ai_response(user_prompt):
    """Get response from OpenAI API if available, otherwise use basic responses."""
    
    if OPENAI_API_KEY:
        try:
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-3.5-turbo",
                    "messages": [
                        {"role": "system", "content": "You are a helpful AI assistant. Be concise and friendly."},
                        {"role": "user", "content": user_prompt}
                    ],
                    "max_tokens": 500
                },
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"OpenAI API error: {e}")
    
    # Fallback: Basic keyword-based responses
    prompt_lower = user_prompt.lower()
    
    if any(word in prompt_lower for word in ["hello", "hi", "hey", "greetings"]):
        return "Hello! I'm your AI Assistant. How can I help you today?"
    elif any(word in prompt_lower for word in ["how are you", "how're you"]):
        return "I'm doing great! Ready to assist you with your tasks."
    elif any(word in prompt_lower for word in ["help", "assist", "support"]):
        return "I can help you with:\n• Answering questions\n• Drafting emails\n• Providing information\n• General conversation\n\nJust ask me anything!"
    elif any(word in prompt_lower for word in ["thank", "thanks"]):
        return "You're welcome! Is there anything else I can help you with?"
    elif any(word in prompt_lower for word in ["bye", "goodbye", "see you"]):
        return "Goodbye! Have a great day! Feel free to come back anytime."
    elif "email" in prompt_lower:
        email_intent = extract_email_intent(user_prompt)
        if email_intent["is_email_request"]:
            if email_intent["emails"]:
                return f"I can help you send an email to {', '.join(email_intent['emails'])}. However, email functionality requires n8n integration. For now, I can help you draft the content!"
            else:
                return "I'd be happy to help you draft an email. Who should I address it to, and what's the main topic?"
        else:
            return "I can assist with email-related tasks. Would you like me to help you draft an email?"
    elif any(word in prompt_lower for word in ["name", "who are you"]):
        return "I'm an AI Assistant powered by Flask and integrated with automation workflows. I'm here to help you!"
    elif any(word in prompt_lower for word in ["time", "date"]):
        return f"Current date and time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    else:
        return f"I received your message: \"{user_prompt}\"\n\nI'm a demo AI assistant. For advanced features like email automation, please configure the n8n integration or add an OpenAI API key."


@app.route('/chat', methods=['POST'])
def chat():
    # Validate request
    if not request.is_json:
        return jsonify({"bot_response": "Request must be JSON.", "status": "error"}), 400
    
    user_prompt = request.json.get('message')

    # Validate message
    if not user_prompt or not user_prompt.strip():
        return jsonify({"bot_response": "Please enter a valid message.", "status": "error"}), 400

    user_prompt = user_prompt.strip()
    print(f"Received message from user: {user_prompt}")

    # Check if n8n is configured
    if N8N_WEBHOOK_URL:
        # Package payload for n8n
        payload = {
            "user_prompt": user_prompt,
            "timestamp": datetime.now().isoformat(),
            "session_id": str(uuid.uuid4()),
            "user_id": "mock_user_id",
            "text": user_prompt  # For n8n workflow compatibility
        }

        print(f"Forwarding payload to n8n: {payload}")

        try:
            n8n_response = requests.post(N8N_WEBHOOK_URL, json=payload, timeout=30)
            n8n_response.raise_for_status()
            n8n_data = n8n_response.json()
            print(f"Received response from n8n: {n8n_data}")

            bot_response_message = n8n_data.get("message", "Workflow executed successfully.")
            status_from_n8n = n8n_data.get("status", "success")

            if status_from_n8n == "success":
                bot_response = bot_response_message
            else:
                bot_response = f"Workflow issue: {bot_response_message}"

            return jsonify({"bot_response": bot_response, "status": status_from_n8n}), 200

        except requests.exceptions.Timeout:
            print("n8n webhook timeout")
            bot_response = get_ai_response(user_prompt)
            return jsonify({"bot_response": f"{bot_response} (n8n timeout, using fallback)", "status": "success"}), 200
        except requests.exceptions.RequestException as e:
            print(f"Error communicating with n8n: {e}")
            bot_response = get_ai_response(user_prompt)
            return jsonify({"bot_response": bot_response, "status": "success", "note": "n8n unavailable, using fallback"}), 200
        except Exception as e:
            print(f"Unexpected error with n8n: {e}")
            bot_response = get_ai_response(user_prompt)
            return jsonify({"bot_response": bot_response, "status": "success"}), 200
    else:
        # Use built-in AI responses (no n8n)
        print("Using built-in AI responses (n8n not configured)")
        bot_response = get_ai_response(user_prompt)
        return jsonify({"bot_response": bot_response, "status": "success"}), 200


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "AI Chatbot Backend",
        "timestamp": datetime.now().isoformat(),
        "n8n_configured": N8N_WEBHOOK_URL is not None,
        "openai_configured": bool(OPENAI_API_KEY)
    }), 200


if __name__ == '__main__':
    if N8N_WEBHOOK_URL:
        print(f"✓ n8n webhook configured: {N8N_WEBHOOK_URL}")
    else:
        print("⚠ n8n NOT configured - using built-in AI responses")
    
    if OPENAI_API_KEY:
        print("✓ OpenAI API key configured")
    else:
        print("⚠ OpenAI API key NOT configured - using basic responses")
    
    print("\nStarting Flask server on http://localhost:5000")
    print("Health check available at http://localhost:5000/health\n")
    
    app.run(debug=True, port=5000)
