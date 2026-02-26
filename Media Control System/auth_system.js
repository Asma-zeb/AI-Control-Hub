// Authentication Service
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createLogger } = require('./logger');

const logger = createLogger('AuthService');

const JWT_SECRET = process.env.JWT_SECRET || 'media-control-secret-key-2026';
const JWT_EXPIRATION = '24h';

// In-memory user store (replace with database in production)
const users = new Map();
const sessions = new Map();

class AuthenticationSystem {
  constructor() {
    this.createDefaultAdmin();
  }

  // Create default admin user
  async createDefaultAdmin() {
    const adminEmail = 'admin@mediacontrol.com';
    const adminPassword = await bcrypt.hash('admin123', 10);
    
    users.set(adminEmail, {
      email: adminEmail,
      password: adminPassword,
      role: 'administrator',
      name: 'Administrator',
      createdAt: new Date().toISOString(),
      lastLogin: null
    });
    
    logger.info('Default admin user created', { email: adminEmail });
  }

  // Register new user
  async register(email, password, name = 'User') {
    try {
      // Check if user exists
      if (users.has(email)) {
        return {
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: 'Email already registered'
          }
        };
      }

      // Validate email
      if (!email || !email.includes('@')) {
        return {
          success: false,
          error: {
            code: 'INVALID_EMAIL',
            message: 'Please provide a valid email address'
          }
        };
      }

      // Validate password
      if (!password || password.length < 6) {
        return {
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password must be at least 6 characters'
          }
        };
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = {
        email,
        password: hashedPassword,
        name,
        role: 'user',
        createdAt: new Date().toISOString(),
        lastLogin: null,
        profile: {
          company: '',
          phone: '',
          avatar: name.charAt(0).toUpperCase()
        }
      };

      users.set(email, user);

      logger.info('New user registered', { email, name });

      return {
        success: true,
        data: {
          email: user.email,
          name: user.name,
          role: user.role
        }
      };
    } catch (error) {
      logger.error('Registration failed', { error: error.message });
      return {
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: error.message
        }
      };
    }
  }

  // Login user
  async login(email, password) {
    try {
      const user = users.get(email);
      
      if (!user) {
        return {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        };
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      
      if (!passwordMatch) {
        return {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        };
      }

      // Generate tokens
      const accessToken = jwt.sign(
        { email: user.email, role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
      );

      const refreshToken = jwt.sign(
        { email: user.email },
        JWT_SECRET + '_refresh',
        { expiresIn: '7d' }
      );

      // Update last login
      user.lastLogin = new Date().toISOString();
      users.set(email, user);

      // Store session
      sessions.set(email, {
        accessToken,
        refreshToken,
        loginTime: new Date().toISOString()
      });

      logger.info('User logged in', { email });

      return {
        success: true,
        data: {
          user: {
            email: user.email,
            name: user.name,
            role: user.role,
            avatar: user.profile?.avatar || user.name.charAt(0).toUpperCase()
          },
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: JWT_EXPIRATION
          }
        }
      };
    } catch (error) {
      logger.error('Login failed', { error: error.message });
      return {
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: error.message
        }
      };
    }
  }

  // Logout user
  async logout(email) {
    sessions.delete(email);
    logger.info('User logged out', { email });
    return { success: true };
  }

  // Verify token
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  // Get user profile
  getUserProfile(email) {
    const user = users.get(email);
    if (!user) return null;

    return {
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      profile: user.profile
    };
  }

  // Update user profile
  async updateProfile(email, updates) {
    const user = users.get(email);
    if (!user) {
      return {
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' }
      };
    }

    user.profile = { ...user.profile, ...updates };
    users.set(email, user);

    logger.info('Profile updated', { email });

    return {
      success: true,
      data: this.getUserProfile(email)
    };
  }

  // Get all users (admin only)
  getAllUsers() {
    return Array.from(users.values()).map(user => ({
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      profile: user.profile
    }));
  }

  // Get active sessions count
  getActiveSessionsCount() {
    return sessions.size;
  }

  // Get session info
  getSessionInfo(email) {
    return sessions.get(email) || null;
  }
}

// Export singleton instance
const authSystem = new AuthenticationSystem();

module.exports = {
  AuthenticationSystem,
  authSystem
};
