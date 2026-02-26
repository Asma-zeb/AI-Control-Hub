// Panel Visibility and System Load Monitoring
// FIXED: Memory leak prevention with proper interval cleanup

const { createLogger } = require('./logger');

const logger = createLogger('PanelMonitoringSystem');

/**
 * Panel Monitoring System - Tracks system status and provides visibility
 * IMPROVED: Proper resource cleanup and memory management
 */
class PanelMonitoringSystem {
  constructor() {
    this.systemMetrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      activeConnections: 0,
      queueLength: 0,
      uptime: 0
    };

    this.agentsStatus = new Map();
    this.activeSessions = new Map();
    this.performanceHistory = [];
    this.alerts = [];
    
    // Interval tracking for cleanup
    this.metricsInterval = null;
    this.cleanupInterval = null;
    this.isRunning = false;
    
    // Configuration
    this.config = {
      metricsIntervalMs: parseInt(process.env.PANEL_METRICS_INTERVAL_MS) || 30000,
      cpuWarningThreshold: parseInt(process.env.PANEL_CPU_WARNING_THRESHOLD) || 75,
      cpuCriticalThreshold: parseInt(process.env.PANEL_CPU_CRITICAL_THRESHOLD) || 90,
      memoryWarningThreshold: parseInt(process.env.PANEL_MEMORY_WARNING_THRESHOLD) || 70,
      memoryCriticalThreshold: parseInt(process.env.PANEL_MEMORY_CRITICAL_THRESHOLD) || 85,
      maxHistoryRecords: 100,
      maxAlerts: 50,
      maxSessions: 1000
    };

