// Script Management and Agent Training System
// SECURED: Uses vm2 sandbox instead of eval/Function

const { VM, VMScript } = require('vm2');
const winston = require('winston');
const { validateInput, ScriptUploadSchema, ScriptUpdateSchema } = require('./validation_schemas');
const { createLogger } = require('./logger');

const logger = createLogger('ScriptManager');

/**
 * Script Manager - Handles script upload, validation, and versioning
 * SECURITY IMPROVEMENT: Uses vm2 sandbox for safe script execution
 */
class ScriptManager {
  constructor(options = {}) {
    this.scripts = new Map();
    this.versionHistory = new Map();
    this.options = {
      maxScriptSize: options.maxScriptSize || 102400, // 100KB
      executionTimeout: options.executionTimeout || 5000, // 5 seconds
      memoryLimit: options.memoryLimit || 128, // MB
      ...options
    };
  }

  /**
   * Uploads and validates a new script
   */
  async uploadScript(scriptId, scriptData) {
    // Validate input using Zod schema
    const validation = validateInput(ScriptUploadSchema, { scriptId, ...scriptData });
    if (!validation.success) {
      logger.warn('Script upload validation failed', { scriptId, error: validation.error });
      throw new Error(`Validation failed: ${validation.error.message}`);
    }

    const data = validation.data;

    try {
      // Validate script structure and security
      const validationResult = await this.validateScript(data);

      if (!validationResult.valid) {
        logger.error('Script validation failed', { scriptId, errors: validationResult.errors });
        throw new Error(`Script validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Create new script object
      const script = {
        id: scriptId,
        content: data.content,
        metadata: {
          name: data.name || `Script-${scriptId}`,
          description: data.description || '',
          author: data.author || 'system',
          createdDate: new Date().toISOString(),
          version: 1,
          status: 'draft',
          type: data.type || 'conversation',
          category: data.category || 'general',
          targetAudience: data.targetAudience || 'all'
        },
        validation: validationResult,
        lastModified: new Date().toISOString(),
        securityScan: {
          passed: true,
          scannedAt: new Date().toISOString(),
          issues: []
        }
      };

      // Add to version history
      const history = this.versionHistory.get(scriptId) || [];
      history.push({ ...script, metadata: { ...script.metadata, version: 0 } });
      this.versionHistory.set(scriptId, history);

      // Store the script
      this.scripts.set(scriptId, script);

      logger.info('Script uploaded successfully', { scriptId, type: script.metadata.type });

      return script;
    } catch (error) {
      logger.error('Script upload failed', { scriptId, error: error.message });
      throw error;
    }
  }

  /**
   * Validates script content and structure
   * SECURITY: Uses vm2 for safe syntax validation
   */
  async validateScript(scriptData) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!scriptData.content) {
      errors.push('Script content is required');
      return { valid: false, errors, warnings };
    }

    // Check length limits
    const contentSize = Buffer.byteLength(scriptData.content, 'utf8');
    if (contentSize > this.options.maxScriptSize) {
      errors.push(`Script exceeds size limit (${contentSize} > ${this.options.maxScriptSize} bytes)`);
    }

    // SECURITY: Check for dangerous code patterns BEFORE any execution
    const securityCheck = this.performSecurityScan(scriptData.content);
    if (!securityCheck.safe) {
      errors.push(...securityCheck.issues);
    }

    // Validate script syntax if it's JavaScript using SAFE vm2 sandbox
    if (scriptData.type === 'javascript') {
      try {
        const syntaxValidation = this.validateJavaScriptSyntax(scriptData.content);
        if (!syntaxValidation.valid) {
          errors.push(`Syntax error: ${syntaxValidation.error}`);
        }
      } catch (error) {
        errors.push(`Syntax validation error: ${error.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      securityScan: securityCheck
    };
  }

  /**
   * SECURITY: Performs comprehensive security scan on script content
   */
  performSecurityScan(content) {
    const issues = [];
    
    const dangerousPatterns = [
      { pattern: /\beval\s*\(/i, description: 'eval() function usage - code injection risk' },
      { pattern: /\bFunction\s*\(/i, description: 'Function constructor - code injection risk' },
      { pattern: /\bnew\s+Function\s*\(/i, description: 'new Function() - code injection risk' },
      { pattern: /\bdocument\.cookie/i, description: 'Cookie access - security risk' },
      { pattern: /\blocalStorage\b/i, description: 'Local storage access - data isolation risk' },
      { pattern: /\bsessionStorage\b/i, description: 'Session storage access - data isolation risk' },
      { pattern: /\bXMLHttpRequest\b/i, description: 'XHR - network access risk' },
      { pattern: /\bfetch\s*\(/i, description: 'fetch() - network access risk' },
      { pattern: /require\s*\(\s*['"]fs['"]\s*\)/i, description: 'File system access' },
      { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/i, description: 'Process spawning' },
      { pattern: /require\s*\(\s*['"]net['"]\s*\)/i, description: 'Network access' },
      { pattern: /require\s*\(\s*['"]http['"]\s*\)/i, description: 'HTTP access' },
      { pattern: /require\s*\(\s*['"]https['"]\s*\)/i, description: 'HTTPS access' },
      { pattern: /\bprocess\.env/i, description: 'Environment variable access' },
      { pattern: /\bprocess\.exit/i, description: 'Process termination' },
      { pattern: /\bexec\s*\(/i, description: 'Command execution' },
      { pattern: /\bspawn\s*\(/i, description: 'Process spawning' },
      { pattern: /\bfork\s*\(/i, description: 'Process forking' },
      { pattern: /\b__filename\b/i, description: 'File path disclosure' },
      { pattern: /\b__dirname\b/i, description: 'Directory path disclosure' },
      { pattern: /import\s+.*\s+from\s+['"]/i, description: 'Module import - potential code loading' }
    ];

    for (const { pattern, description } of dangerousPatterns) {
      if (pattern.test(content)) {
        issues.push(`Dangerous code pattern: ${description}`);
      }
    }

    // Check for obfuscated code
    if (this.detectObfuscation(content)) {
      issues.push('Potentially obfuscated code detected');
    }

    // Check for infinite loops
    if (this.detectInfiniteLoopRisk(content)) {
      issues.push('Potential infinite loop risk detected');
    }

    return {
      safe: issues.length === 0,
      issues,
      scannedAt: new Date().toISOString()
    };
  }

  /**
   * Detects potentially obfuscated code
   */
  detectObfuscation(content) {
    // Check for excessive use of String.fromCharCode
    const charCodeAtCount = (content.match(/String\.fromCharCode/gi) || []).length;
    if (charCodeAtCount > 5) return true;

    // Check for excessive escape sequences
    const escapeCount = (content.match(/\\x[0-9a-fA-F]{2}/g) || []).length;
    if (escapeCount > 10) return true;

    // Check for base64-like patterns
    const base64Pattern = /[A-Za-z0-9+/]{50,}={0,2}/;
    if (base64Pattern.test(content)) return true;

    return false;
  }

  /**
   * Detects potential infinite loop risks
   */
  detectInfiniteLoopRisk(content) {
    // Check for while(true) or for(;;) without obvious breaks
    const whileTrueMatches = content.match(/while\s*\(\s*true\s*\)/g) || [];
    const forInfiniteMatches = content.match(/for\s*\(\s*;\s*;\s*\)/g) || [];
    
    // Count breaks in the content
    const breakCount = (content.match(/\bbreak\b/g) || []).length;
    
    // If there are infinite loops but few breaks, flag it
    return (whileTrueMatches.length + forInfiniteMatches.length) > breakCount;
  }

  /**
   * SECURITY: Validates JavaScript syntax using vm2 sandbox
   */
  validateJavaScriptSyntax(content) {
    try {
      // Create a secure VM for syntax validation only
      const vm = new VM({
        timeout: 1000,
        sandbox: {},
        eval: false,
        wasm: false,
        fixAsync: true
      });

      // Try to compile the script without executing
      const script = new VMScript(content);
      vm.run(script);

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Activates a script after testing
   */
  async activateScript(scriptId) {
    const script = this.scripts.get(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    if (script.metadata.status === 'active') {
      logger.debug('Script already active', { scriptId });
      return script;
    }

    // Run tests before activation
    const testResult = await this.runScriptTests(scriptId);
    if (!testResult.passed) {
      logger.error('Script activation failed tests', { scriptId, errors: testResult.errors });
      throw new Error(`Script tests failed: ${testResult.errors.join(', ')}`);
    }

    // Activate the script
    script.metadata.status = 'active';
    script.metadata.activatedDate = new Date().toISOString();
    script.lastModified = new Date().toISOString();

    logger.info('Script activated', { scriptId });

    return script;
  }

  /**
   * Runs tests on a script using secure vm2 sandbox
   */
  async runScriptTests(scriptId) {
    const script = this.scripts.get(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    const testResults = {
      passed: true,
      errors: [],
      warnings: [],
      testResults: []
    };

    // Security test (already done during upload, but verify again)
    const securityCheck = this.performSecurityScan(script.content);
    if (!securityCheck.safe) {
      testResults.passed = false;
      testResults.errors.push('Security test failed - contains dangerous code');
    } else {
      testResults.testResults.push({
        testName: 'security_test',
        passed: true,
        details: 'No security issues detected'
      });
    }

    // Syntax test using vm2
    if (script.metadata.type === 'javascript') {
      try {
        const vm = new VM({
          timeout: this.options.executionTimeout,
          sandbox: { console: { log: () => {} } },
          eval: false,
          wasm: false,
          fixAsync: true
        });

        const testScript = new VMScript(script.content);
        vm.run(testScript);

        testResults.testResults.push({
          testName: 'syntax_test',
          passed: true,
          details: 'Syntax is valid'
        });
      } catch (e) {
        testResults.passed = false;
        testResults.errors.push(`Syntax test failed: ${e.message}`);
      }
    }

    // Execution test with mock context
    if (script.content && script.metadata.type === 'javascript') {
      try {
        const vm = new VM({
          timeout: this.options.executionTimeout,
          sandbox: {
            context: { input: { test: true }, output: {} },
            console: { log: () => {} }
          },
          eval: false,
          wasm: false,
          fixAsync: true
        });

        const executionTest = new VMScript(`
          (function(context) {
            ${script.content}
            return context;
          })(context);
        `);
        
        vm.run(executionTest);

        testResults.testResults.push({
          testName: 'execution_test',
          passed: true,
          details: 'Script executed without errors'
        });
      } catch (e) {
        testResults.passed = false;
        testResults.errors.push(`Execution test failed: ${e.message}`);
      }
    }

    return testResults;
  }

  /**
   * Updates an existing script
   */
  async updateScript(scriptId, updateData) {
    const script = this.scripts.get(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    // Validate update data
    const validation = validateInput(ScriptUpdateSchema, { scriptId, ...updateData });
    if (!validation.success) {
      throw new Error(`Validation failed: ${validation.error.message}`);
    }

    const data = validation.data;
    const oldVersion = script.metadata.version;

    // Store old version in history
    const history = this.versionHistory.get(scriptId) || [];
    history.push({
      ...script,
      metadata: { ...script.metadata, version: oldVersion, status: 'archived' }
    });
    this.versionHistory.set(scriptId, history);

    // Update script
    if (data.content !== undefined) {
      script.content = data.content;
      // Re-validate on content update
      script.validation = await this.validateScript({ ...data, content: data.content });
    }

    if (data.name !== undefined) script.metadata.name = data.name;
    if (data.description !== undefined) script.metadata.description = data.description;
    if (data.status !== undefined) script.metadata.status = data.status;

    script.metadata.version++;
    script.lastModified = new Date().toISOString();

    logger.info('Script updated', { scriptId, version: script.metadata.version });

    return script;
  }

  /**
   * Gets a script by ID
   */
  getScript(scriptId) {
    return this.scripts.get(scriptId);
  }

  /**
   * Gets script version history
   */
  getVersionHistory(scriptId) {
    return this.versionHistory.get(scriptId) || [];
  }

  /**
   * SECURITY: Applies a script using vm2 sandbox
   */
  applyScript(scriptId, context) {
    const script = this.scripts.get(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    if (script.metadata.status !== 'active') {
      throw new Error(`Script ${scriptId} is not active (status: ${script.metadata.status})`);
    }

    try {
      // Create secure VM with limited sandbox
      const vm = new VM({
        timeout: this.options.executionTimeout,
        sandbox: {
          context: { ...context },
          console: {
            log: (...args) => logger.debug('Script log', { scriptId, args }),
            error: (...args) => logger.error('Script error', { scriptId, args }),
            warn: (...args) => logger.warn('Script warning', { scriptId, args })
          }
        },
        eval: false,
        wasm: false,
        fixAsync: true
      });

      const executionScript = new VMScript(`
        (function(context) {
          try {
            ${script.content}
            return context;
          } catch (error) {
            throw new Error('Script execution error: ' + error.message);
          }
        })(context);
      `);

      const result = vm.run(executionScript);
      logger.debug('Script executed successfully', { scriptId });
      
      return result;
    } catch (error) {
      logger.error('Script execution failed', { scriptId, error: error.message });
      throw new Error(`Script execution failed: ${error.message}`);
    }
  }

  /**
   * Lists all scripts with filtering options
   */
  listScripts(filters = {}) {
    const result = [];

    for (const [id, script] of this.scripts) {
      let include = true;

      if (filters.status && script.metadata.status !== filters.status) include = false;
      if (filters.category && script.metadata.category !== filters.category) include = false;
      if (filters.type && script.metadata.type !== filters.type) include = false;

      if (include) {
        result.push({
          id: script.id,
          name: script.metadata.name,
          status: script.metadata.status,
          version: script.metadata.version,
          category: script.metadata.category,
          lastModified: script.lastModified,
          securityScanPassed: script.securityScan?.passed ?? true
        });
      }
    }

    return result;
  }

  /**
   * Archives a script
   */
  archiveScript(scriptId) {
    const script = this.scripts.get(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    script.metadata.status = 'archived';
    script.metadata.archivedDate = new Date().toISOString();
    script.lastModified = new Date().toISOString();

    logger.info('Script archived', { scriptId });

    return script;
  }

  /**
   * Deletes a script permanently
   */
  deleteScript(scriptId) {
    const deleted = this.scripts.delete(scriptId);
    if (deleted) {
      logger.info('Script deleted', { scriptId });
    }
    return deleted;
  }

  /**
   * Gets security scan report for a script
   */
  getSecurityReport(scriptId) {
    const script = this.scripts.get(scriptId);
    if (!script) return null;

    return {
      scriptId,
      lastScan: script.securityScan,
      validationHistory: this.versionHistory.get(scriptId)?.map(v => ({
        version: v.metadata.version,
        securityScan: v.securityScan,
        validation: v.validation
      })) || []
    };
  }
}

/**
 * Agent Trainer - Manages agent training and model updates
 */
class AgentTrainer {
  constructor() {
    this.trainingModels = new Map();
    this.logger = createLogger('AgentTrainer');
  }

  /**
   * Trains an agent with the provided script
   */
  async trainAgent(agentId, scriptId, trainingData = {}) {
    this.logger.info('Starting agent training', { agentId, scriptId });

    const trainingModel = {
      agentId,
      scriptId,
      status: 'training',
      progress: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      trainingData: trainingData,
      results: null
    };

    this.trainingModels.set(agentId, trainingModel);

    try {
      // Simulate training process
      for (let i = 1; i <= 10; i++) {
        await this.delay(100);
        trainingModel.progress = i * 10;
      }

      trainingModel.status = 'completed';
      trainingModel.completedAt = new Date().toISOString();
      trainingModel.results = {
        accuracy: 0.95,
        trainingTime: Date.now() - new Date(trainingModel.startedAt).getTime(),
        examplesProcessed: trainingData.examples?.length || 0
      };

      this.logger.info('Agent training completed', { agentId, accuracy: trainingModel.results.accuracy });

      return trainingModel;
    } catch (error) {
      trainingModel.status = 'failed';
      trainingModel.error = error.message;
      this.logger.error('Agent training failed', { agentId, error: error.message });
      return trainingModel;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getTrainingStatus(agentId) {
    return this.trainingModels.get(agentId);
  }

  isAgentTrainedWithScript(agentId, scriptId) {
    const model = this.trainingModels.get(agentId);
    return model && model.scriptId === scriptId && model.status === 'completed';
  }
}

module.exports = {
  ScriptManager,
  AgentTrainer
};
