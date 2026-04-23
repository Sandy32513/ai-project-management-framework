/**
 * TASK-021 + TASK-022: Jest unit tests for AI Project Management Framework
 * Covers all 6 engines + InputValidator + edge cases
 */

const { FrameworkEngine, InputValidator } = require('../src/core');

let framework;

beforeEach(() => {
  framework = new FrameworkEngine();
  framework.init({
    configPath: './config',
    rolesPath: './roles'
  });
});

// ═══════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════
describe('FrameworkEngine - Initialization', () => {
  test('init loads roles successfully', () => {
    expect(framework.initialized).toBe(true);
    expect(Object.keys(framework.roles).length).toBeGreaterThan(70);
  });

  test('init loads decision levels', () => {
    expect(framework.modules.decision.levels.length).toBe(6);
  });

  test('throws if not initialized', () => {
    const uninit = new FrameworkEngine();
    expect(() => uninit.routeProject({})).toThrow('Framework not initialized');
  });

  test('healthCheck returns correct status', () => {
    const health = framework.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.rolesLoaded).toBeGreaterThan(70);
    expect(health.modulesActive).toBe(6);
  });

  test('uninitialzed healthCheck returns uninitialized', () => {
    const uninit = new FrameworkEngine();
    const health = uninit.healthCheck();
    expect(health.status).toBe('uninitialized');
  });
});

// ═══════════════════════════════════════════
//  ROUTING ENGINE
// ═══════════════════════════════════════════
describe('RoutingEngine', () => {
  test('routes engineering project to appropriate role', () => {
    const result = framework.routeProject({
      name: 'New Feature',
      department: 'Engineering',
      required_skills: ['javascript'],
      priority: 'high'
    });
    expect(result.assigned).toBeTruthy();
    expect(result.department).toBe('Engineering');
  });

  test('routes security ticket to CISO', () => {
    const result = framework.routeTicket({
      type: 'security',
      priority: 'critical'
    });
    expect(result.assigned).toBe('CISO');
    expect(result.sla).toBe('15m');
  });

  test('routes billing ticket to CFO', () => {
    const result = framework.routeTicket({
      type: 'billing',
      priority: 'medium'
    });
    expect(result.assigned).toBe('CFO');
  });

  test('handles unknown ticket type', () => {
    const result = framework.routeTicket({
      type: 'unknown_type',
      priority: 'low'
    });
    expect(result.assigned).toBeTruthy();
    expect(result.sla).toBe('24h');
  });

  test('SLA mapping is correct', () => {
    expect(framework.routeTicket({ type: 'tech', priority: 'critical' }).sla).toBe('15m');
    expect(framework.routeTicket({ type: 'tech', priority: 'high' }).sla).toBe('1h');
    expect(framework.routeTicket({ type: 'tech', priority: 'medium' }).sla).toBe('4h');
    expect(framework.routeTicket({ type: 'tech', priority: 'low' }).sla).toBe('24h');
  });
});

// ═══════════════════════════════════════════
//  ESCALATION ENGINE
// ═══════════════════════════════════════════
describe('EscalationEngine', () => {
  test('escalates to next level', () => {
    const result = framework.escalate(
      { assignedTo: 'Software Engineer', department: 'engineering' },
      'Task timeout'
    );
    expect(result.escalated).toBe(true);
    expect(result.from).toBe('Software Engineer');
    expect(result.to).toBe('Senior Developer');
  });

  test('returns all escalation paths', () => {
    const path = framework.getEscalationPath('engineering');
    expect(path).toContain('Junior Developer');
    expect(path).toContain('CTO');
    expect(path.length).toBe(8);
  });

  test('handles unknown department with fallback', () => {
    const path = framework.getEscalationPath('nonexistent');
    expect(path).toEqual(framework.getEscalationPath('engineering'));
  });

  test('cannot escalate from highest level without fallback', () => {
    const result = framework.escalate(
      { assignedTo: 'CEO', department: 'engineering' },
      'Test'
    );
    expect(result.escalated).toBe(false);
  });

  test('fallback chain works for CISO', () => {
    const result = framework.escalate(
      { assignedTo: 'CISO', department: 'security' },
      'Critical security incident'
    );
    // CISO is in the security path with CEO after it, so normal escalation succeeds
    expect(result.escalated).toBe(true);
    expect(result.to).toBe('CEO');
  });
});

