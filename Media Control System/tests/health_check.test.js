// Tests for Health Check System

const { HealthCheckSystem, healthCheckSystem } = require('../health_check');

describe('HealthCheckSystem', () => {
  let healthSystem;

  beforeEach(() => {
    healthSystem = new HealthCheckSystem();
  });

  describe('getUptime', () => {
    it('should return positive uptime', () => {
      const uptime = healthSystem.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('formatUptime', () => {
    it('should format seconds correctly', () => {
      expect(healthSystem.formatUptime(45)).toBe('45s');
    });

    it('should format minutes and seconds', () => {
      expect(healthSystem.formatUptime(125)).toBe('2m 5s');
    });

    it('should format hours, minutes, and seconds', () => {
      expect(healthSystem.formatUptime(3725)).toBe('1h 2m 5s');
    });

    it('should format days', () => {
      expect(healthSystem.formatUptime(90061)).toBe('1d 1h 1m 1s');
    });
  });

  describe('performHealthCheck', () => {
    it('should return health status for all subsystems', async () => {
      const result = await healthSystem.performHealthCheck();

      expect(result.timestamp).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.uptime).toBeDefined();
      expect(result.subsystems).toBeDefined();
      expect(result.overallStatus).toBeDefined();
    });

    it('should include api subsystem', async () => {
      const result = await healthSystem.performHealthCheck();
      expect(result.subsystems.api).toBeDefined();
    });

    it('should include memory subsystem', async () => {
      const result = await healthSystem.performHealthCheck();
      expect(result.subsystems.memory).toBeDefined();
    });

    it('should include disk subsystem', async () => {
      const result = await healthSystem.performHealthCheck();
      expect(result.subsystems.disk).toBeDefined();
    });
  });

  describe('checkMemory', () => {
    it('should return memory status', async () => {
      const result = await healthSystem.checkMemory();
      
      expect(result.status).toBe('ok');
      expect(result.details).toBeDefined();
      expect(result.details.heapUsed).toBeDefined();
      expect(result.details.heapTotal).toBeDefined();
    });
  });

  describe('getSystemInfo', () => {
    it('should return system information', () => {
      const info = healthSystem.getSystemInfo();

      expect(info.version).toBeDefined();
      expect(info.nodeVersion).toBeDefined();
      expect(info.platform).toBeDefined();
      expect(info.uptime).toBeDefined();
      expect(info.memory).toBeDefined();
      expect(info.cpu).toBeDefined();
    });

    it('should include memory details', () => {
      const info = healthSystem.getSystemInfo();
      
      expect(info.memory.rss).toBeDefined();
      expect(info.memory.heapTotal).toBeDefined();
      expect(info.memory.heapUsed).toBeDefined();
    });

    it('should include CPU details', () => {
      const info = healthSystem.getSystemInfo();
      
      expect(info.cpu.arch).toBeDefined();
      expect(info.cpu.cores).toBeGreaterThan(0);
    });
  });

  describe('getSummary', () => {
    it('should return unknown status before first check', () => {
      const freshSystem = new HealthCheckSystem();
      const summary = freshSystem.getSummary();
      
      expect(summary.status).toBe('unknown');
    });

    it('should return summary after health check', async () => {
      await healthSystem.performHealthCheck();
      const summary = healthSystem.getSummary();

      expect(summary.status).toBeDefined();
      expect(summary.healthySubsystems).toBeGreaterThanOrEqual(0);
      expect(summary.totalSubsystems).toBeGreaterThan(0);
      expect(summary.uptime).toBeDefined();
    });
  });

  describe('getCachedHealthCheck', () => {
    it('should return null before first check', () => {
      const result = healthSystem.getCachedHealthCheck();
      expect(result).toBeNull();
    });

    it('should return cached result after check', async () => {
      await healthSystem.performHealthCheck();
      const result = healthSystem.getCachedHealthCheck();
      
      expect(result).toBeDefined();
      expect(result.overallStatus).toBeDefined();
    });

    it('should return null for stale cache', async () => {
      await healthSystem.performHealthCheck();
      
      // Wait for cache to expire (maxAge is 5000ms by default)
      await new Promise(resolve => setTimeout(resolve, 5100));
      
      const result = healthSystem.getCachedHealthCheck();
      expect(result).toBeNull();
    });
  });

  describe('registerSubsystem', () => {
    it('should register a new subsystem', () => {
      const system = new HealthCheckSystem();
      system.registerSubsystem('custom', {
        checkFn: async () => ({ status: 'ok' })
      });

      expect(system.subsystems.has('custom')).toBe(true);
    });

    it('should check custom subsystem', async () => {
      const system = new HealthCheckSystem();
      let checkCalled = false;
      
      system.registerSubsystem('custom', {
        checkFn: async () => {
          checkCalled = true;
          return { status: 'ok' };
        }
      });

      await system.checkSubsystem('custom');
      expect(checkCalled).toBe(true);
    });
  });
});
