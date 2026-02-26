// AI Chatbot Service for Multi-Channel Communication
// Handles chat, email, phone, WhatsApp, and SMS

const { createLogger } = require('./logger');
const { UserProfileManager } = require('./data_recording_system');
const { InteractionLogger } = require('./data_recording_system');

const logger = createLogger('ChatbotService');

// Client database
const clientsDB = {
  'client-001': { 
    id: 'client-001', 
    name: 'John Doe', 
    email: 'john.doe@example.com', 
    phone: '+1234567890', 
    company: 'Acme Corp', 
    engagement: 'High', 
    avatar: 'JD',
    status: 'active',
    timezone: 'EST',
    preferredChannel: 'chat',
    conversationHistory: []
  },
  'client-002': { 
    id: 'client-002', 
    name: 'Jane Smith', 
    email: 'jane.smith@hospital.com', 
    phone: '+1987654321', 
    company: 'General Hospital', 
    engagement: 'Medium',
    avatar: 'JS',
    status: 'active',
    timezone: 'PST',
    preferredChannel: 'email',
    conversationHistory: []
  },
  'client-003': { 
    id: 'client-003', 
    name: 'Bob Johnson', 
    email: 'bob.j@techcorp.com', 
    phone: '+1555555555', 
    company: 'TechCorp', 
    engagement: 'Low',
    avatar: 'BJ',
    status: 'active',
    timezone: 'EST',
    preferredChannel: 'phone',
    conversationHistory: []
  },
  'client-004': { 
    id: 'client-004', 
    name: 'Alice Chen', 
    email: 'alice@startupxyz.com', 
    phone: '+1777888999', 
    company: 'StartupXYZ', 
    engagement: 'High',
    avatar: 'AC',
    status: 'active',
    timezone: 'PST',
    preferredChannel: 'whatsapp',
    conversationHistory: []
  },
  'client-005': { 
    id: 'client-005', 
    name: 'Mike Wilson', 
    email: 'mike@enterprise.com', 
    phone: '+1444333222', 
    company: 'Enterprise Inc', 
    engagement: 'Medium',
    avatar: 'MW',
    status: 'active',
    timezone: 'EST',
    preferredChannel: 'sms',
    conversationHistory: []
  }
};

// AI Response templates
const responseTemplates = {
  greeting: [
    "Hello! 👋 I'm your Media Control Assistant. How can I help you today?",
    "Hi there! 😊 Welcome! What can I assist you with?",
    "Greetings! 🤖 I'm here to help. What do you need?",
    "Hello! Great to connect with you! How may I assist?"
  ],
  acknowledgment: [
    "I understand. Let me help you with that.",
    "Got it! I'm on it.",
    "Thank you for sharing. I'll assist you right away.",
    "I see. Let me take care of this for you."
  ],
  information: [
    "Based on our records, I can provide you with that information.",
    "Let me check our database for you.",
    "I have the information you need. One moment please.",
    "Looking that up for you right now."
  ],
  followup: [
    "Is there anything else I can help you with?",
    "Would you like me to assist with anything else?",
    "Can I help you with anything more today?",
    "Do you have any other questions for me?"
  ],
  closing: [
    "Thank you for chatting! Have a great day! 😊",
    "It was my pleasure helping you. Take care!",
    "Feel free to reach out anytime. Goodbye!",
    "Thanks for connecting! Have a wonderful day!"
  ],
  waiting: [
    "Let me check that for you...",
    "One moment while I look into this...",
    "Please give me a second to find that information...",
    "I'm searching for the best answer for you..."
  ]
};

class ChatbotService {
  constructor() {
    this.activeConversations = new Map();
    this.userProfileManager = new UserProfileManager();
    this.interactionLogger = new InteractionLogger();
    this.callTimers = new Map();
    
    logger.info('ChatbotService initialized');
  }

  /**
   * Get all clients
   */
  getAllClients() {
    return Object.values(clientsDB);
  }

  /**
   * Get client by ID
   */
  getClient(clientId) {
    return clientsDB[clientId] || null;
  }

