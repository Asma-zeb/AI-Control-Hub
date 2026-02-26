// Data Recording and User Details Management
// SECURED: Input sanitization and validation

const sanitizeHtml = require('sanitize-html');
const validator = require('validator');
const { createLogger } = require('./logger');
const { validateInput, UserDetailsSchema } = require('./validation_schemas');

const logger = createLogger('UserProfileManager');

/**
 * Sanitization utilities
 */
const Sanitizer = {
  /**
   * Sanitizes HTML content to prevent XSS
   */
  sanitizeHTML(content, options = {}) {
    if (!content) return '';
    if (typeof content !== 'string') return String(content);
    
    return sanitizeHtml(content, {
      allowedTags: options.allowedTags || [], // Default: no tags allowed
      allowedAttributes: options.allowedAttributes || {},
      disallowedTagsMode: 'discard',
      textFilter: (text) => text.replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&#x27;')
    });
  },

  /**
   * Sanitizes text input
   */
  sanitizeText(text, maxLength = 500) {
    if (!text) return '';
    if (typeof text !== 'string') return String(text);
    
    // Remove potential script injections
    let sanitized = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Trim and limit length
    sanitized = sanitized.trim().slice(0, maxLength);
    
    // Escape HTML entities
    return validator.escape(sanitized);
  },

  /**
   * Sanitizes email
   */
  sanitizeEmail(email) {
    if (!email) return '';
    return validator.normalizeEmail(email) || '';
  },

  /**
   * Sanitizes phone number
   */
  sanitizePhone(phone) {
    if (!phone) return '';
    // Remove all non-digit characters except +
    return validator.trim(validator.blacklist(phone.replace(/^\+/, ''), '^-\\d\\s()'));
  },

  /**
   * Sanitizes URL
   */
  sanitizeURL(url) {
    if (!url) return '';
    return validator.whitelist(url, 'a-zA-Z0-9-._~:/?#[]@!$&\'()*+,;=%');
  },

  /**
   * Sanitizes JSON object
   */
  sanitizeObject(obj, schema = null) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key to prevent prototype pollution
      const safeKey = validator.escape(String(key));
      
      if (safeKey === '__proto__' || safeKey === 'constructor' || safeKey === 'prototype') {
        logger.warn('Attempted prototype pollution detected', { key });
        continue;
      }
      
      if (typeof value === 'string') {
        sanitized[safeKey] = this.sanitizeText(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[safeKey] = this.sanitizeObject(value);
      } else {
        sanitized[safeKey] = value;
      }
    }
    
    return sanitized;
  }
};

/**
 * Manages user profile creation and updates
 */
class UserProfileManager {
  constructor() {
    this.profiles = new Map();
    this.profileIndex = new Map(); // For faster lookups
  }

