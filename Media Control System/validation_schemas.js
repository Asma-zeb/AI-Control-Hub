// Input Validation Schemas using Zod
// Centralized validation for all input data

const { z } = require('zod');

// ==========================================
// Base Schemas
// ==========================================

const EmailSchema = z.string().email('Invalid email address').optional().or(z.literal(''));
const PhoneSchema = z.string().regex(/^\+?[\d\s-()]{10,}$/, 'Invalid phone number').optional().or(z.literal(''));
const ISODateString = z.string().datetime().optional();

// ==========================================
// User Details Schema
// ==========================================

const UserDetailsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  email: EmailSchema,
  phone: PhoneSchema,
  company: z.string().max(200).optional(),
  department: z.string().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  preferences: z.object({
    contactMethod: z.enum(['email', 'phone', 'chat', 'call']).optional(),
    timezone: z.string().max(50).optional(),
    preferredHours: z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format').optional(),
      end: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format').optional()
    }).optional(),
    doNotDisturb: z.boolean().optional(),
    language: z.string().max(10).optional()
  }).optional(),
  metadata: z.record(z.unknown()).optional()
}).strict();

// ==========================================
// Agent Configuration Schema
// ==========================================

const AgentConfigSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required').max(100),
  clientId: z.string().min(1, 'Client ID is required').max(100),
  chatMode: z.enum(['chat', 'call', 'inactive']).default('inactive'),
  callMode: z.enum(['active', 'inactive', 'blocked']).default('inactive'),
  configValid: z.boolean().default(false),
  scriptId: z.string().min(1, 'Script ID is required').max(100),
  scriptContent: z.string().max(102400, 'Script content exceeds size limit').optional(),
  scriptName: z.string().max(200).optional(),
  jobSector: z.string().max(100).optional(),
  jobRole: z.string().max(100).optional(),
  userDetails: UserDetailsSchema.optional(),
  notes: z.string().max(5000).optional(),
  interactionHistory: z.array(z.object({
    timestamp: z.string().datetime(),
    mode: z.enum(['chat', 'call']),
    result: z.string(),
    duration: z.number().optional(),
    notes: z.string().optional()
  })).optional(),
  followUpCount: z.number().int().min(0).max(3).default(0),
  lastResponseTime: ISODateString,
  isCall: z.boolean().default(false),
  urgency: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  complexity: z.enum(['low', 'medium', 'high']).default('low'),
  requiresDocumentation: z.boolean().optional(),
  clientMayBeMultitasking: z.boolean().optional(),
  timing: z.object({
    availability: z.string().optional(),
    timezone: z.string().optional()
  }).optional(),
  scale: z.object({
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    channelPreference: z.enum(['chat', 'call', 'escalation']).optional()
  }).optional(),
  showInPanel: z.boolean().default(true),
  systemLoad: z.number().min(0).max(100).optional(),
  activeSessions: z.number().int().min(0).optional(),
  isTested: z.boolean().default(false),
  nextAction: z.string().max(200).optional(),
  noResponse: z.boolean().default(false)
}).strict();

// ==========================================
// Script Management Schema
// ==========================================

const ScriptUploadSchema = z.object({
  scriptId: z.string().min(1, 'Script ID is required').max(100),
  content: z.string().min(1, 'Script content is required').max(102400),
  name: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  author: z.string().max(100).optional(),
  type: z.enum(['conversation', 'javascript', 'markdown', 'json']).default('conversation'),
  category: z.string().max(100).optional(),
  targetAudience: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional()
}).strict();

const ScriptUpdateSchema = ScriptUploadSchema.partial().extend({
  scriptId: z.string().min(1, 'Script ID is required').max(100)
}).strict();

// ==========================================
// Authentication Schema
// ==========================================

const LoginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128)
}).strict();

const RegisterSchema = LoginSchema.extend({
  email: z.string().email('Invalid email address'),
  role: z.enum(['operational', 'manager', 'administrator']).default('operational')
}).strict();

const TokenRefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
}).strict();

// ==========================================
// Communication Schema
// ==========================================

const CommunicationRequestSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required').max(100),
  channel: z.enum(['chat', 'call']),
  message: z.string().max(5000).optional(),
  scriptId: z.string().max(100).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  scheduledTime: ISODateString,
  metadata: z.record(z.unknown()).optional()
}).strict();

const FollowUpRequestSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required').max(100),
  interactionData: z.object({
    followUpCount: z.number().int().min(0).max(3),
    lastInteractionTime: ISODateString,
    lastInteractionResult: z.string().optional(),
    channel: z.enum(['chat', 'call'])
  })
}).strict();

// ==========================================
// Panel Monitoring Schema
// ==========================================

const DashboardRequestSchema = z.object({
  role: z.enum(['operational', 'manager', 'administrator']).default('operational'),
  timeRange: z.object({
    start: ISODateString,
    end: ISODateString
  }).optional(),
  filters: z.object({
    agentId: z.string().max(100).optional(),
    clientId: z.string().max(100).optional(),
    channel: z.enum(['chat', 'call']).optional(),
    status: z.enum(['healthy', 'warning', 'critical']).optional()
  }).optional()
}).strict();

// ==========================================
// Health Check Schema
// ==========================================

const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'warning', 'critical']),
  timestamp: z.string().datetime(),
  version: z.string(),
  uptime: z.number(),
  services: z.object({
    database: z.enum(['up', 'down', 'degraded']).optional(),
    cache: z.enum(['up', 'down', 'degraded']).optional(),
    agents: z.enum(['up', 'down', 'degraded']).optional()
  }),
  metrics: z.object({
    cpuUsage: z.number().min(0).max(100),
    memoryUsage: z.number().min(0).max(100),
    activeSessions: z.number().int().min(0),
    queueLength: z.number().int().min(0)
  }).optional()
});

// ==========================================
// Error Response Schema
// ==========================================

const ErrorResponseSchema = z.object({
  success: z.boolean().default(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime()
  })
});

// ==========================================
// Validation Helper Functions
// ==========================================

/**
 * Validates input against a schema
 * @param {object} schema - Zod schema to validate against
 * @param {object} data - Data to validate
 * @returns {{ success: boolean, data?: object, error?: object }}
 */
function validateInput(schema, data) {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          })),
          timestamp: new Date().toISOString()
        }
      };
    }
    throw error;
  }
}

/**
 * Creates a validation middleware for Express
 * @param {object} schema - Zod schema to validate against
 * @returns {function} Express middleware function
 */
function createValidationMiddleware(schema) {
  return (req, res, next) => {
    const validation = validateInput(schema, req.body);
    if (!validation.success) {
      return res.status(400).json(validation.error);
    }
    req.validatedBody = validation.data;
    next();
  };
}

module.exports = {
  // Schemas
  UserDetailsSchema,
  AgentConfigSchema,
  ScriptUploadSchema,
  ScriptUpdateSchema,
  LoginSchema,
  RegisterSchema,
  TokenRefreshSchema,
  CommunicationRequestSchema,
  FollowUpRequestSchema,
  DashboardRequestSchema,
  HealthCheckResponseSchema,
  ErrorResponseSchema,
  
  // Helper functions
  validateInput,
  createValidationMiddleware
};
