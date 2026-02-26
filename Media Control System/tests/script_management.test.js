// Tests for Script Management System

const { ScriptManager } = require('../script_management_system');

describe('ScriptManager', () => {
  let scriptManager;

  beforeEach(() => {
    scriptManager = new ScriptManager({
      maxScriptSize: 102400,
      executionTimeout: 5000
    });
  });

  describe('uploadScript', () => {
    it('should upload a valid script', async () => {
      const scriptData = {
        content: 'console.log("Hello World");',
        name: 'Test Script',
        type: 'javascript',
        category: 'test'
      };

      const result = await scriptManager.uploadScript('test-script-1', scriptData);

      expect(result.id).toBe('test-script-1');
      expect(result.metadata.name).toBe('Test Script');
      expect(result.metadata.status).toBe('draft');
    });

    it('should reject script with dangerous code', async () => {
      const scriptData = {
        content: 'eval("malicious code")',
        name: 'Bad Script',
        type: 'javascript'
      };

      await expect(scriptManager.uploadScript('bad-script', scriptData))
        .rejects.toThrow('Script validation failed');
    });

    it('should reject script exceeding size limit', async () => {
      const scriptData = {
        content: 'x'.repeat(102401),
        name: 'Large Script',
        type: 'javascript'
      };

      await expect(scriptManager.uploadScript('large-script', scriptData))
        .rejects.toThrow('Script validation failed');
    });

    it('should reject script with empty content', async () => {
      const scriptData = {
        content: '',
        name: 'Empty Script'
      };

      await expect(scriptManager.uploadScript('empty-script', scriptData))
        .rejects.toThrow('Validation failed');
    });
  });

  describe('validateScript', () => {
    it('should detect eval() as dangerous', () => {
      const result = scriptManager.performSecurityScan('eval("code")');
      expect(result.safe).toBe(false);
      expect(result.issues).toContainEqual(expect.stringContaining('eval()'));
    });

    it('should detect require("fs") as dangerous', () => {
      const result = scriptManager.performSecurityScan('require("fs")');
      expect(result.safe).toBe(false);
    });

    it('should allow safe script', () => {
      const result = scriptManager.performSecurityScan('const x = 1 + 2; console.log(x);');
      expect(result.safe).toBe(true);
    });

    it('should detect obfuscated code', () => {
      const obfuscated = 'String.fromCharCode(97) + String.fromCharCode(98) + String.fromCharCode(99) + String.fromCharCode(100) + String.fromCharCode(101) + String.fromCharCode(102)';
      const result = scriptManager.performSecurityScan(obfuscated);
      expect(result.safe).toBe(false);
    });
  });

  describe('getScript', () => {
    it('should return undefined for non-existent script', () => {
      const result = scriptManager.getScript('non-existent');
      expect(result).toBeUndefined();
    });

    it('should return script after upload', async () => {
      await scriptManager.uploadScript('test-1', {
        content: 'console.log("test");',
        name: 'Test'
      });

      const result = scriptManager.getScript('test-1');
      expect(result).toBeDefined();
      expect(result.id).toBe('test-1');
    });
  });

  describe('listScripts', () => {
    it('should return empty array when no scripts', () => {
      const result = scriptManager.listScripts();
      expect(result).toEqual([]);
    });

    it('should filter by status', async () => {
      await scriptManager.uploadScript('script-1', {
        content: 'console.log(1);',
        status: 'draft'
      });
      await scriptManager.uploadScript('script-2', {
        content: 'console.log(2);',
        status: 'active'
      });

      const draftScripts = scriptManager.listScripts({ status: 'draft' });
      expect(draftScripts.length).toBe(1);
      expect(draftScripts[0].id).toBe('script-1');
    });
  });

  describe('activateScript', () => {
    it('should activate a valid script', async () => {
      await scriptManager.uploadScript('activate-test', {
        content: 'const x = 1;',
        name: 'Activate Test'
      });

      const result = await scriptManager.activateScript('activate-test');
      expect(result.metadata.status).toBe('active');
    });

    it('should fail to activate non-existent script', async () => {
      await expect(scriptManager.activateScript('non-existent'))
        .rejects.toThrow('not found');
    });
  });

  describe('applyScript', () => {
    it('should execute safe script in sandbox', async () => {
      await scriptManager.uploadScript('exec-test', {
        content: 'context.result = context.input + 1;',
        name: 'Exec Test'
      });
      await scriptManager.activateScript('exec-test');

      const result = scriptManager.applyScript('exec-test', { input: 5 });
      expect(result.context.result).toBe(6);
    });

    it('should prevent access to process in sandbox', async () => {
      await scriptManager.uploadScript('process-test', {
        content: 'context.result = process.env;',
        name: 'Process Test'
      });
      await scriptManager.activateScript('process-test');

      expect(() => scriptManager.applyScript('process-test', {}))
        .toThrow();
    });
  });
});