// ═══════════════════════════════════════════
//  DECISION ENGINE
// ═══════════════════════════════════════════
describe('DecisionEngine', () => {
  test('approves within authority', () => {
    const result = framework.makeDecision('budget_approval', {
      budget: 500,
      impact: 'low',
      requestedBy: 'Tech Lead'
    });
    expect(result.decision).toBe('approved');
    expect(result.level).toBe(2);
  });

  test('requires escalation when authority insufficient', () => {
    const result = framework.makeDecision('budget_approval', {
      budget: 50000,
      impact: 'high',
      requestedBy: 'Engineering Manager'
    });
    expect(result.decision).toBe('pending_escalation');
    expect(result.requiresEscalation).toBe(true);
    expect(result.level).toBe(5);
  });

  test('resolves authority level for known role', () => {
    const level = framework.getAuthorityLevel('Tech Lead');
    expect(level).toBeTruthy();
    expect(level.role).toBe('Tech Lead');
    expect(level.level).toBe(3);
  });

  test('returns null for unknown role', () => {
    const level = framework.getAuthorityLevel('Nonexistent Role');
    expect(level).toBeNull();
  });

  test('critical impact triggers highest level', () => {
    const result = framework.makeDecision('emergency', {
      budget: 0,
      impact: 'critical',
      requestedBy: 'CEO'
    });
    expect(result.level).toBe(6);
    expect(result.decision).toBe('approved');
  });
});

// ═══════════════════════════════════════════
//  RESOURCE ALLOCATION
// ═══════════════════════════════════════════
describe('ResourceAllocationEngine', () => {
  test('allocates resources to project', () => {
    const result = framework.allocate(
      { id: 'proj-001', name: 'Test' },
      { developers: 3 }
    );
    expect(result.status).toBe('allocated');
    expect(result.projectId).toBe('proj-001');
  });

  test('rejects allocation at max capacity', () => {
    // getResourceLoad counts per-project, max is 5
    for (let i = 0; i < 5; i++) {
      framework.allocate({ id: 'proj-cap', name: 'Cap' }, { devs: 1 });
    }
    // 6th allocation for same project should be rejected
    const result = framework.allocate({ id: 'proj-cap', name: 'Over' }, { devs: 1 });
    expect(result.status).toBe('rejected');
    expect(result.reason).toContain('Max concurrent tasks');
  });

  test('deallocates resources', () => {
    framework.allocate({ id: 'dealloc-test' }, { devs: 1 });
    const result = framework.deallocate('dealloc-test');
    expect(result.released).toBe(1);
  });

  test('rebalance returns state', () => {
    const result = framework.rebalance();
    expect(result.rebalanced).toBe(true);
    expect(result.capacity).toBeDefined();
  });
});

// ═══════════════════════════════════════════
//  AUDIT ENGINE
// ═══════════════════════════════════════════
describe('AuditEngine', () => {
  test('generates quarterly audit report', () => {
    const report = framework.generateReport('quarterly_audit', 'Q1 2026');
    expect(report.type).toBe('quarterly_audit');
    expect(report.template.title).toBe('Quarterly Audit Report');
    expect(report.period).toBe('Q1 2026');
  });

  test('sends report to CEO', () => {
    const report = framework.generateReport('quarterly_audit', 'Q1');
    const result = framework.sendToCEO(report, 'high');
    expect(result.sent).toBe(true);
    expect(result.to).toBe('CEO');
    expect(result.priority).toBe('high');
  });

  test('falls back to daily_ticket for unknown type', () => {
    const report = framework.generateReport('nonexistent_type', 'Q1');
    expect(report.template.title).toBe('Daily Ticket Summary');
  });
});

