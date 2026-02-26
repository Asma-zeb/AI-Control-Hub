// Automation Best Practices and Validation System

/**
 * Best Practices Validator - Ensures workflows follow best practices
 */
class BestPracticesValidator {
  constructor() {
    this.validationRules = {
      scriptQuality: {
        testRequired: true,
        securityScanRequired: true,
        sizeLimit: 102400, // 100KB
        complexityCheck: true
      },
      agentConfiguration: {
        healthCheckRequired: true,
        loadBalancingRequired: true,
        fallbackAgentRequired: true
      },
      dataHandling: {
        privacyComplianceRequired: true,
        retentionPolicyRequired: true,
        backupRequired: true
      },
      communication: {
        rateLimitingRequired: true,
        retryMechanismRequired: true,
        errorHandlingRequired: true
      }
    };
  }

  /**
   * Validates a workflow configuration against best practices
   */
  validateWorkflow(workflowConfig) {
    const validationResults = {
      passed: true,
      errors: [],
      warnings: [],
      recommendations: []
    };

    // Validate script quality
    if (!workflowConfig.scripts || workflowConfig.scripts.length === 0) {
      validationResults.errors.push('No scripts configured for the workflow');
      validationResults.passed = false;
    } else {
      for (const script of workflowConfig.scripts) {
        const scriptValidation = this.validateScript(script);
        if (!scriptValidation.passed) {
          validationResults.errors.push(...scriptValidation.errors);
          validationResults.passed = false;
        }
        if (scriptValidation.warnings.length > 0) {
          validationResults.warnings.push(...scriptValidation.warnings);
        }
      }
    }

    // Validate agent configuration
    const agentValidation = this.validateAgentConfiguration(workflowConfig.agents);
    if (!agentValidation.passed) {
      validationResults.errors.push(...agentValidation.errors);
      validationResults.passed = false;
    }
    validationResults.recommendations.push(...agentValidation.recommendations);

    // Validate data handling
    const dataValidation = this.validateDataHandling(workflowConfig.data);
    if (!dataValidation.passed) {
      validationResults.errors.push(...dataValidation.errors);
      validationResults.passed = false;
    }

    // Validate communication settings
    const commValidation = this.validateCommunication(workflowConfig.communication);
    if (!commValidation.passed) {
      validationResults.errors.push(...commValidation.errors);
      validationResults.passed = false;
    }

    return validationResults;
  }

  /**
   * Validates individual script
   */
  validateScript(script) {
    const result = {
      passed: true,
      errors: [],
      warnings: []
    };

    // Check if script has been tested
    if (!script.tested || script.testStatus !== 'passed') {
      result.errors.push(`Script "${script.id}" has not been tested or tests failed`);
      result.passed = false;
    }

    // Check script size
    if (script.content && script.content.length > this.validationRules.scriptQuality.sizeLimit) {
      result.errors.push(`Script "${script.id}" exceeds size limit of ${this.validationRules.scriptQuality.sizeLimit} bytes`);
      result.passed = false;
    }

    // Check for security issues
    if (this.containsSecurityIssues(script.content)) {
      result.errors.push(`Script "${script.id}" contains potential security issues`);
      result.passed = false;
    }

    // Check for complexity
    if (script.content && this.isTooComplex(script.content)) {
      result.warnings.push(`Script "${script.id}" may be too complex for reliable execution`);
    }

    return result;
  }

  /**
   * Validates agent configuration
   */
  validateAgentConfiguration(agents = []) {
    const result = {
      passed: true,
      errors: [],
      warnings: [],
      recommendations: []
    };

    if (!agents || agents.length === 0) {
      result.errors.push('No agents configured');
      result.passed = false;
    } else {
      for (const agent of agents) {
        // Validate agent settings
        if (!agent.healthCheckEnabled) {
          result.errors.push(`Agent "${agent.id}" does not have health checks enabled`);
          result.passed = false;
        }

        if (!agent.fallbackAgent) {
          result.warnings.push(`Agent "${agent.id}" does not have a fallback agent configured`);
        }

        // Check load balancing configuration
        if (!agent.loadBalancing) {
          result.recommendations.push(`Add load balancing configuration for agent "${agent.id}"`);
        }
      }
    }

    return result;
  }

  /**
   * Validates data handling configuration
   */
  validateDataHandling(dataConfig = {}) {
    const result = {
      passed: true,
      errors: [],
      warnings: []
    };

    // Check if privacy compliance is configured
    if (!dataConfig.privacyCompliance || !dataConfig.privacyCompliance.enabled) {
      result.errors.push('Privacy compliance is not enabled');
      result.passed = false;
    }

    // Check retention policies
    if (!dataConfig.retentionPolicies) {
      result.warnings.push('No data retention policies configured');
    }

    // Check backup configurations
    if (!dataConfig.backup || !dataConfig.backup.enabled) {
      result.warnings.push('Data backups are not configured');
    }

    return result;
  }

