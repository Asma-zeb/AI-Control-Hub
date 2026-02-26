// Call Bot vs Chat Bot Differentiation Logic
// SECURED: Added rate limiting and request throttling

const rateLimit = require('express-rate-limit');
const { createLogger, logSecurityEvent } = require('./logger');

const logger = createLogger('CommunicationChannelManager');

/**
 * Rate limiter for communication requests
 */
const communicationRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many communication requests. Please try again later.',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.username || req.ip || 'anonymous';
  }
});

/**
 * Rate limiter for call operations (stricter limits)
 */
const callRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 calls per hour per user
  message: {
    success: false,
    error: {
      code: 'CALL_RATE_LIMIT_EXCEEDED',
      message: 'Too many call requests. Please try again later.',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for chat operations (more lenient)
 */
const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 chat messages per minute
  message: {
    success: false,
    error: {
      code: 'CHAT_RATE_LIMIT_EXCEEDED',
      message: 'Too many chat messages. Please slow down.',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Communication Channel Manager - Decides between call and chat modes
 * IMPROVED: Added rate limiting and capacity management
 */
class CommunicationChannelManager {
  constructor() {
    this.clientPreferences = new Map();
    this.channelCapabilities = {
      call: {
        availability: true,
        capacity: { maxConcurrent: parseInt(process.env.CALL_MAX_CONCURRENT) || 100, current: 0 },
        costPerMinute: 0.05,
        qualityMetrics: {
          connectionStability: 0.95,
          audioQuality: 0.9,
          callDurationAvg: 300
        },
        rateLimiter: callRateLimiter
      },
      chat: {
        availability: true,
        capacity: { maxConcurrent: parseInt(process.env.CHAT_MAX_CONCURRENT) || 500, current: 0 },
        costPerInteraction: 0.01,
        qualityMetrics: {
          responseTime: 3000,
          typingSpeed: 150,
          satisfactionRating: 4.2
        },
        rateLimiter: chatRateLimiter
      }
    };
    
    // Request tracking for anomaly detection
    this.requestHistory = new Map();
    this.anomalyThresholds = {
      maxRequestsPerMinute: 60,
      maxConcurrentRequests: 10
    };
  }

  /**
   * Determines the optimal communication channel for a client
   */
  determineOptimalChannel(clientId, interactionContext) {
    try {
      const preferences = this.getClientPreferences(clientId);
      
      const channelScores = {
        call: this.evaluateCallChannel(clientId, interactionContext, preferences),
        chat: this.evaluateChatChannel(clientId, interactionContext, preferences)
      };

      interactionContext.channelScores = channelScores;

      const optimalChannel = channelScores.call.score >= channelScores.chat.score ? 'call' : 'chat';
      
      logger.debug('Channel decision', { 
        clientId, 
        recommendedChannel: optimalChannel,
        scores: channelScores 
      });

      return {
        recommendedChannel: optimalChannel,
        confidence: Math.abs(channelScores.call.score - channelScores.chat.score),
        scores: channelScores,
        reason: this.getRecommendationReason(optimalChannel, channelScores, preferences)
      };
    } catch (error) {
      logger.error('Channel determination failed', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Evaluates suitability of call channel
   */
  evaluateCallChannel(clientId, context, preferences) {
    let score = 0;
    const factors = {};

    // Client preference factor
    if (preferences.preferredChannel === 'call') {
      score += 20;
      factors.clientPreference = 20;
    } else if (preferences.preferredChannel === 'chat') {
      score -= 10;
      factors.clientPreference = -10;
    }

    // Urgency factor
    if (context.urgency === 'high') {
      score += 15;
      factors.urgency = 15;
    } else if (context.urgency === 'low') {
      score -= 5;
      factors.urgency = -5;
    }

    // Complexity factor
    if (context.complexity === 'high') {
      score += 10;
      factors.complexity = 10;
    } else if (context.complexity === 'low') {
      score -= 3;
      factors.complexity = -3;
    }

    // Time of day factor
    if (this.isWithinCallHours(preferences)) {
      score += 10;
      factors.timeOfDay = 10;
    } else {
      score -= 15;
      factors.timeOfDay = -15;
    }

    // Language factor
    if (context.languageMismatch) {
      score -= 12;
      factors.language = -12;
    }

    // Past success with calls
    const callSuccessRate = this.getClientChannelSuccessRate(clientId, 'call');
    score += (callSuccessRate * 20) - 10;
    factors.pastSuccess = (callSuccessRate * 20) - 10;

    // Capacity factor - IMPROVED: More granular capacity checking
    const capacityRatio = this.channelCapabilities.call.capacity.current /
                         this.channelCapabilities.call.capacity.maxConcurrent;
    if (capacityRatio > 0.9) {
      score -= 20; // Near capacity - strongly discourage
      factors.capacity = -20;
    } else if (capacityRatio > 0.8) {
      score -= 15;
      factors.capacity = -15;
    } else if (capacityRatio > 0.6) {
      score -= 5;
      factors.capacity = -5;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      factors: factors
    };
  }

  /**
   * Evaluates suitability of chat channel
   */
  evaluateChatChannel(clientId, context, preferences) {
    let score = 0;
    const factors = {};

    // Client preference factor
    if (preferences.preferredChannel === 'chat') {
      score += 20;
      factors.clientPreference = 20;
    } else if (preferences.preferredChannel === 'call') {
      score -= 10;
      factors.clientPreference = -10;
    }

    // Convenience factor
    score += 5;
    factors.convenience = 5;

    // Multitasking ability
    if (context.clientMayBeMultitasking) {
      score += 8;
      factors.multitasking = 8;
    }

    // Documentation needed
    if (context.requiresDocumentation) {
      score += 12;
      factors.documentation = 12;
    }

    // Technical complexity
    if (context.requiresTechnicalDetails) {
      score += 10;
      factors.technical = 10;
    }

    // Past success with chat
    const chatSuccessRate = this.getClientChannelSuccessRate(clientId, 'chat');
    score += (chatSuccessRate * 20) - 10;
    factors.pastSuccess = (chatSuccessRate * 20) - 10;

    // Capacity factor
    const capacityRatio = this.channelCapabilities.chat.capacity.current /
                         this.channelCapabilities.chat.capacity.maxConcurrent;
    if (capacityRatio > 0.9) {
      score -= 15;
      factors.capacity = -15;
    } else if (capacityRatio > 0.8) {
      score -= 8;
      factors.capacity = -8;
    } else if (capacityRatio > 0.7) {
      score -= 3;
      factors.capacity = -3;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      factors: factors
    };
  }

  /**
   * Checks if current time is within acceptable call hours
   */
  isWithinCallHours(preferences) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    // Weekend check (optional - can be configured)
    if (preferences.noWeekendCalls && (currentDay === 0 || currentDay === 6)) {
      return false;
    }

    // Default business hours
    const startHour = parseInt(preferences.preferredHours?.start?.split(':')[0]) || 9;
    const endHour = parseInt(preferences.preferredHours?.end?.split(':')[0]) || 17;

    return currentHour >= startHour && currentHour < endHour && !preferences.doNotDisturb;
  }

  /**
   * Gets client preferences
   */
  getClientPreferences(clientId) {
    return this.clientPreferences.get(clientId) || {
      preferredChannel: 'chat',
      preferredHours: { start: '09:00', end: '17:00' },
      doNotDisturb: false,
      noWeekendCalls: false
    };
  }

  /**
   * Gets client's success rate with a specific channel
   */
  getClientChannelSuccessRate(clientId, channel) {
    // In production, this would pull from historical data
    if (channel === 'call') {
      return 0.85;
    } else {
      return 0.92;
    }
  }

  /**
   * Gets recommendation reason
   */
  getRecommendationReason(recommendedChannel, scores, preferences) {
    const reasons = [];

    if (recommendedChannel === 'call') {
      if (preferences.preferredChannel === 'call') reasons.push('Matches client preference');
      if (scores.call.factors.urgency > 0) reasons.push('High urgency situation');
      if (scores.call.factors.complexity > 0) reasons.push('Complex issue requiring detailed discussion');
      if (scores.call.factors.timeOfDay > 0) reasons.push('Within business hours');
    } else {
      if (preferences.preferredChannel === 'chat') reasons.push('Matches client preference');
      if (scores.chat.factors.documentation > 0) reasons.push('Requires documentation');
      if (scores.chat.factors.technical > 0) reasons.push('Technical details easier to convey in text');
      if (scores.chat.factors.convenience > 0) reasons.push('More convenient for client');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Algorithmic recommendation based on scoring';
  }

  /**
   * Updates client preferences
   */
  updateClientPreferences(clientId, preferences) {
    const existingPrefs = this.getClientPreferences(clientId);
    const updatedPrefs = { ...existingPrefs, ...preferences };

    this.clientPreferences.set(clientId, updatedPrefs);
    logger.debug('Client preferences updated', { clientId, preferences: updatedPrefs });
    
    return updatedPrefs;
  }

  /**
   * Gets channel capacity utilization
   */
  getChannelCapacity() {
    return {
      call: {
        utilization: Math.round((this.channelCapabilities.call.capacity.current /
                    this.channelCapabilities.call.capacity.maxConcurrent) * 100) + '%',
        available: this.channelCapabilities.call.capacity.maxConcurrent -
                  this.channelCapabilities.call.capacity.current,
        maxConcurrent: this.channelCapabilities.call.capacity.maxConcurrent
      },
      chat: {
        utilization: Math.round((this.channelCapabilities.chat.capacity.current /
                    this.channelCapabilities.chat.capacity.maxConcurrent) * 100) + '%',
        available: this.channelCapabilities.chat.capacity.maxConcurrent -
                  this.channelCapabilities.chat.capacity.current,
        maxConcurrent: this.channelCapabilities.chat.capacity.maxConcurrent
      }
    };
  }

  /**
   * Reserves channel capacity with validation
   */
  reserveChannelCapacity(channel, amount = 1) {
    const capacity = this.channelCapabilities[channel].capacity;
    
    // Check if reservation is possible
    if (capacity.current + amount > capacity.maxConcurrent) {
      logSecurityEvent('CAPACITY_EXCEEDED', { 
        channel, 
        current: capacity.current, 
        requested: amount,
        max: capacity.maxConcurrent 
      });
      
      return {
        success: false,
        reason: 'Capacity exceeded',
        current: capacity.current,
        available: 0
      };
    }

    capacity.current = Math.min(capacity.maxConcurrent, capacity.current + amount);
    logger.debug('Channel capacity reserved', { channel, amount, current: capacity.current });

    return {
      success: true,
      current: capacity.current,
      available: capacity.maxConcurrent - capacity.current
    };
  }

  /**
   * Releases channel capacity
   */
  releaseChannelCapacity(channel, amount = 1) {
    const capacity = this.channelCapabilities[channel].capacity;
    capacity.current = Math.max(0, capacity.current - amount);
    
    logger.debug('Channel capacity released', { channel, amount, current: capacity.current });

    return {
      success: true,
      current: capacity.current,
      available: capacity.maxConcurrent - capacity.current
    };
  }

  /**
   * Gets channel selection model parameters
   */
  getModelParameters() {
    return {
      weights: {
        clientPreference: 0.25,
        urgency: 0.20,
        complexity: 0.15,
        convenience: 0.10,
        availability: 0.10,
        pastSuccess: 0.10,
        capacity: 0.10
      },
      thresholds: {
        callMinScore: 60,
        chatMinScore: 50,
        certaintyThreshold: 15
      },
      rateLimits: {
        call: {
          windowMs: 60 * 60 * 1000,
          max: 50
        },
        chat: {
          windowMs: 60 * 1000,
          max: 30
        }
      }
    };
  }

  /**
   * Checks for anomalous request patterns
   */
  trackRequest(clientId) {
    const now = Date.now();
    const clientHistory = this.requestHistory.get(clientId) || [];
    
    // Remove old entries (older than 1 minute)
    const recentHistory = clientHistory.filter(timestamp => now - timestamp < 60000);
    recentHistory.push(now);
    
    this.requestHistory.set(clientId, recentHistory);
    
    // Check for anomalies
    if (recentHistory.length > this.anomalyThresholds.maxRequestsPerMinute) {
      logSecurityEvent('ANOMALOUS_REQUEST_PATTERN', {
        clientId,
        requestsPerMinute: recentHistory.length,
        threshold: this.anomalyThresholds.maxRequestsPerMinute
      });
      
      return {
        isAnomalous: true,
        reason: 'Excessive requests per minute'
      };
    }
    
    return {
      isAnomalous: false,
      requestsPerMinute: recentHistory.length
    };
  }

  /**
   * Gets rate limiters for Express middleware
   */
  getRateLimiters() {
    return {
      communication: communicationRateLimiter,
      call: callRateLimiter,
      chat: chatRateLimiter
    };
  }
}

/**
 * Call Management System - Handles call-specific functionality
 */
class CallManagementSystem {
  constructor() {
    this.activeCalls = new Map();
    this.callHistory = [];
    this.logger = createLogger('CallManagementSystem');
  }

  /**
   * Initiates a call with validation
   */
  async initiateCall(clientId, callParams) {
    try {
      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const call = {
        id: callId,
        clientId,
        initiatedAt: new Date().toISOString(),
        status: 'initiated',
        params: callParams,
        connectedAt: null,
        endedAt: null,
        duration: null,
        qualityMetrics: {
          connectionStability: null,
          audioQuality: null,
          customerSatisfaction: null
        }
      };

      this.activeCalls.set(callId, call);
      this.logger.info('Call initiated', { callId, clientId });

      // Simulate call connection process
      setTimeout(() => {
        this.simulateCallProgress(callId);
      }, 2000);

      return callId;
    } catch (error) {
      this.logger.error('Call initiation failed', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Simulates call progress for demo purposes
   */
  simulateCallProgress(callId) {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    call.status = 'connected';
    call.connectedAt = new Date().toISOString();

    const duration = 120 + Math.random() * 180;

    setTimeout(() => {
      this.endCall(callId, { satisfaction: 4.5, notes: 'Successful call' });
    }, duration * 1000);
  }

  /**
   * Ends a call
   */
  endCall(callId, endParams = {}) {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    call.status = 'ended';
    call.endedAt = new Date().toISOString();
    call.duration = (new Date(call.endedAt) - new Date(call.connectedAt)) / 1000;
    call.endParams = endParams;

    this.callHistory.push({ ...call });
    this.activeCalls.delete(callId);

    call.qualityMetrics.connectionStability = 0.95 + (Math.random() * 0.05);
    call.qualityMetrics.audioQuality = 0.85 + (Math.random() * 0.15);
    call.qualityMetrics.customerSatisfaction = endParams.satisfaction || (3 + Math.random() * 2);

    this.logger.info('Call ended', { 
      callId, 
      duration: call.duration,
      satisfaction: call.qualityMetrics.customerSatisfaction 
    });

    return call;
  }

  /**
   * Gets active call information
   */
  getActiveCall(callId) {
    return this.activeCalls.get(callId);
  }

  /**
   * Gets call statistics
   */
  getCallStats() {
    const totalCalls = this.callHistory.length;
    const successfulCalls = this.callHistory.filter(c =>
      c.status === 'ended' && c.duration > 0
    ).length;

    const avgDuration = totalCalls > 0 ?
      this.callHistory.reduce((sum, call) => sum + (call.duration || 0), 0) / totalCalls : 0;

    const avgSatisfaction = totalCalls > 0 ?
      this.callHistory.reduce((sum, call) =>
        sum + (call.qualityMetrics.customerSatisfaction || 0), 0) / totalCalls : 0;

    return {
      totalCalls,
      successfulCalls,
      successRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
      averageDuration: Math.round(avgDuration),
      averageSatisfaction: parseFloat(avgSatisfaction.toFixed(2)),
      activeCalls: this.activeCalls.size
    };
  }

  /**
   * Gets active calls list
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.values()).map(call => ({
      id: call.id,
      clientId: call.clientId,
      status: call.status,
      initiatedAt: call.initiatedAt,
      duration: call.connectedAt ? 
        Math.round((Date.now() - new Date(call.connectedAt).getTime()) / 1000) : 0
    }));
  }
}

module.exports = {
  CommunicationChannelManager,
  CallManagementSystem,
  communicationRateLimiter,
  callRateLimiter,
  chatRateLimiter
};