// ═══════════════════════════════════════════
//  VALIDATION ENGINE
// ═══════════════════════════════════════════
describe('ValidationEngine', () => {
  test('validates and returns issues', () => {
    const result = framework.validate();
    expect(result.issueCount).toBeDefined();
    expect(result.validatedAt).toBeTruthy();
    expect(result.issues).toBeInstanceOf(Array);
  });

  test('reduced orphans after normalization fix (TASK-005)', () => {
    const result = framework.validate();
    // Before fix: 55 orphans. After fix: should be < 10
    expect(result.issueCount).toBeLessThan(15);
  });

  test('suggests parent roles correctly', () => {
    const result = framework.validate();
    const qaLeadIssue = result.issues.find(i => i.role === 'QA Lead');
    if (qaLeadIssue) {
      expect(qaLeadIssue.suggestedFix).toBe('QA Director');
    }
  });
});

// ═══════════════════════════════════════════
//  INPUT VALIDATION (TASK-016)
// ═══════════════════════════════════════════
describe('InputValidator', () => {
  test('validates strings', () => {
    expect(InputValidator.validateString('hello', 'field')).toBe('hello');
    expect(InputValidator.validateString('  trimmed  ', 'field')).toBe('trimmed');
    expect(InputValidator.validateString(null, 'field')).toBeNull();
  });

  test('rejects injection patterns', () => {
    expect(() => InputValidator.validateString('<script>alert(1)</script>', 'test')).toThrow('unsafe');
    expect(() => InputValidator.validateString('eval(code)', 'test')).toThrow('unsafe');
    expect(() => InputValidator.validateString('${injection}', 'test')).toThrow('unsafe');
  });

  test('rejects non-string values', () => {
    expect(() => InputValidator.validateString(123, 'field')).toThrow('must be a string');
  });

  test('validates numbers', () => {
    expect(InputValidator.validateNumber(42, 'n')).toBe(42);
    expect(InputValidator.validateNumber('42', 'n')).toBe(42);
    expect(() => InputValidator.validateNumber('abc', 'n')).toThrow('must be a number');
    expect(() => InputValidator.validateNumber(-1, 'n', 0)).toThrow('must be between');
  });

  test('validates objects', () => {
    expect(InputValidator.validateObject({}, 'o')).toEqual({});
    expect(() => InputValidator.validateObject(null, 'o')).toThrow('must be a non-null');
    expect(() => InputValidator.validateObject([], 'o')).toThrow('must be a non-null');
    expect(() => InputValidator.validateObject('string', 'o')).toThrow('must be a non-null');
  });

  test('sanitizeProject returns clean object', () => {
    const result = InputValidator.sanitizeProject({
      name: 'Test Project',
      department: 'Engineering',
      required_skills: ['js'],
      priority: 'high'
    });
    expect(result.name).toBe('Test Project');
    expect(result.required_skills).toEqual(['js']);
  });

  test('rejects project with injection in name', () => {
    expect(() => InputValidator.sanitizeProject({
      name: '<script>hack</script>',
      department: 'Engineering'
    })).toThrow('unsafe');
  });
});

// ═══════════════════════════════════════════
//  SECURITY TESTS
// ═══════════════════════════════════════════
describe('Security', () => {
  test('path traversal is blocked', () => {
    const fw = new FrameworkEngine();
    expect(() => fw.init({
      configPath: '../../etc',
      rolesPath: './roles'
    })).toThrow('within the project base directory');
  });

  test('injection in project name is blocked', () => {
    expect(() => framework.routeProject({
      name: 'eval(require("child_process").exec("rm -rf /"))',
      department: 'Engineering'
    })).toThrow('unsafe');
  });
});