  /**
   * Process chat message and generate AI response
   */
  async processMessage(clientId, message, channel = 'chat') {
    try {
      const client = this.getClient(clientId);
      if (!client) {
        throw new Error('Client not found');
      }

      // Add to conversation history
      client.conversationHistory.push({
        role: 'user',
        message,
        channel,
        timestamp: new Date().toISOString()
      });

      // Analyze message intent
      const intent = this.analyzeIntent(message);
      
      // Generate appropriate response
      const response = await this.generateResponse(client, message, intent);
      
      // Add bot response to history
      client.conversationHistory.push({
        role: 'assistant',
        message: response.text,
        intent: intent.type,
        timestamp: new Date().toISOString()
      });

      // Log interaction
      this.interactionLogger.logInteraction({
        clientId,
        channel,
        message,
        response: response.text,
        intent: intent.type,
        sentiment: intent.sentiment,
        status: 'completed',
        timestamp: new Date().toISOString()
      });

      logger.info('Message processed', { clientId, channel, intent: intent.type });

      return {
        success: true,
        data: {
          clientId,
          userMessage: message,
          botResponse: response.text,
          intent: intent.type,
          sentiment: intent.sentiment,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Process message failed', { error: error.message });
      return {
        success: false,
        error: {
          code: 'PROCESS_MESSAGE_FAILED',
          message: error.message
        }
      };
    }
  }

  /**
   * Analyze message intent
   */
  analyzeIntent(message) {
    const lowerMessage = message.toLowerCase();
    
    // Greeting detection
    if (/^(hi|hello|hey|greetings|good morning|good afternoon|good evening)/.test(lowerMessage)) {
      return { type: 'greeting', sentiment: 'positive', confidence: 0.95 };
    }
    
    // Question detection
    if (/(what|when|where|who|why|how|can|could|would|is|are|does|do)/.test(lowerMessage) && 
        lowerMessage.includes('?')) {
      return { type: 'question', sentiment: 'neutral', confidence: 0.9 };
    }
    
    // Thank you detection
    if (/(thank|thanks|appreciate|grateful)/.test(lowerMessage)) {
      return { type: 'gratitude', sentiment: 'positive', confidence: 0.95 };
    }
    
    // Complaint detection
    if (/(problem|issue|complaint|wrong|error|not working|broken|unhappy|disappointed)/.test(lowerMessage)) {
      return { type: 'complaint', sentiment: 'negative', confidence: 0.85 };
    }
    
    // Interest detection
    if (/(interested|want|need|looking for|would like)/.test(lowerMessage)) {
      return { type: 'interest', sentiment: 'positive', confidence: 0.85 };
    }
    
    // Goodbye detection
    if (/(bye|goodbye|see you|talk later|have a good|take care)/.test(lowerMessage)) {
      return { type: 'closing', sentiment: 'neutral', confidence: 0.9 };
    }
    
    // Default
    return { type: 'general', sentiment: 'neutral', confidence: 0.7 };
  }

  /**
   * Generate AI response based on intent
   */
  async generateResponse(client, message, intent) {
    const { type, sentiment } = intent;
    
    let responseText = '';
    
    switch (type) {
      case 'greeting':
        responseText = this.getRandomTemplate('greeting');
        break;
        
      case 'gratitude':
        responseText = "You're welcome! 😊 I'm always happy to help. Is there anything else you need?";
        break;
        
      case 'question':
        responseText = this.getRandomTemplate('information');
        responseText += " " + this.generateAnswer(message);
        break;
        
      case 'complaint':
        responseText = "I'm sorry to hear about your concern. 😟 Let me make this right for you. Could you provide more details so I can assist you better?";
        break;
        
      case 'interest':
        responseText = "That's great to hear! 🎉 I'd be happy to help you with that. Let me provide you with more information.";
        break;
        
      case 'closing':
        responseText = this.getRandomTemplate('closing');
        break;
        
      default:
        responseText = this.getRandomTemplate('acknowledgment');
        responseText += " " + this.generateAnswer(message);
    }
    
    return {
      text: responseText,
      sentiment: sentiment,
      intent: type
    };
  }

  /**
   * Generate answer based on keywords
   */
  generateAnswer(message) {
    const lowerMessage = message.toLowerCase();
    
    // Pricing questions
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
      return "Our pricing varies based on your specific needs. I'd be happy to connect you with our sales team for a customized quote. Would you like me to arrange that?";
    }
    
    // Support questions
    if (lowerMessage.includes('support') || lowerMessage.includes('help') || lowerMessage.includes('problem')) {
      return "Our support team is available 24/7. You can reach us at support@example.com or call us at 1-800-SUPPORT. How can I assist you further?";
    }
    
    // Product questions
    if (lowerMessage.includes('product') || lowerMessage.includes('service') || lowerMessage.includes('feature')) {
      return "We offer a comprehensive range of products and services tailored to your needs. Would you like me to send you our detailed catalog?";
    }
    
    // Meeting/Appointment
    if (lowerMessage.includes('meeting') || lowerMessage.includes('appointment') || lowerMessage.includes('schedule')) {
      return "I'd be happy to schedule a meeting for you. What date and time works best for your schedule?";
    }
    
    // Default informative response
    return "Thank you for your message. Our team is committed to providing you with the best service. Is there something specific you'd like to know more about?";
  }

  /**
   * Get random template from category
   */
  getRandomTemplate(category) {
    const templates = responseTemplates[category];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
   * Send email
   */
  async sendEmail(clientId, to, subject, body) {
    try {
      const client = this.getClient(clientId);
      
      // Log email
      this.interactionLogger.logInteraction({
        clientId,
        channel: 'email',
        to,
        subject,
        body: body.substring(0, 200),
        status: 'sent',
        timestamp: new Date().toISOString()
      });

      logger.info('Email sent', { clientId, to, subject });

      return {
        success: true,
        data: {
          message: 'Email sent successfully',
          to,
          subject,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Send email failed', { error: error.message });
      return {
        success: false,
        error: {
          code: 'SEND_EMAIL_FAILED',
          message: error.message
        }
      };
    }
  }

  /**
   * Initiate phone call
   */
  async initiateCall(clientId, number, purpose) {
    try {
      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Start call timer
      const callStartTime = Date.now();
      this.callTimers.set(callId, {
        startTime: callStartTime,
        clientId,
        number,
        purpose
      });

      // Log call initiation
      this.interactionLogger.logInteraction({
        clientId,
        channel: 'call',
        callId,
        number,
        purpose,
        status: 'initiated',
        timestamp: new Date().toISOString()
      });

      logger.info('Call initiated', { callId, clientId, number });

      return {
        success: true,
        data: {
          callId,
          message: 'Call initiated successfully',
          status: 'connecting',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Initiate call failed', { error: error.message });
      return {
        success: false,
        error: {
          code: 'INITIATE_CALL_FAILED',
          message: error.message
        }
      };
    }
  }

  /**
   * End phone call
   */
  async endCall(callId) {
    try {
      const callData = this.callTimers.get(callId);
      if (!callData) {
        throw new Error('Call not found');
      }

      const duration = Math.floor((Date.now() - callData.startTime) / 1000);
      
      // Log call completion
      this.interactionLogger.logInteraction({
        clientId: callData.clientId,
        channel: 'call',
        callId,
        duration,
        status: 'completed',
        timestamp: new Date().toISOString()
      });

      // Remove from active calls
      this.callTimers.delete(callId);

      logger.info('Call ended', { callId, duration });

      return {
        success: true,
        data: {
          callId,
          duration,
          message: 'Call completed successfully',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('End call failed', { error: error.message });
      return {
        success: false,
        error: {
          code: 'END_CALL_FAILED',
          message: error.message
        }
      };
    }
  }

  /**
   * Send WhatsApp message
   */
  async sendWhatsApp(clientId, number, message) {
    try {
      // Log WhatsApp message
      this.interactionLogger.logInteraction({
        clientId,
        channel: 'whatsapp',
        number,
        message: message.substring(0, 200),
        status: 'sent',
        timestamp: new Date().toISOString()
      });

      logger.info('WhatsApp message sent', { clientId, number });

      return {
        success: true,
        data: {
          message: 'WhatsApp message sent successfully',
          whatsappUrl: `https://wa.me/${number.replace('+', '')}?text=${encodeURIComponent(message)}`,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Send WhatsApp failed', { error: error.message });
      return {
        success: false,
        error: {
          code: 'SEND_WHATSAPP_FAILED',
          message: error.message
        }
      };
    }
  }

  /**
   * Send SMS
   */
  async sendSMS(clientId, number, message) {
    try {
      if (message.length > 160) {
        throw new Error('Message exceeds 160 character limit');
      }

      // Log SMS
      this.interactionLogger.logInteraction({
        clientId,
        channel: 'sms',
        number,
        message,
        status: 'sent',
        timestamp: new Date().toISOString()
      });

      logger.info('SMS sent', { clientId, number });

      return {
        success: true,
        data: {
          message: 'SMS sent successfully',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Send SMS failed', { error: error.message });
      return {
        success: false,
        error: {
          code: 'SEND_SMS_FAILED',
          message: error.message
        }
      };
    }
  }

  /**
   * Get conversation history
   */
  getConversationHistory(clientId, limit = 50) {
    const client = this.getClient(clientId);
    if (!client) {
      return [];
    }
    
    return client.conversationHistory.slice(-limit);
  }

  /**
   * Get client stats
   */
  getClientStats() {
    const clients = this.getAllClients();
    
    return {
      totalClients: clients.length,
      activeClients: clients.filter(c => c.status === 'active').length,
      highEngagement: clients.filter(c => c.engagement === 'High').length,
      conversationsToday: clients.reduce((sum, c) => sum + c.conversationHistory.filter(
        h => new Date(h.timestamp).toDateString() === new Date().toDateString()
      ).length, 0)
    };
  }
}

// Export singleton instance
const chatbotService = new ChatbotService();

module.exports = {
  ChatbotService,
  chatbotService
};