  /**
   * Creates or updates a user profile with sanitization
   */
  async createUserProfile(clientId, userData) {
    try {
      // Validate client ID
      if (!clientId || typeof clientId !== 'string') {
        throw new Error('Invalid client ID');
      }
      
      // Sanitize client ID
      const safeClientId = Sanitizer.sanitizeText(clientId, 100);
      
      // Validate and sanitize user data
      const sanitizedData = this.sanitizeUserData(userData);
      
      const existingProfile = this.profiles.get(safeClientId);

      if (existingProfile) {
        const updatedProfile = this.updateProfile(existingProfile, sanitizedData);
        this.profiles.set(safeClientId, updatedProfile);
        logger.info('Profile updated', { clientId: safeClientId });
        return updatedProfile;
      } else {
        const newProfile = this.createNewProfile(safeClientId, sanitizedData);
        this.profiles.set(safeClientId, newProfile);
        this.indexProfile(newProfile);
        logger.info('Profile created', { clientId: safeClientId });
        return newProfile;
      }
    } catch (error) {
      logger.error('Error creating user profile', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Sanitizes user data input
   */
  sanitizeUserData(userData) {
    if (!userData || typeof userData !== 'object') {
      return {};
    }

    const sanitized = {};

    // Basic fields
    if (userData.name) sanitized.name = Sanitizer.sanitizeText(userData.name, 200);
    if (userData.email) sanitized.email = Sanitizer.sanitizeEmail(userData.email);
    if (userData.phone) sanitized.phone = Sanitizer.sanitizePhone(userData.phone);
    if (userData.company) sanitized.company = Sanitizer.sanitizeText(userData.company, 200);
    if (userData.department) sanitized.department = Sanitizer.sanitizeText(userData.department, 100);
    if (userData.jobTitle) sanitized.jobTitle = Sanitizer.sanitizeText(userData.jobTitle, 100);
    if (userData.jobSector) sanitized.jobSector = Sanitizer.sanitizeText(userData.jobSector, 100);
    if (userData.jobRole) sanitized.jobRole = Sanitizer.sanitizeText(userData.jobRole, 100);

    // Preferences
    if (userData.preferences) {
      sanitized.preferences = {
        contactMethod: ['email', 'phone', 'chat', 'call'].includes(userData.preferences.contactMethod)
          ? userData.preferences.contactMethod
          : 'email',
        timezone: Sanitizer.sanitizeText(userData.preferences.timezone || 'UTC', 50),
        preferredHours: {
          start: userData.preferences.preferredHours?.start?.match(/^\d{2}:\d{2}$/)
            ? userData.preferences.preferredHours.start
            : '09:00',
          end: userData.preferences.preferredHours?.end?.match(/^\d{2}:\d{2}$/)
            ? userData.preferences.preferredHours.end
            : '17:00'
        },
        doNotDisturb: !!userData.preferences.doNotDisturb,
        language: Sanitizer.sanitizeText(userData.preferences.language || 'en', 10)
      };
    }

    // Notes (sanitize each note)
    if (userData.notes) {
      sanitized.notes = Array.isArray(userData.notes)
        ? userData.notes.map(note => Sanitizer.sanitizeText(note, 1000))
        : [Sanitizer.sanitizeText(userData.notes, 1000)];
    }

    // Metadata (sanitize recursively)
    if (userData.metadata) {
      sanitized.metadata = Sanitizer.sanitizeObject(userData.metadata);
    }

    return sanitized;
  }

  /**
   * Updates an existing user profile
   */
  updateProfile(profile, newData) {
    const updatedProfile = { ...profile };
    const updateLog = [];

    // Update basic information with sanitization
    if (newData.name && newData.name !== profile.name) {
      updatedProfile.name = newData.name;
      updateLog.push('name');
    }
    if (newData.email && newData.email !== profile.email) {
      updatedProfile.email = newData.email;
      updateLog.push('email');
    }
    if (newData.phone && newData.phone !== profile.phone) {
      updatedProfile.phone = newData.phone;
      updateLog.push('phone');
    }
    if (newData.company && newData.company !== profile.company) {
      updatedProfile.company = newData.company;
      updateLog.push('company');
    }

    // Update preferences
    if (newData.preferences) {
      updatedProfile.preferences = {
        ...updatedProfile.preferences,
        ...newData.preferences
      };
      updateLog.push('preferences');
    }

    // Add interaction history
    if (newData.interactionData) {
      const newInteraction = {
        id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        channel: newData.interactionData.channel || 'unknown',
        interactionType: newData.interactionData.interactionType || 'general',
        summary: Sanitizer.sanitizeText(newData.interactionData.summary || '', 2000),
        outcome: newData.interactionData.outcome || 'neutral',
        metadata: newData.interactionData.metadata ? 
          Sanitizer.sanitizeObject(newData.interactionData.metadata) : {}
      };

      updatedProfile.interactionHistory = updatedProfile.interactionHistory || [];
      updatedProfile.interactionHistory.push(newInteraction);
      
      // Keep only last 100 interactions
      if (updatedProfile.interactionHistory.length > 100) {
        updatedProfile.interactionHistory = updatedProfile.interactionHistory.slice(-100);
      }
      
      updateLog.push('interaction');
    }

    // Update last activity
    updatedProfile.lastActivity = new Date().toISOString();
    updatedProfile.updatedDate = new Date().toISOString();

    // Update index
    this.indexProfile(updatedProfile);

    logger.debug('Profile updated', { 
      clientId: profile.clientId, 
      fields: updateLog 
    });

    return updatedProfile;
  }

  /**
   * Creates a new user profile with default values
   */
  createNewProfile(clientId, initialData) {
    const now = new Date().toISOString();

    return {
      clientId,
      name: initialData.name || '',
      email: initialData.email || '',
      phone: initialData.phone || '',
      company: initialData.company || '',
      department: initialData.department || '',
      jobTitle: initialData.jobTitle || '',
      jobSector: initialData.jobSector || '',
      jobRole: initialData.jobRole || '',
      preferences: {
        contactMethod: initialData.preferences?.contactMethod || 'email',
        timezone: initialData.preferences?.timezone || 'UTC',
        preferredHours: initialData.preferences?.preferredHours || { start: '09:00', end: '17:00' },
        doNotDisturb: initialData.preferences?.doNotDisturb || false,
        language: initialData.preferences?.language || 'en'
      },
      interactionHistory: [],
      notes: initialData.notes || [],
      metadata: initialData.metadata || {},
      createdDate: now,
      lastActivity: now,
      updatedDate: now,
      status: 'active',
      engagementScore: 0,
      tags: []
    };
  }

  /**
   * Indexes profile for faster lookups
   */
  indexProfile(profile) {
    // Index by email
    if (profile.email) {
      const emailIndex = this.profileIndex.get(`email:${profile.email}`) || [];
      if (!emailIndex.includes(profile.clientId)) {
        emailIndex.push(profile.clientId);
        this.profileIndex.set(`email:${profile.email}`, emailIndex);
      }
    }
    
    // Index by phone
    if (profile.phone) {
      const phoneIndex = this.profileIndex.get(`phone:${profile.phone}`) || [];
      if (!phoneIndex.includes(profile.clientId)) {
        phoneIndex.push(profile.clientId);
        this.profileIndex.set(`phone:${profile.phone}`, phoneIndex);
      }
    }
  }

  /**
   * Adds a note to user profile
   */
  addNote(clientId, note, category = 'general') {
    const profile = this.profiles.get(clientId);
    if (!profile) {
      throw new Error(`Profile not found for client ${clientId}`);
    }

    const noteObj = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      content: Sanitizer.sanitizeText(note, 2000),
      category: Sanitizer.sanitizeText(category, 50),
      addedBy: 'system'
    };

    profile.notes = profile.notes || [];
    profile.notes.push(noteObj);
    
    // Keep only last 50 notes
    if (profile.notes.length > 50) {
      profile.notes = profile.notes.slice(-50);
    }
    
    profile.updatedDate = new Date().toISOString();
    profile.updatedDate = new Date().toISOString();

    logger.debug('Note added', { clientId, category });

    return noteObj;
  }

  /**
   * Retrieves user profile
   */
  getProfile(clientId) {
    return this.profiles.get(clientId);
  }

  /**
   * Finds profile by email
   */
  findByEmail(email) {
    const safeEmail = Sanitizer.sanitizeEmail(email);
    const clientIds = this.profileIndex.get(`email:${safeEmail}`);
    if (!clientIds) return null;
    return this.profiles.get(clientIds[0]);
  }

  /**
   * Finds profile by phone
   */
  findByPhone(phone) {
    const safePhone = Sanitizer.sanitizePhone(phone);
    const clientIds = this.profileIndex.get(`phone:${safePhone}`);
    if (!clientIds) return null;
    return this.profiles.get(clientIds[0]);
  }

  /**
   * Searches for profiles by criteria
   */
  searchProfiles(criteria) {
    const results = [];

    for (const [id, profile] of this.profiles) {
      let matches = true;

      for (const [key, value] of Object.entries(criteria)) {
        if (profile[key] !== value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        results.push({ ...profile });
      }
    }

    return results;
  }

  /**
   * Updates engagement score based on recent activity
   */
  updateEngagementScore(clientId, activityScore) {
    const profile = this.profiles.get(clientId);
    if (!profile) return null;

    // Calculate new score based on recent activity
    const recentInteractions = profile.interactionHistory?.slice(-10) || [];
    const positiveInteractions = recentInteractions.filter(i =>
      i.outcome === 'positive' || i.outcome === 'engaged'
    ).length;

    const newScore = Math.min(1, positiveInteractions / (recentInteractions.length || 1) + activityScore * 0.1);
    profile.engagementScore = parseFloat(newScore.toFixed(2));

    return profile.engagementScore;
  }

  /**
   * Checks if user details are complete
   */
  isProfileComplete(clientId) {
    const profile = this.profiles.get(clientId);
    if (!profile) return false;

    return !!(
      profile.name &&
      (profile.email || profile.phone) &&
      profile.company
    );
  }

  /**
   * Sanitizes profile data for output (removes sensitive info)
   */
  sanitizeProfile(profile, excludePrivate = false) {
    if (!profile) return null;
    
    const sanitized = { ...profile };

    if (excludePrivate) {
      delete sanitized.email;
      delete sanitized.phone;
      delete sanitized.metadata;
    }

    // Limit interaction history size for output
    if (sanitized.interactionHistory && sanitized.interactionHistory.length > 50) {
      sanitized.interactionHistory = sanitized.interactionHistory.slice(-50);
    }

    // Remove internal fields
    delete sanitized.passwordHash;
    delete sanitized.securityQuestions;

    return sanitized;
  }

  /**
   * Exports profile data (for GDPR compliance)
   */
  exportProfileData(clientId) {
    const profile = this.profiles.get(clientId);
    if (!profile) return null;

    return {
      exportedAt: new Date().toISOString(),
      clientId,
      data: {
        ...profile,
        interactionHistory: profile.interactionHistory || [],
        notes: profile.notes || []
      }
    };
  }

  /**
   * Deletes profile data (for GDPR right to be forgotten)
   */
  deleteProfile(clientId) {
    const profile = this.profiles.get(clientId);
    if (!profile) return false;

    // Remove from index
    if (profile.email) {
      const emailIndex = this.profileIndex.get(`email:${profile.email}`);
      if (emailIndex) {
        this.profileIndex.set(
          `email:${profile.email}`,
          emailIndex.filter(id => id !== clientId)
        );
      }
    }

    if (profile.phone) {
      const phoneIndex = this.profileIndex.get(`phone:${profile.phone}`);
      if (phoneIndex) {
        this.profileIndex.set(
          `phone:${profile.phone}`,
          phoneIndex.filter(id => id !== clientId)
        );
      }
    }

    // Delete profile
    this.profiles.delete(clientId);
    
    logger.info('Profile deleted', { clientId });

    return true;
  }

  /**
   * Gets profile statistics
   */
  getStats() {
    const profiles = Array.from(this.profiles.values());
    
    return {
      totalProfiles: profiles.length,
      activeProfiles: profiles.filter(p => p.status === 'active').length,
      completeProfiles: profiles.filter(p => this.isProfileComplete(p.clientId)).length,
      avgEngagementScore: profiles.reduce((sum, p) => sum + (p.engagementScore || 0), 0) / (profiles.length || 1),
      profilesCreatedToday: profiles.filter(p => {
        const createdDate = new Date(p.createdDate);
        const today = new Date();
        return createdDate.toDateString() === today.toDateString();
      }).length
    };
  }
}

/**
 * Interaction Logger
 */
class InteractionLogger {
  constructor() {
    this.logEntries = [];
    this.logger = createLogger('InteractionLogger');
    this.maxEntries = 10000;
  }

  /**
   * Logs an interaction with sanitization
   */
  logInteraction(interactionData) {
    try {
      // Validate and sanitize input
      const sanitizedData = this.sanitizeInteractionData(interactionData);
      
      const logEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        ...sanitizedData
      };

      this.logEntries.push(logEntry);

      // Keep only last N entries
      if (this.logEntries.length > this.maxEntries) {
        this.logEntries = this.logEntries.slice(-this.maxEntries);
      }

      this.logger.debug('Interaction logged', { 
        clientId: sanitizedData.clientId, 
        channel: sanitizedData.channel 
      });

      return logEntry;
    } catch (error) {
      this.logger.error('Failed to log interaction', { error: error.message });
      return null;
    }
  }

  /**
   * Sanitizes interaction data
   */
  sanitizeInteractionData(data) {
    const sanitized = {};
    
    // Required fields
    sanitized.clientId = Sanitizer.sanitizeText(data.clientId, 100);
    sanitized.agentId = Sanitizer.sanitizeText(data.agentId, 100);
    
    // Optional fields
    if (data.channel) sanitized.channel = Sanitizer.sanitizeText(data.channel, 20);
    if (data.questionAsked) sanitized.questionAsked = Sanitizer.sanitizeText(data.questionAsked, 2000);
    if (data.response) sanitized.response = Sanitizer.sanitizeText(data.response, 5000);
    if (data.status) sanitized.status = Sanitizer.sanitizeText(data.status, 50);
    if (data.error) sanitized.error = Sanitizer.sanitizeText(data.error, 500);
    if (data.duration) sanitized.duration = Number(data.duration);
    if (data.outcome) sanitized.outcome = Sanitizer.sanitizeText(data.outcome, 100);
    
    // Metadata
    if (data.metadata) {
      sanitized.metadata = Sanitizer.sanitizeObject(data.metadata);
    }

    return sanitized;
  }

  /**
   * Retrieves logs for a specific client
   */
  getClientLogs(clientId, limit = 100) {
    const safeClientId = Sanitizer.sanitizeText(clientId, 100);
    return this.logEntries
      .filter(entry => entry.clientId === safeClientId)
      .slice(-limit);
  }

  /**
   * Retrieves recent logs
   */
  getRecentLogs(limit = 50) {
    return this.logEntries.slice(-limit);
  }

  /**
   * Gets interaction statistics
   */
  getStats() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    return {
      totalInteractions: this.logEntries.length,
      lastHour: this.logEntries.filter(e => new Date(e.timestamp) > oneHourAgo).length,
      lastDay: this.logEntries.filter(e => new Date(e.timestamp) > oneDayAgo).length,
      byChannel: {
        chat: this.logEntries.filter(e => e.channel === 'chat').length,
        call: this.logEntries.filter(e => e.channel === 'call').length
      },
      errorCount: this.logEntries.filter(e => e.status === 'error').length
    };
  }

  /**
   * Exports logs for a date range
   */
  exportLogs(startDate, endDate) {
    return this.logEntries.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= startDate && entryDate <= endDate;
    });
  }

  /**
   * Clears old logs (for maintenance)
   */
  clearOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const beforeCount = this.logEntries.length;
    this.logEntries = this.logEntries.filter(entry => 
      new Date(entry.timestamp) > cutoffDate
    );
    
    this.logger.info('Old logs cleared', { 
      beforeCount, 
      afterCount: this.logEntries.length 
    });
    
    return beforeCount - this.logEntries.length;
  }
}

// Export managers
module.exports = {
  UserProfileManager,
  InteractionLogger,
  Sanitizer
};