  /**
   * Validates communication settings
   */
  validateCommunication(commConfig = {}) {
    const result = {
      passed: true,
      errors: [],
      warnings: []
    };

    // Check rate limiting
    if (!commConfig.rateLimiting || !commConfig.rateLimiting.enabled) {
      result.warnings.push('Rate limiting is not configured');
    }

    // Check retry mechanisms
    if (!commConfig.retryMechanism || !commConfig.retryMechanism.enabled) {
      result.errors.push('Retry mechanism is not configured');
      result.passed = false;
    }

    // Check error handling
    if (!commConfig.errorHandling || !commConfig.errorHandling.enabled) {
      result.errors.push('Error handling is not configured');
      result.passed = false;
    }

    return result;
  }

  /**
   * Checks if content contains potential security issues
   */
  containsSecurityIssues(content) {
    if (!content) return false;

    const securityIssuePatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /require\s*\(\s*['"`]\s*child_process\s*['"`]\s*\)/,
      /require\s*\(\s*['"`]\s*fs\s*['"`]\s*\)/,
      /import\s+.*\s+from\s+/,  // Be careful with dynamic imports
      /new\s+Function\s*/,
    ];

    return securityIssuePatterns.some(pattern => pattern.test(content));
  }

  /**
   * Checks if script is too complex
   */
  isTooComplex(content) {
    if (!content) return false;

    // Count lines and check for complexity indicators
    const lines = content.split('\n');
    if (lines.length > 500) return true; // Too many lines

    // Check for nested structures
    const nestedDepth = this.calculateNestedDepth(content);
    if (nestedDepth > 10) return true; // Too deeply nested

    return false;
  }

  /**
   * Calculates nested structure depth
   */
  calculateNestedDepth(content) {
    let depth = 0;
    let maxDepth = 0;
    const stack = [];

    for (const char of content) {
      if (char === '{' || char === '[' || char === '(') {
        stack.push(char);
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else if (char === '}' || char === ']' || char === ')') {
        if (stack.length > 0) {
          stack.pop();
          depth--;
        }
      }
    }

    return maxDepth;
  }

  /**
   * Gets best practices recommendations
   */
  getBestPracticesRecommendations() {
    return {
      testing: {
        requirement: 'All scripts should be tested before deployment',
        recommendation: 'Implement automated testing pipeline',
        tools: ['unit tests', 'integration tests', 'security scans']
      },
      monitoring: {
        requirement: 'Comprehensive monitoring should be in place',
        recommendation: 'Use centralized logging and alerting',
        metrics: ['response times', 'error rates', 'resource usage', 'user satisfaction']
      },
      security: {
        requirement: 'Security measures must be implemented',
        recommendation: 'Follow security best practices',
        controls: ['input validation', 'output encoding', 'access controls', 'data encryption']
      },
      scaling: {
        requirement: 'System should be able to scale',
        recommendation: 'Implement horizontal and vertical scaling',
        patterns: ['load balancing', 'caching', 'database optimization']
      },
      data: {
        requirement: 'Data should be handled responsibly',
        recommendation: 'Follow data privacy regulations',
        practices: ['minimal data collection', 'secure storage', 'regular purging']
      }
    };
  }
}

/**
 * Quality Assurance System - Validates and ensures quality of operations
 */
class QualityAssuranceSystem {
  constructor() {
    this.qualityMetrics = {
      responseTime: 0,
      accuracy: 0,
      userSatisfaction: 0,
      errorRate: 0,
      uptime: 0
    };
    
    this.qaLogs = [];
  }

  /**
   * Performs quality assessment on an interaction
   */
  assessQuality(interactionResult, expectedOutcome) {
    const assessment = {
      interactionId: interactionResult.id,
      timestamp: new Date().toISOString(),
      metrics: this.calculateQualityMetrics(interactionResult, expectedOutcome),
      score: 0,
      grade: 'F',
      feedback: []
    };

    // Calculate overall score (0-100)
    assessment.score = this.calculateScore(assessment.metrics);
    assessment.grade = this.scoreToGrade(assessment.score);

    // Generate feedback
    assessment.feedback = this.generateFeedback(assessment.metrics);

    // Log the assessment
    this.qaLogs.push(assessment);

    return assessment;
  }

  /**
   * Calculates quality metrics
   */
  calculateQualityMetrics(result, expected) {
    // Response time quality
    const responseTimeQuality = result.responseTime ? 
      Math.max(0, Math.min(1, (5000 - result.responseTime) / 5000)) : 0.5;

    // Accuracy (how well did we match expected outcome)
    const accuracy = this.calculateAccuracy(result, expected);

    // User satisfaction (if available)
    const userSatisfaction = result.userSatisfaction || 0.5;

    // Error presence
    const errorFree = result.error ? 0 : 1;

    return {
      responseTime: responseTimeQuality,
      accuracy: accuracy,
      userSatisfaction: userSatisfaction,
      errorFree: errorFree,
      overallQuality: (responseTimeQuality + accuracy + userSatisfaction + errorFree) / 4
    };
  }

  /**
   * Calculates accuracy score
   */
  calculateAccuracy(result, expected) {
    if (!expected) return 0.5; // Neutral if no expectation

    let correctItems = 0;
    let totalItems = 0;

    for (const [key, expectedValue] of Object.entries(expected)) {
      if (result[key] !== undefined) {
        totalItems++;
        if (result[key] === expectedValue) {
          correctItems++;
        }
      }
    }

    return totalItems > 0 ? correctItems / totalItems : 0.5;
  }

  /**
   * Calculates overall score
   */
  calculateScore(metrics) {
    // Weighted average of different metrics
    const weights = {
      responseTime: 0.2,
      accuracy: 0.3,
      userSatisfaction: 0.3,
      errorFree: 0.2
    };

    const score = (metrics.responseTime * weights.responseTime) +
                  (metrics.accuracy * weights.accuracy) +
                  (metrics.userSatisfaction * weights.userSatisfaction) +
                  (metrics.errorFree * weights.errorFree);

    return Math.round(score * 100); // Convert to 0-100 scale
  }

  /**
   * Converts numerical score to letter grade
   */
  scoreToGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Generates feedback based on metrics
   */
  generateFeedback(metrics) {
    const feedback = [];

    if (metrics.responseTime < 0.5) {
      feedback.push('Response time is too slow');
    }
    
    if (metrics.accuracy < 0.7) {
      feedback.push('Accuracy needs improvement');
    }
    
    if (metrics.userSatisfaction < 0.6) {
      feedback.push('User satisfaction is low');
    }
    
    if (metrics.errorFree < 1) {
      feedback.push('Errors detected in interaction');
    }

    return feedback;
  }

  /**
   * Gets quality dashboard
   */
  getQualityDashboard() {
    if (this.qaLogs.length === 0) {
      return { message: 'No quality data available yet' };
    }

    const recentLogs = this.qaLogs.slice(-50); // Last 50 interactions
    
    const avgScore = recentLogs.reduce((sum, log) => sum + log.score, 0) / recentLogs.length;
    const gradeDistribution = this.calculateGradeDistribution(recentLogs);
    const commonFeedback = this.getCommonFeedback(recentLogs);

    return {
      timestamp: new Date().toISOString(),
      overallScore: Math.round(avgScore),
      grade: this.scoreToGrade(avgScore),
      gradeDistribution,
      commonFeedback,
      totalAssessments: this.qaLogs.length,
      period: 'last_50_interactions'
    };
  }

  /**
   * Calculates grade distribution
   */
  calculateGradeDistribution(logs) {
    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    
    for (const log of logs) {
      distribution[log.grade]++;
    }
    
    return distribution;
  }

  /**
   * Gets common feedback themes
   */
  getCommonFeedback(logs) {
    const feedbackCount = {};
    
    for (const log of logs) {
      for (const feedback of log.feedback) {
        feedbackCount[feedback] = (feedbackCount[feedback] || 0) + 1;
      }
    }
    
    return Object.entries(feedbackCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // Top 5 feedback items
  }

  /**
   * Performs system-wide validation
   */
  performSystemValidation() {
    return {
      scripts: this.validateAllScripts(),
      agents: this.validateAllAgents(),
      dataHandling: this.validateDataPractices(),
      communication: this.validateCommunicationPractices(),
      overallHealth: this.calculateOverallHealth()
    };
  }

  /**
   * Validates all scripts
   */
  validateAllScripts() {
    // This would normally check all scripts in the system
    // For simulation, return mock results
    return {
      total: 10,
      valid: 8,
      invalid: 2,
      needsTesting: 1,
      securityIssues: 0
    };
  }

  /**
   * Validates all agents
   */
  validateAllAgents() {
    return {
      total: 5,
      healthy: 4,
      unhealthy: 1,
      withoutFallback: 1,
      withoutHealthCheck: 0
    };
  }

  /**
   * Validates data handling practices
   */
  validateDataPractices() {
    return {
      privacyCompliant: true,
      retentionPolicies: true,
      backupEnabled: true,
      encryptionEnabled: true
    };
  }

  /**
   * Validates communication practices
   */
  validateCommunicationPractices() {
    return {
      rateLimiting: true,
      retryMechanism: true,
      errorHandling: true,
      monitoringEnabled: true
    };
  }

  /**
   * Calculates overall system health
   */
  calculateOverallHealth() {
    const validation = this.performSystemValidation();
    
    const scriptHealth = validation.scripts.valid / validation.scripts.total;
    const agentHealth = validation.agents.healthy / validation.agents.total;
    const dataHealth = Object.values(validation.dataHandling).filter(v => v).length / 
                       Object.values(validation.dataHandling).length;
    const commHealth = Object.values(validation.communication).filter(v => v).length / 
                       Object.values(validation.communication).length;
    
    const overallHealth = (scriptHealth + agentHealth + dataHealth + commHealth) / 4;
    
    let status = 'healthy';
    if (overallHealth < 0.7) status = 'warning';
    if (overallHealth < 0.5) status = 'critical';
    
    return {
      percentage: Math.round(overallHealth * 100),
      status: status,
      score: Math.round(overallHealth * 100)
    };
  }
}

module.exports = {
  BestPracticesValidator,
  QualityAssuranceSystem
};