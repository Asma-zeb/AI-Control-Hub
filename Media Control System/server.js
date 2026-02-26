// Express API Server
// Secure REST API with authentication, rate limiting, and health checks

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { createLogger, logSecurityEvent } = require('./logger');
const { authMiddleware, authService, ROLES } = require('./auth');
const { authSystem } = require('./auth_system');
const { healthCheckSystem } = require('./health_check');
const { validateInput, AgentConfigSchema } = require('./validation_schemas');
const { ScriptManager } = require('./script_management_system');
const { UserProfileManager, InteractionLogger } = require('./data_recording_system');
const { PanelMonitoringSystem } = require('./panel_monitoring_system');
const { CommunicationChannelManager } = require('./call_chat_differentiation');
const { chatbotService } = require('./chatbot_service');

const logger = createLogger('API');

// Initialize subsystems
const scriptManager = new ScriptManager();
const userProfileManager = new UserProfileManager();
const interactionLogger = new InteractionLogger();
const panelMonitor = new PanelMonitoringSystem();
const channelManager = new CommunicationChannelManager();

// Start panel monitoring
panelMonitor.start();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// Security Middleware
// ==========================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

// ==========================================
// Request Logging Middleware
// ==========================================

app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });
  
  next();
});

// ==========================================
// Static Files & Dashboard
// ==========================================

// Serve the login page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/login.html');
});

// Serve the dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/dashboard.html');
});

