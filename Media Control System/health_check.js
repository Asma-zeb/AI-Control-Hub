// Health Check System
// Comprehensive health monitoring for the application

const { createLogger } = require('./logger');

const logger = createLogger('HealthCheck');

/**
 * Health Check System
 * Monitors all subsystems and provides health status
 */
class HealthCheckSystem {
  constructor() {
    this.startTime = Date.now();
    this.version = process.env.npm_package_version || '1.0.0';
    this.nodeVersion = process.version;
    this.platform = process.platform;
    
    // Health check results cache
    this.lastCheck = null;
    this.lastCheckTime = null;
    
    // Subsystem health status
    this.subsystems = new Map();
    
    // Register default subsystems
    this.registerSubsystem('api', { checkFn: this.checkAPI.bind(this) });
    this.registerSubsystem('memory', { checkFn: this.checkMemory.bind(this) });
    this.registerSubsystem('disk', { checkFn: this.checkDisk.bind(this) });
  }

  /**
   * Registers a subsystem for health monitoring
   */
  registerSubsystem(name, config) {
    this.subsystems.set(name, {
      name,
      status: 'unknown',
      lastCheck: null,
      lastError: null,
      responseTime: null,
      ...config
    });
  }

  /**
   * Performs health check on a specific subsystem
   */
  async checkSubsystem(name) {
    const subsystem = this.subsystems.get(name);
    if (!subsystem) {
      throw new Error(`Unknown subsystem: ${name}`);
    }

    const startTime = Date.now();
    
    try {
      if (typeof subsystem.checkFn === 'function') {
        await subsystem.checkFn();
        subsystem.status = 'healthy';
        subsystem.lastError = null;
      } else {
        subsystem.status = 'healthy';
      }
    } catch (error) {
      subsystem.status = 'unhealthy';
      subsystem.lastError = error.message;
      logger.error(`Subsystem ${name} health check failed`, { error: error.message });
    } finally {
      subsystem.lastCheck = new Date().toISOString();
      subsystem.responseTime = Date.now() - startTime;
    }

    return {
      name,
      status: subsystem.status,
      lastCheck: subsystem.lastCheck,
      responseTime: subsystem.responseTime,
      error: subsystem.lastError
    };
  }

  /**
   * Performs comprehensive health check on all subsystems
   */
  async performHealthCheck() {
    const results = {
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: this.getUptime(),
      subsystems: {},
      overallStatus: 'healthy'
    };

    let unhealthyCount = 0;
    let unknownCount = 0;

    for (const [name, subsystem] of this.subsystems) {
      try {
        const result = await this.checkSubsystem(name);
        results.subsystems[name] = result;
        
        if (result.status === 'unhealthy') unhealthyCount++;
        if (result.status === 'unknown') unknownCount++;
      } catch (error) {
        results.subsystems[name] = {
          name,
          status: 'error',
          error: error.message
        };
        unhealthyCount++;
      }
    }

    // Determine overall status
    if (unhealthyCount > 0) {
      results.overallStatus = unhealthyCount > 1 ? 'critical' : 'degraded';
    } else if (unknownCount > 0) {
      results.overallStatus = 'unknown';
    }

    this.lastCheck = results;
    this.lastCheckTime = Date.now();

    return results;
  }

  /**
   * Gets cached health check results
   */
  getCachedHealthCheck(maxAge = 5000) {
    if (!this.lastCheck || !this.lastCheckTime) {
      return null;
    }

    const age = Date.now() - this.lastCheckTime;
    if (age > maxAge) {
      return null; // Stale, perform new check
    }

    return this.lastCheck;
  }

  /**
   * Gets system uptime
   */
  getUptime() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Checks API health
   */
  async checkAPI() {
    // Basic API check - ensure server is responsive
    return { status: 'ok' };
  }

  /**
   * Checks memory health
   */
  async checkMemory() {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    // Warn if heap usage is above 90%
    if (heapUsedPercent > 90) {
      throw new Error(`High memory usage: ${heapUsedPercent.toFixed(1)}%`);
    }
    
    return {
      status: 'ok',
      details: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsedPercent: heapUsedPercent.toFixed(1) + '%'
      }
    };
  }

  /**
   * Checks disk health (simulated)
   */
  async checkDisk() {
    // In production, use fs.statfs or similar to check disk space
    return {
      status: 'ok',
      details: {
        status: 'simulated'
      }
    };
  }

  /**
   * Gets detailed system information
   */
  getSystemInfo() {
    const memUsage = process.memoryUsage();
    
    return {
      version: this.version,
      nodeVersion: this.nodeVersion,
      platform: this.platform,
      uptime: this.getUptime(),
      uptimeFormatted: this.formatUptime(this.getUptime()),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
      },
      cpu: {
        arch: process.arch,
        cores: require('os').cpus().length,
        model: require('os').cpus()[0]?.model || 'unknown'
      },
      env: {
        nodeEnv: process.env.NODE_ENV || 'development'
      }
    };
  }

  /**
   * Formats uptime seconds to human readable
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);

    return parts.join(' ') || '0s';
  }

  /**
   * Gets health check summary for dashboards
   */
  getSummary() {
    if (!this.lastCheck) {
      return {
        status: 'unknown',
        message: 'No health check performed yet'
      };
    }

    const healthyCount = Object.values(this.lastCheck.subsystems)
      .filter(s => s.status === 'healthy').length;
    const totalCount = Object.keys(this.lastCheck.subsystems).length;

    return {
      status: this.lastCheck.overallStatus,
      healthySubsystems: healthyCount,
      totalSubsystems: totalCount,
      uptime: this.formatUptime(this.lastCheck.uptime),
      lastCheck: this.lastCheck.timestamp
    };
  }
}

// Export singleton instance
const healthCheckSystem = new HealthCheckSystem();

module.exports = {
  HealthCheckSystem,
  healthCheckSystem
};
