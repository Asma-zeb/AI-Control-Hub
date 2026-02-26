// Authentication and Authorization Middleware
// Secure JWT-based authentication with bcrypt password hashing

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { createLogger, logSecurityEvent, logAudit } = require('./logger');
const { validateInput, LoginSchema, RegisterSchema } = require('./validation_schemas');

const logger = createLogger('auth');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

// In-memory user store (replace with database in production)
const users = new Map();
const refreshTokens = new Map();

/**
 * User roles and permissions
 */
const ROLES = {
  OPERATIONAL: 'operational',
  MANAGER: 'manager',
  ADMINISTRATOR: 'administrator'
};

const PERMISSIONS = {
  [ROLES.OPERATIONAL]: [
    'view_dashboard',
    'view_agents',
    'view_scripts',
    'execute_interactions'
  ],
  [ROLES.MANAGER]: [
    'view_dashboard',
    'view_agents',
    'view_scripts',
    'execute_interactions',
    'manage_agents',
    'manage_scripts',
    'view_reports',
    'manage_users'
  ],
  [ROLES.ADMINISTRATOR]: [
    'view_dashboard',
    'view_agents',
    'view_scripts',
    'execute_interactions',
    'manage_agents',
    'manage_scripts',
    'view_reports',
    'manage_users',
    'system_config',
    'security_config',
    'delete_data'
  ]
};

/**
 * Authentication Service
 */
class AuthService {
  constructor() {
    this.failedAttempts = new Map(); // For rate limiting
  }

  /**
   * Registers a new user
   */
  async register(username, password, email, role = ROLES.OPERATIONAL) {
    try {
      // Simple validation
      if (!username || !password) {
        throw new Error('Username and password are required');
      }

      if (password.length < 3) {
        throw new Error('Password must be at least 3 characters');
      }

      // Check if user exists
      if (users.has(username)) {
        logSecurityEvent('REGISTRATION_FAILED', { username, reason: 'User already exists' });
        throw new Error('User already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Create user
      const user = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        username,
        email: email || username,
        role: role || ROLES.OPERATIONAL,
        passwordHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: null,
        isActive: true,
        name: username
      };

      users.set(username, user);

      logAudit('USER_REGISTERED', user.id, { username, role });
      logger.info('User registered', { username, role });

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.name
      };
    } catch (error) {
      logger.error('Registration failed', { username, error: error.message });
      throw error;
    }
  }