// ==========================================
// Authentication Endpoints
// ==========================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const result = await authSystem.register(email, password, name);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Registration failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authSystem.login(email, password);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    logger.error('Login failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.post('/api/auth/logout', authMiddleware(), async (req, res) => {
  try {
    await authSystem.logout(req.user.email);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.get('/api/auth/me', authMiddleware(), (req, res) => {
  try {
    const profile = authSystem.getUserProfile(req.user.email);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PROFILE_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// ==========================================
// Health Check Endpoints (No Auth Required)
// ==========================================

app.get('/health', async (req, res) => {
  try {
    const health = await healthCheckSystem.performHealthCheck();
    const statusCode = health.overallStatus === 'healthy' ? 200 : 
                       health.overallStatus === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.get('/health/summary', (req, res) => {
  const summary = healthCheckSystem.getSummary();
  res.json({
    success: true,
    data: summary
  });
});

app.get('/info', (req, res) => {
  const info = healthCheckSystem.getSystemInfo();
  res.json({
    success: true,
    data: info
  });
});

// ==========================================
// Authentication Endpoints
// ==========================================

app.post('/auth/register', async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    
    const user = await authService.register(username, password, email, role);
    
    res.status(201).json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Registration failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const result = await authService.login(username, password);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logSecurityEvent('LOGIN_FAILED', { username, reason: error.message });
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    const result = await authService.refreshToken(refreshToken);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_REFRESH_FAILED',
        message: 'Invalid refresh token',
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.post('/auth/logout', authMiddleware(), async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    await authService.logout(req.user.username, refreshToken);
    
    res.json({
      success: true,
      data: { message: 'Logged out successfully' }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// ==========================================
// Protected API Endpoints
// ==========================================

// User profile endpoints
app.get('/api/users/me', authMiddleware(), (req, res) => {
  const user = authService.getUser(req.user.username);
  res.json({
    success: true,
    data: user
  });
});

app.put('/api/users/me/password', authMiddleware(), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    await authService.changePassword(req.user.username, currentPassword, newPassword);
    
    res.json({
      success: true,
      data: { message: 'Password changed successfully' }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'PASSWORD_CHANGE_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Script management endpoints
app.get('/api/scripts', authMiddleware({ requirePermission: 'view_scripts' }), (req, res) => {
  const { status, category, type } = req.query;
  const scripts = scriptManager.listScripts({ status, category, type });
  
  res.json({
    success: true,
    data: scripts
  });
});

app.post('/api/scripts', authMiddleware({ requirePermission: 'manage_scripts' }), async (req, res) => {
  try {
    const { scriptId, content, name, description, type, category } = req.body;
    
    const script = await scriptManager.uploadScript(scriptId, {
      content,
      name,
      description,
      type,
      category
    });
    
    res.status(201).json({
      success: true,
      data: script
    });
  } catch (error) {
    logger.error('Script upload failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: {
        code: 'SCRIPT_UPLOAD_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.get('/api/scripts/:scriptId', authMiddleware({ requirePermission: 'view_scripts' }), (req, res) => {
  const script = scriptManager.getScript(req.params.scriptId);
  
  if (!script) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'SCRIPT_NOT_FOUND',
        message: 'Script not found',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  res.json({
    success: true,
    data: script
  });
});

app.post('/api/scripts/:scriptId/activate', authMiddleware({ requirePermission: 'manage_scripts' }), async (req, res) => {
  try {
    const script = await scriptManager.activateScript(req.params.scriptId);
    
    res.json({
      success: true,
      data: script
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'SCRIPT_ACTIVATION_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Client/User profile endpoints
app.get('/api/clients/:clientId', authMiddleware(), (req, res) => {
  const profile = userProfileManager.getProfile(req.params.clientId);
  
  if (!profile) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  res.json({
    success: true,
    data: userProfileManager.sanitizeProfile(profile)
  });
});

app.post('/api/clients', authMiddleware(), async (req, res) => {
  try {
    const { clientId, userDetails } = req.body;
    
    const profile = await userProfileManager.createUserProfile(clientId, userDetails);
    
    res.status(201).json({
      success: true,
      data: profile
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'CLIENT_CREATION_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Interaction processing endpoint
app.post('/api/interactions', authMiddleware({ requirePermission: 'execute_interactions' }), async (req, res) => {
  try {
    const validation = validateInput(AgentConfigSchema, req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const inputData = validation.data;
    
    // Determine optimal channel
    const channelDecision = channelManager.determineOptimalChannel(
      inputData.clientId,
      {
        urgency: inputData.urgency || 'medium',
        complexity: inputData.complexity || 'low',
        requiresDocumentation: !!inputData.requiresDocumentation,
        clientMayBeMultitasking: !!inputData.clientMayBeMultitasking
      }
    );

    // Log interaction
    interactionLogger.logInteraction({
      clientId: inputData.clientId,
      agentId: inputData.agentId,
      channel: channelDecision.recommendedChannel,
      status: 'processed',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        clientId: inputData.clientId,
        recommendedChannel: channelDecision.recommendedChannel,
        channelScores: channelDecision.scores,
        reason: channelDecision.reason,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Interaction processing failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERACTION_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// ==========================================
// Chatbot API Endpoints (Using ChatbotService)
// ==========================================

// Get all clients
app.get('/api/chatbot/clients', (req, res) => {
  try {
    const clients = chatbotService.getAllClients();
    const stats = chatbotService.getClientStats();
    
    res.json({
      success: true,
      data: clients,
      stats
    });
  } catch (error) {
    logger.error('Get clients failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CLIENTS_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Get client details
app.get('/api/chatbot/clients/:clientId', (req, res) => {
  try {
    const client = chatbotService.getClient(req.params.clientId);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found'
        }
      });
    }
    
    res.json({
      success: true,
      data: client
    });
  } catch (error) {
    logger.error('Get client failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CLIENT_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Send chat message
app.post('/api/chatbot/message', async (req, res) => {
  try {
    const { clientId, message, channel = 'chat' } = req.body;
    
    if (!clientId || !message) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'clientId and message are required'
        }
      });
    }
    
    const result = await chatbotService.processMessage(clientId, message, channel);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Send message failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'SEND_MESSAGE_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Send email
app.post('/api/chatbot/email', async (req, res) => {
  try {
    const { clientId, to, subject, body } = req.body;
    
    if (!to || !subject || !body) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'to, subject, and body are required'
        }
      });
    }
    
    const result = await chatbotService.sendEmail(clientId, to, subject, body);
    res.json(result);
  } catch (error) {
    logger.error('Send email failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'SEND_EMAIL_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Initiate call
app.post('/api/chatbot/call', async (req, res) => {
  try {
    const { clientId, number, purpose } = req.body;
    
    if (!number) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Phone number is required'
        }
      });
    }
    
    const result = await chatbotService.initiateCall(clientId, number, purpose);
    res.json(result);
  } catch (error) {
    logger.error('Initiate call failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'INITIATE_CALL_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// End call
app.post('/api/chatbot/call/:callId/end', async (req, res) => {
  try {
    const { callId } = req.params;
    const result = await chatbotService.endCall(callId);
    res.json(result);
  } catch (error) {
    logger.error('End call failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'END_CALL_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Send WhatsApp
app.post('/api/chatbot/whatsapp', async (req, res) => {
  try {
    const { clientId, number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Number and message are required'
        }
      });
    }
    
    const result = await chatbotService.sendWhatsApp(clientId, number, message);
    res.json(result);
  } catch (error) {
    logger.error('Send WhatsApp failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'SEND_WHATSAPP_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Send SMS
app.post('/api/chatbot/sms', async (req, res) => {
  try {
    const { clientId, number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Number and message are required'
        }
      });
    }
    
    if (message.length > 160) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MESSAGE_TOO_LONG',
          message: 'SMS must be 160 characters or less'
        }
      });
    }
    
    const result = await chatbotService.sendSMS(clientId, number, message);
    res.json(result);
  } catch (error) {
    logger.error('Send SMS failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'SEND_SMS_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Get conversation history
app.get('/api/chatbot/clients/:clientId/history', (req, res) => {
  try {
    const history = chatbotService.getConversationHistory(req.params.clientId);
    res.json({
      success: true,
      data: {
        clientId: req.params.clientId,
        history,
        count: history.length
      }
    });
  } catch (error) {
    logger.error('Get history failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_HISTORY_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Dashboard/Panel endpoints
app.get('/api/dashboard', authMiddleware(), (req, res) => {
  const { role } = req.query;
  const dashboardRole = role || req.user.role;
  
  const dashboard = panelMonitor.getDashboardData(dashboardRole);
  
  res.json({
    success: true,
    data: dashboard
  });
});

app.get('/api/health/system', authMiddleware({ requireRole: ROLES.MANAGER }), (req, res) => {
  const health = panelMonitor.getSystemHealth();
  
  res.json({
    success: true,
    data: health
  });
});

app.get('/api/load', authMiddleware({ requireRole: ROLES.MANAGER }), (req, res) => {
  const load = panelMonitor.getSystemLoad();
  
  res.json({
    success: true,
    data: load
  });
});

// Admin endpoints
app.get('/api/admin/users', authMiddleware({ requireRole: ROLES.ADMINISTRATOR }), (req, res) => {
  const users = authService.getAllUsers();
  
  res.json({
    success: true,
    data: users
  });
});

app.get('/api/admin/monitoring/status', authMiddleware({ requireRole: ROLES.ADMINISTRATOR }), (req, res) => {
  const status = panelMonitor.getMonitoringStatus();
  
  res.json({
    success: true,
    data: status
  });
});

// ==========================================
// Error Handling
// ==========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      timestamp: new Date().toISOString()
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : err.message,
      timestamp: new Date().toISOString()
    }
  });
});

// ==========================================
// Graceful Shutdown
// ==========================================

let server;

const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  // Stop panel monitoring
  panelMonitor.stop();
  
  if (server) {
    server.close((err) => {
      if (err) {
        logger.error('Error during server shutdown', { error: err.message });
        process.exit(1);
      }
      
      logger.info('Server closed. Exiting process.');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ==========================================
// Start Server
// ==========================================

const startServer = () => {
  server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`, {
      environment: process.env.NODE_ENV || 'development',
      version: healthCheckSystem.version
    });
  });

  return server;
};

// Export for testing
module.exports = {
  app,
  startServer,
  scriptManager,
  userProfileManager,
  panelMonitor
};

// Start server if run directly
if (require.main === module) {
  startServer();
}