    logger.info('PanelMonitoringSystem initialized');
  }

  /**
   * Starts the monitoring system
   */
  start() {
    if (this.isRunning) {
      logger.warn('Monitoring system already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting panel monitoring system');

    // Start metrics collection
    this.metricsInterval = setInterval(() => {
      this.updateSystemMetrics();
    }, this.config.metricsIntervalMs);

    // Start cleanup interval - prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000); // Every 5 minutes

    // Initial metrics update
    this.updateSystemMetrics();
  }

  /**
   * Stops the monitoring system and cleans up resources
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping panel monitoring system');

    // Clear intervals to prevent memory leaks
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
  }

  /**
   * Performs cleanup to prevent memory leaks
   */
  performCleanup() {
    try {
      // Trim performance history
      if (this.performanceHistory.length > this.config.maxHistoryRecords) {
        const removed = this.performanceHistory.length - this.config.maxHistoryRecords;
        this.performanceHistory = this.performanceHistory.slice(-this.config.maxHistoryRecords);
        logger.debug('Trimmed performance history', { removed });
      }

      // Trim alerts
      if (this.alerts.length > this.config.maxAlerts) {
        const removed = this.alerts.length - this.config.maxAlerts;
        this.alerts = this.alerts.slice(-this.config.maxAlerts);
        logger.debug('Trimmed alerts', { removed });
      }

      // Clean up stale sessions (inactive for more than 1 hour)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      let staleSessions = 0;
      
      for (const [sessionId, session] of this.activeSessions) {
        const lastActivity = new Date(session.lastActivity).getTime();
        if (lastActivity < oneHourAgo) {
          this.activeSessions.delete(sessionId);
          staleSessions++;
        }
      }
      
      if (staleSessions > 0) {
        logger.info('Cleaned up stale sessions', { count: staleSessions });
      }

      // Clean up stale agent statuses (no heartbeat for more than 5 minutes)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      let staleAgents = 0;
      
      for (const [agentId, status] of this.agentsStatus) {
        const heartbeat = new Date(status.heartbeat).getTime();
        if (heartbeat < fiveMinutesAgo) {
          status.status = 'disconnected';
          staleAgents++;
        }
      }
      
      if (staleAgents > 0) {
        logger.warn('Agents marked as disconnected', { count: staleAgents });
      }

    } catch (error) {
      logger.error('Cleanup failed', { error: error.message });
    }
  }

  /**
   * Updates system metrics
   */
  updateSystemMetrics() {
    try {
      // In production, collect actual system metrics
      // For simulation, generate realistic values
      this.systemMetrics.cpuUsage = Math.min(100, Math.max(0, 20 + Math.random() * 60));
      this.systemMetrics.memoryUsage = Math.min(100, Math.max(0, 30 + Math.random() * 50));
      this.systemMetrics.diskUsage = Math.min(100, Math.max(0, 40 + Math.random() * 30));
      this.systemMetrics.activeConnections = Math.floor(Math.random() * 1000);
      this.systemMetrics.queueLength = Math.floor(Math.random() * 100);
      this.systemMetrics.uptime = Math.floor((Date.now() - 1640995200000) / 1000);

      // Store in history
      this.performanceHistory.push({
        timestamp: new Date().toISOString(),
        ...this.systemMetrics
      });

      // Trim history if needed
      if (this.performanceHistory.length > this.config.maxHistoryRecords) {
        this.performanceHistory = this.performanceHistory.slice(-this.config.maxHistoryRecords);
      }

      // Check thresholds and create alerts
      this.checkThresholds();

      logger.debug('System metrics updated', { 
        cpu: this.systemMetrics.cpuUsage.toFixed(1),
        memory: this.systemMetrics.memoryUsage.toFixed(1)
      });
    } catch (error) {
      logger.error('Failed to update system metrics', { error: error.message });
    }
  }

  /**
   * Checks system thresholds and generates alerts
   */
  checkThresholds() {
    const thresholds = {
      cpuWarning: this.config.cpuWarningThreshold,
      cpuCritical: this.config.cpuCriticalThreshold,
      memoryWarning: this.config.memoryWarningThreshold,
      memoryCritical: this.config.memoryCriticalThreshold,
      queueWarning: 50,
      queueCritical: 80
    };

    // CPU checks
    if (this.systemMetrics.cpuUsage >= thresholds.cpuCritical) {
      this.createAlert('CPU_USAGE_CRITICAL', `CPU usage at ${this.systemMetrics.cpuUsage.toFixed(1)}%`, 'critical');
    } else if (this.systemMetrics.cpuUsage >= thresholds.cpuWarning) {
      this.createAlert('CPU_USAGE_WARNING', `CPU usage at ${this.systemMetrics.cpuUsage.toFixed(1)}%`, 'warning');
    }

    // Memory checks
    if (this.systemMetrics.memoryUsage >= thresholds.memoryCritical) {
      this.createAlert('MEMORY_USAGE_CRITICAL', `Memory usage at ${this.systemMetrics.memoryUsage.toFixed(1)}%`, 'critical');
    } else if (this.systemMetrics.memoryUsage >= thresholds.memoryWarning) {
      this.createAlert('MEMORY_USAGE_WARNING', `Memory usage at ${this.systemMetrics.memoryUsage.toFixed(1)}%`, 'warning');
    }

    // Queue length checks
    if (this.systemMetrics.queueLength >= thresholds.queueCritical) {
      this.createAlert('QUEUE_LENGTH_CRITICAL', `Queue length at ${this.systemMetrics.queueLength}`, 'critical');
    } else if (this.systemMetrics.queueLength >= thresholds.queueWarning) {
      this.createAlert('QUEUE_LENGTH_WARNING', `Queue length at ${this.systemMetrics.queueLength}`, 'warning');
    }
  }

  /**
   * Creates a system alert
   */
  createAlert(type, message, severity) {
    // Check if similar alert already exists (prevent alert spam)
    const existingAlert = this.alerts.find(a => 
      a.type === type && 
      !a.resolved && 
      Date.now() - new Date(a.timestamp).getTime() < 5 * 60 * 1000
    );

    if (existingAlert) {
      return existingAlert; // Don't create duplicate alerts within 5 minutes
    }

    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      severity,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false
    };

    this.alerts.push(alert);

    // Trim alerts if needed
    if (this.alerts.length > this.config.maxAlerts) {
      this.alerts = this.alerts.slice(-this.config.maxAlerts);
    }

    logger.warn(`[${severity.toUpperCase()}] ${type}: ${message}`);

    return alert;
  }

  /**
   * Sets agent status
   */
  setAgentStatus(agentId, status, details = {}) {
    const agentStatus = {
      agentId,
      status,
      lastUpdated: new Date().toISOString(),
      heartbeat: new Date().toISOString(),
      details
    };

    this.agentsStatus.set(agentId, agentStatus);
    return agentStatus;
  }

  /**
   * Gets system dashboard data
   */
  getDashboardData(role = 'operational') {
    const dashboard = {
      timestamp: new Date().toISOString(),
      systemMetrics: { ...this.systemMetrics },
      activeSessions: this.activeSessions.size,
      totalAgents: this.agentsStatus.size,
      healthyAgents: Array.from(this.agentsStatus.values()).filter(a => a.status === 'healthy').length,
      isRunning: this.isRunning
    };

    // Add role-specific data
    if (role === 'manager' || role === 'administrator') {
      dashboard.performanceHistory = this.getRecentPerformance();
      dashboard.alerts = this.getUnresolvedAlerts();
    }

    if (role === 'administrator') {
      dashboard.detailedMetrics = this.getDetailedSystemMetrics();
      dashboard.config = this.config;
    }

    return dashboard;
  }

  /**
   * Gets recent performance data
   */
  getRecentPerformance(hours = 1) {
    const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
    return this.performanceHistory.filter(record => record.timestamp >= cutoffTime);
  }

  /**
   * Gets unresolved alerts
   */
  getUnresolvedAlerts() {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Gets detailed system metrics for administrators
   */
  getDetailedSystemMetrics() {
    return {
      ...this.systemMetrics,
      agentDistribution: this.getAgentDistribution(),
      sessionDistribution: this.getSessionDistribution(),
      responseTimeMetrics: this.getResponseTimeMetrics()
    };
  }

  /**
   * Gets agent distribution by status
   */
  getAgentDistribution() {
    const distribution = {};

    for (const [_, status] of this.agentsStatus) {
      distribution[status.status] = (distribution[status.status] || 0) + 1;
    }

    return distribution;
  }

  /**
   * Gets session distribution by type
   */
  getSessionDistribution() {
    const distribution = { call: 0, chat: 0, other: 0 };

    for (const [_, session] of this.activeSessions) {
      if (session.type === 'call') {
        distribution.call++;
      } else if (session.type === 'chat') {
        distribution.chat++;
      } else {
        distribution.other++;
      }
    }

    return distribution;
  }

  /**
   * Gets response time metrics
   */
  getResponseTimeMetrics() {
    return {
      avgResponseTime: 1250 + Math.random() * 500,
      p95ResponseTime: 2000 + Math.random() * 1000,
      p99ResponseTime: 3500 + Math.random() * 1500,
      slowResponseCount: Math.floor(Math.random() * 10)
    };
  }

  /**
   * Adds an active session with limit check
   */
  addActiveSession(sessionId, sessionData) {
    // Prevent unlimited session growth
    if (this.activeSessions.size >= this.config.maxSessions) {
      logger.warn('Maximum sessions reached', { max: this.config.maxSessions });
      return null;
    }

    const session = {
      ...sessionData,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Removes an active session
   */
  removeActiveSession(sessionId) {
    return this.activeSessions.delete(sessionId);
  }

  /**
   * Updates session activity
   */
  updateSessionActivity(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date().toISOString();
    }
    return session;
  }

  /**
   * Gets active sessions
   */
  getActiveSessions(filters = {}) {
    const sessions = [];

    for (const [id, session] of this.activeSessions) {
      let include = true;

      if (filters.type && session.type !== filters.type) include = false;
      if (filters.agentId && session.agentId !== filters.agentId) include = false;

      if (include) {
        sessions.push({ sessionId: id, ...session });
      }
    }

    return sessions;
  }

  /**
   * Acknowledges an alert
   */
  acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date().toISOString();
      logger.info('Alert acknowledged', { alertId, acknowledgedBy });
    }
    return alert;
  }

  /**
   * Resolves an alert
   */
  resolveAlert(alertId, resolvedBy) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedBy = resolvedBy;
      alert.resolvedAt = new Date().toISOString();
      logger.info('Alert resolved', { alertId, resolvedBy });
    }
    return alert;
  }

  /**
   * Gets system health status
   */
  getSystemHealth() {
    const criticalIssues = this.alerts.filter(a => a.severity === 'critical' && !a.resolved).length;
    const warningIssues = this.alerts.filter(a => a.severity === 'warning' && !a.resolved).length;

    let status = 'healthy';
    if (criticalIssues > 0) status = 'critical';
    else if (warningIssues > 0) status = 'warning';

    return {
      status,
      criticalIssues,
      warningIssues,
      healthyAgents: Array.from(this.agentsStatus.values()).filter(a => a.status === 'healthy').length,
      totalAgents: this.agentsStatus.size,
      activeSessions: this.activeSessions.size,
      isRunning: this.isRunning
    };
  }

  /**
   * Gets system load information
   */
  getSystemLoad() {
    return {
      currentLoad: Math.round((this.systemMetrics.cpuUsage + this.systemMetrics.memoryUsage) / 2),
      loadTrend: this.getLoadTrend(),
      capacityAvailable: this.getCapacityAvailable(),
      recommendations: this.getLoadBalancingRecommendations()
    };
  }

  /**
   * Gets load trend
   */
  getLoadTrend() {
    if (this.performanceHistory.length < 2) return 'stable';

    const recent = this.performanceHistory.slice(-5);
    const avgRecent = recent.reduce((sum, r) => sum + ((r.cpuUsage + r.memoryUsage) / 2), 0) / recent.length;

    const older = this.performanceHistory.slice(-10, -5);
    if (older.length === 0) return 'stable';

    const avgOlder = older.reduce((sum, r) => sum + ((r.cpuUsage + r.memoryUsage) / 2), 0) / older.length;

    if (avgRecent > avgOlder + 5) return 'increasing';
    if (avgRecent < avgOlder - 5) return 'decreasing';

    return 'stable';
  }

  /**
   * Gets available capacity
   */
  getCapacityAvailable() {
    const cpuAvailable = 100 - this.systemMetrics.cpuUsage;
    const memoryAvailable = 100 - this.systemMetrics.memoryUsage;
    const queueSpace = 100 - this.systemMetrics.queueLength;

    return {
      cpu: Math.round(cpuAvailable),
      memory: Math.round(memoryAvailable),
      queue: Math.round(queueSpace),
      overall: Math.round(Math.min(cpuAvailable, memoryAvailable, queueSpace))
    };
  }

  /**
   * Gets load balancing recommendations
   */
  getLoadBalancingRecommendations() {
    const recommendations = [];

    if (this.systemMetrics.cpuUsage > 80) {
      recommendations.push({
        type: 'cpu',
        action: 'add_processing_nodes',
        urgency: 'high',
        description: 'CPU usage above 80%, consider adding more processing nodes'
      });
    }

    if (this.systemMetrics.memoryUsage > 80) {
      recommendations.push({
        type: 'memory',
        action: 'allocate_more_memory',
        urgency: 'high',
        description: 'Memory usage above 80%, consider allocating more memory'
      });
    }

    if (this.systemMetrics.queueLength > 60) {
      recommendations.push({
        type: 'queue',
        action: 'increase_workers',
        urgency: 'medium',
        description: 'Long queue length detected, consider increasing worker capacity'
      });
    }

    if (this.activeSessions.size > 800) {
      recommendations.push({
        type: 'sessions',
        action: 'scale_horizontally',
        urgency: 'medium',
        description: 'High number of active sessions, consider horizontal scaling'
      });
    }

    return recommendations;
  }

  /**
   * Gets monitoring status
   */
  getMonitoringStatus() {
    return {
      isRunning: this.isRunning,
      metricsIntervalMs: this.config.metricsIntervalMs,
      lastMetricsUpdate: this.performanceHistory.length > 0 
        ? this.performanceHistory[this.performanceHistory.length - 1].timestamp 
        : null,
      historySize: this.performanceHistory.length,
      alertsCount: this.alerts.length,
      agentsTracked: this.agentsStatus.size,
      sessionsTracked: this.activeSessions.size
    };
  }
}

module.exports = {
  PanelMonitoringSystem
};