  /**
   * Authenticates a user
   */
  async login(username, password) {
    try {
      // Validate input
      const validation = validateInput(LoginSchema, { username, password });
      if (!validation.success) {
        throw new Error(validation.error.message);
      }

      // Check rate limiting
      const attempts = this.failedAttempts.get(username) || 0;
      if (attempts >= 5) {
        logSecurityEvent('LOGIN_RATE_LIMITED', { username, attempts });
        throw new Error('Too many failed attempts. Please try again later.');
      }

      // Find user
      const user = users.get(username);
      if (!user) {
        this.failedAttempts.set(username, attempts + 1);
        logSecurityEvent('LOGIN_FAILED', { username, reason: 'User not found' });
        throw new Error('Invalid credentials');
      }

      // Check if user is active
      if (!user.isActive) {
        logSecurityEvent('LOGIN_FAILED', { username, reason: 'User inactive' });
        throw new Error('Account is disabled');
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        this.failedAttempts.set(username, attempts + 1);
        logSecurityEvent('LOGIN_FAILED', { username, reason: 'Invalid password' });
        throw new Error('Invalid credentials');
      }

      // Clear failed attempts
      this.failedAttempts.delete(username);

      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Update last login
      user.lastLogin = new Date().toISOString();
      user.updatedAt = new Date().toISOString();

      logAudit('USER_LOGIN', user.id, { username });
      logger.info('User logged in', { username, role: user.role });

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: JWT_EXPIRATION
        }
      };
    } catch (error) {
      logger.error('Login failed', { username, error: error.message });
      throw error;
    }
  }

  /**
   * Refreshes access token
   */
  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if refresh token is stored
      const storedToken = refreshTokens.get(decoded.username);
      if (!storedToken || storedToken.token !== refreshToken) {
        logSecurityEvent('TOKEN_REFRESH_FAILED', { username: decoded.username, reason: 'Token not found' });
        throw new Error('Invalid refresh token');
      }

      // Get user
      const user = users.get(decoded.username);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken(user);

      logger.debug('Token refreshed', { username: user.username });

      return { accessToken };
    } catch (error) {
      logSecurityEvent('TOKEN_REFRESH_FAILED', { error: error.message });
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Logs out a user
   */
  async logout(username, refreshToken) {
    // Remove refresh token
    refreshTokens.delete(username);
    
    logAudit('USER_LOGOUT', username, { username });
    logger.info('User logged out', { username });
    
    return { success: true };
  }

  /**
   * Generates access token
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );
  }

  /**
   * Generates refresh token
   */
  generateRefreshToken(user) {
    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        type: 'refresh'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store refresh token
    refreshTokens.set(user.username, {
      token,
      createdAt: new Date().toISOString()
    });

    return token;
  }

  /**
   * Verifies and decodes a token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Changes user password
   */
  async changePassword(username, currentPassword, newPassword) {
    const user = users.get(username);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatch) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters');
    }

    // Hash new password
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.updatedAt = new Date().toISOString();

    // Invalidate all refresh tokens
    refreshTokens.delete(username);

    logAudit('PASSWORD_CHANGED', user.id, { username });
    logSecurityEvent('PASSWORD_CHANGED', { username });
    logger.info('Password changed', { username });

    return { success: true };
  }

  /**
   * Gets user by username
   */
  getUser(username) {
    const user = users.get(username);
    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };
  }

  /**
   * Gets all users (admin only)
   */
  getAllUsers() {
    return Array.from(users.values()).map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      isActive: user.isActive
    }));
  }

  /**
   * Updates user role (admin only)
   */
  async updateUserRole(adminUsername, targetUsername, newRole) {
    const admin = users.get(adminUsername);
    if (!admin || admin.role !== ROLES.ADMINISTRATOR) {
      throw new Error('Unauthorized');
    }

    const user = users.get(targetUsername);
    if (!user) {
      throw new Error('User not found');
    }

    user.role = newRole;
    user.updatedAt = new Date().toISOString();

    logAudit('USER_ROLE_UPDATED', admin.id, { 
      targetUsername, 
      newRole,
      adminUsername 
    });

    return { success: true };
  }

  /**
   * Deactivates a user (admin only)
   */
  async deactivateUser(adminUsername, targetUsername) {
    const admin = users.get(adminUsername);
    if (!admin || admin.role !== ROLES.ADMINISTRATOR) {
      throw new Error('Unauthorized');
    }

    const user = users.get(targetUsername);
    if (!user) {
      throw new Error('User not found');
    }

    user.isActive = false;
    user.updatedAt = new Date().toISOString();

    // Invalidate all tokens
    refreshTokens.delete(targetUsername);

    logAudit('USER_DEACTIVATED', admin.id, { targetUsername, adminUsername });

    return { success: true };
  }

  /**
   * Gets failed login attempts for a user
   */
  getFailedAttempts(username) {
    return this.failedAttempts.get(username) || 0;
  }

  /**
   * Clears failed attempts (for admin)
   */
  clearFailedAttempts(username) {
    this.failedAttempts.delete(username);
    return { success: true };
  }
}

/**
 * Express middleware for authentication
 */
function authMiddleware(options = {}) {
  const { requireRole, requirePermission } = options;

  return (req, res, next) => {
    try {
      // Get token from header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'NO_TOKEN',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const token = authHeader.substring(7);
      
      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      if (decoded.type !== 'access') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid token type',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check if user exists and is active
      const user = users.get(decoded.username);
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found or inactive',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Check role requirement
      if (requireRole) {
        const roleHierarchy = [ROLES.OPERATIONAL, ROLES.MANAGER, ROLES.ADMINISTRATOR];
        const userRoleIndex = roleHierarchy.indexOf(decoded.role);
        const requiredRoleIndex = roleHierarchy.indexOf(requireRole);
        
        if (userRoleIndex < requiredRoleIndex) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_ROLE',
              message: `Required role: ${requireRole}`,
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      // Check permission requirement
      if (requirePermission) {
        const userPermissions = PERMISSIONS[decoded.role] || [];
        if (!userPermissions.includes(requirePermission)) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_PERMISSION',
              message: `Required permission: ${requirePermission}`,
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      // Attach user info to request
      req.user = {
        id: decoded.sub,
        username: decoded.username,
        role: decoded.role
      };

      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
            timestamp: new Date().toISOString()
          }
        });
      }

      logger.error('Auth middleware error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication error',
          timestamp: new Date().toISOString()
        }
      });
    }
  };
}

/**
 * Middleware to check specific permission
 */
function requirePermission(permission) {
  return authMiddleware({ requirePermission: permission });
}

/**
 * Middleware to check specific role
 */
function requireRole(role) {
  return authMiddleware({ requireRole: role });
}

// Export singleton instance
const authService = new AuthService();

module.exports = {
  AuthService,
  authService,
  authMiddleware,
  requirePermission,
  requireRole,
  ROLES,
  PERMISSIONS
};
