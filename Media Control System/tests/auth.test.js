// Tests for Authentication System

const { AuthService, ROLES } = require('../auth');

describe('AuthService', () => {
  let authService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const result = await authService.register(
        'testuser',
        'password123',
        'test@example.com',
        ROLES.OPERATIONAL
      );

      expect(result.username).toBe('testuser');
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBe(ROLES.OPERATIONAL);
    });

    it('should reject duplicate username', async () => {
      await authService.register('existinguser', 'password123', 'test@example.com');
      
      await expect(authService.register('existinguser', 'password456', 'other@example.com'))
        .rejects.toThrow('already exists');
    });

    it('should reject weak password', async () => {
      await expect(authService.register('newuser', '123', 'test@example.com'))
        .rejects.toThrow('at least 8 characters');
    });

    it('should reject invalid email', async () => {
      await expect(authService.register('newuser', 'password123', 'invalid-email'))
        .rejects.toThrow('Invalid email');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.register('loginuser', 'password123', 'login@example.com');
    });

    it('should login with correct credentials', async () => {
      const result = await authService.login('loginuser', 'password123');

      expect(result.user.username).toBe('loginuser');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should reject wrong password', async () => {
      await expect(authService.login('loginuser', 'wrongpassword'))
        .rejects.toThrow('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      await expect(authService.login('nonexistent', 'password123'))
        .rejects.toThrow('Invalid credentials');
    });

    it('should lock account after multiple failed attempts', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        try {
          await authService.login('loginuser', 'wrongpassword');
        } catch (e) {
          // Ignore errors
        }
      }

      // 6th attempt should be rate limited
      await expect(authService.login('loginuser', 'password123'))
        .rejects.toThrow('Too many failed attempts');
    });
  });

  describe('token refresh', () => {
    let refreshToken;

    beforeEach(async () => {
      const result = await authService.register('refreshuser', 'password123', 'refresh@example.com');
      const loginResult = await authService.login('refreshuser', 'password123');
      refreshToken = loginResult.tokens.refreshToken;
    });

    it('should refresh access token', async () => {
      const result = await authService.refreshToken(refreshToken);
      expect(result.accessToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      await expect(authService.refreshToken('invalid-token'))
        .rejects.toThrow('Invalid refresh token');
    });
  });

  describe('changePassword', () => {
    beforeEach(async () => {
      await authService.register('pwduser', 'oldpassword123', 'pwd@example.com');
    });

    it('should change password successfully', async () => {
      await authService.changePassword('pwduser', 'oldpassword123', 'newpassword123');
      
      // Old password should fail
      await expect(authService.login('pwduser', 'oldpassword123'))
        .rejects.toThrow('Invalid credentials');
      
      // New password should work
      const result = await authService.login('pwduser', 'newpassword123');
      expect(result.user.username).toBe('pwduser');
    });

    it('should reject change with wrong current password', async () => {
      await expect(authService.changePassword('pwduser', 'wrongpassword', 'newpassword123'))
        .rejects.toThrow('incorrect');
    });

    it('should reject weak new password', async () => {
      await expect(authService.changePassword('pwduser', 'oldpassword123', '123'))
        .rejects.toThrow('at least 8 characters');
    });
  });

  describe('getUser', () => {
    it('should return user info', async () => {
      await authService.register('getuser', 'password123', 'get@example.com');
      
      const result = authService.getUser('getuser');
      expect(result.username).toBe('getuser');
      expect(result.email).toBe('get@example.com');
    });

    it('should return null for non-existent user', () => {
      const result = authService.getUser('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('deactivateUser', () => {
    beforeEach(async () => {
      await authService.register('admin', 'adminpass123', 'admin@example.com', ROLES.ADMINISTRATOR);
      await authService.register('targetuser', 'password123', 'target@example.com');
    });

    it('should deactivate a user', async () => {
      await authService.deactivateUser('admin', 'targetuser');
      
      await expect(authService.login('targetuser', 'password123'))
        .rejects.toThrow('Account is disabled');
    });

    it('should reject non-admin deactivation', async () => {
      await authService.register('regularuser', 'password123', 'regular@example.com');
      
      await expect(authService.deactivateUser('regularuser', 'targetuser'))
        .rejects.toThrow('Unauthorized');
    });
  });
});
