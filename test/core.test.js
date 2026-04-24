/**
 * Core tests for AI Project Management Framework
 * Aim: Verify critical bug fixes and core functionality
 */
const FrameworkEngine = require('../src/core');

describe('Framework Initialization', () => {
  let framework;
beforeEach(() => {
  framework = new FrameworkEngine();
  framework.init({
    configPath: './config',
    rolesPath: './roles',
    rbac: false // disable RBAC for unit tests
  });
});

  test('should load all 6 config files', () => {
    framework.init({
      configPath: './config',
      rolesPath: './roles',
      rbac: false
    });
    const cfg = framework.config;
    // Core config from config directory
    expect(cfg).toHaveProperty('framework');
    expect(cfg).toHaveProperty('hierarchy');
    // Additional configs loaded from core/* subdirectories
    expect(cfg).toHaveProperty('_decisionConfig');
    expect(cfg).toHaveProperty('_routingConfig');
    expect(cfg).toHaveProperty('_escalationConfig');
    expect(cfg).toHaveProperty('_resourceConfig');
    expect(cfg).toHaveProperty('_auditConfig');
  });

  test('should load roles without duplicates', () => {
    framework.init({ rbac: false });
    const roles = framework.roles;
    const roleNames = Object.keys(roles);
    // Ensure no duplicate role names
    const unique = new Set(roleNames);
    expect(unique.size).toBe(roleNames.length);
    // Expect known roles
    expect(roleNames).toContain('CISO');
    expect(roleNames).toContain('Frontend Developer');
  });
});

describe('RoutingEngine — Skill Matching', () => {
  let framework;
  beforeEach(() => {
    framework = new FrameworkEngine();
    framework.init({ rbac: false });
  });

  test('should route engineering project with JavaScript to a developer role', () => {
    const result = framework.routeProject({
      name: 'Web Feature',
      department: 'Engineering',
      required_skills: ['JavaScript'],
      priority: 'high'
    });
    // Should match a role that has JavaScript in technologies or task_handling
    expect(result.assigned).toBeTruthy();
    expect(['Frontend Developer', 'Backend Developer', 'Full Stack Developer']).toContain(result.assigned);
    expect(result.department).toBe('Engineering');
  });

  test('should route security ticket to CISO', () => {
    const result = framework.routeTicket({
      type: 'security',
      priority: 'critical'
    });
    expect(result.assigned).toBe('CISO');
    expect(result.sla).toBe('15m');
  });

  test('should sort candidates by priority — lowest sufficient authority first', () => {
    // The skill test above should select Frontend Developer (Development level 3) rather than Director level
    // This is indirectly tested via the fact that Frontend Developer is returned, not Director.
    const result = framework.routeProject({
      name: 'Test',
      department: 'Engineering',
      required_skills: ['javascript']
    });
    // Frontend Developer is Development level (3) — good
    expect(result.assigned).toBe('Frontend Developer');
  });
});

describe('DecisionEngine — Authority Levels', () => {
  let framework;
  beforeEach(() => {
    framework = new FrameworkEngine();
    framework.init({ rbac: false });
  });

  test('should return correct level for Tech Lead', () => {
    const level = framework.getAuthorityLevel('Tech Lead');
    expect(level.level).toBe(3);
    expect(level.authority).toBe('complex');
    expect(level.budgetLimit).toBe(10000);
  });

  test('should return level 6 for CEO', () => {
    const level = framework.getAuthorityLevel('CEO');
    expect(level.level).toBe(6);
    expect(level.authority).toBe('company_wide');
  });

  test('should return level 2 for Mid-Level Engineer via decision_levels mapping', () => {
    const level = framework.getAuthorityLevel('Mid-Level Engineer');
    expect(level.level).toBe(2);
  });

  test('makeDecision should require escalation when requestedBy lacks authority', () => {
    const decision = framework.makeDecision('budget_approval', {
      budget: 50000,
      impact: 'high',
      requestedBy: 'Engineering Manager' // level 4, but requires level 5 for high impact >50k
    });
    expect(decision.requiresEscalation).toBe(true);
    expect(decision.decision).toBe('pending_escalation');
    expect(decision.level).toBe(5);
  });

  test('makeDecision should approve when caller has sufficient authority (RBAC disabled => callerLevel max)', () => {
    // With RBAC disabled, caller treated as max level, decision approved if requester authority suffices
    const decision = framework.makeDecision('budget_approval', {
      budget: 500,
      impact: 'low',
      requestedBy: 'Engineering Manager'
    });
    expect(decision.decision).toBe('approved');
  });
});

describe('EscalationEngine', () => {
  let framework;
  beforeEach(() => {
    framework = new FrameworkEngine();
    framework.init({ rbac: false });
  });

  test('should escalate Software Engineer to Senior Developer', () => {
    const result = framework.escalate({
      assignedTo: 'Software Engineer',
      department: 'engineering'
    }, 'Timeout');
    expect(result.escalated).toBe(true);
    expect(result.to).toBe('Senior Developer');
  });

  test('should return correct engineering escalation path', () => {
    const path = framework.getEscalationPath('engineering');
    expect(path).toEqual([
      'Junior Developer',
      'Software Engineer',
      'Senior Developer',
      'Tech Lead',
      'Engineering Manager',
      'Director Engineering',
      'VP Engineering',
      'CTO'
    ]);
  });
});

describe('ResourceAllocationEngine', () => {
  let framework;
  beforeEach(() => {
    framework = new FrameworkEngine();
    framework.init({ rbac: false });
  });

  test('should allocate resources to a project', () => {
    const allocation = framework.allocate(
      { id: 'proj-123', name: 'Test Project' },
      { developers: 2 }
    );
    expect(allocation.status).toBe('allocated');
    expect(allocation.projectId).toBe('proj-123');
  });

  test('should respect per-role limits from config', () => {
    framework.modules.resources.allocations = []; // reset
    const resourcesEngine = framework.modules.resources;
    // Verify per-role map loaded
    expect(resourcesEngine.maxConcurrentTasksMap).not.toBeNull();
    expect(resourcesEngine.maxConcurrentTasksMap).toHaveProperty('intern');
    expect(resourcesEngine.maxConcurrentTasksMap.intern).toBe(1);
    const badAlloc = framework.allocate(
      { id: 'proj-X' },
      { intern: 2 }
    );
    // Since we have no other allocations, allocating 2 interns when limit is 1 should be rejected
    expect(badAlloc.status).toBe('rejected');
    expect(badAlloc.reason).toMatch(/capacity exceeded/i);
  });

  test('should deallocate project resources', () => {
    const alloc = framework.allocate({ id: 'proj-dealloc' }, { developers: 1 });
    expect(alloc.status).toBe('allocated');
    const dealloc = framework.deallocate('proj-dealloc');
    expect(dealloc.released).toBeGreaterThan(0);
  });
});

describe('AuditEngine', () => {
  let framework;
  beforeEach(() => {
    framework = new FrameworkEngine();
    framework.init({ rbac: false });
  });

  test('should record audit events on project routing', () => {
    // Clear logs
    framework.modules.audit.logs = [];
    framework.routeProject({
      name: 'Test',
      department: 'Engineering',
      required_skills: ['javascript']
    });
    const logs = framework.modules.audit.logs;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[logs.length - 1].event).toBe('project_routed');
  });

  test('should generate report containing logs', () => {
    framework.routeProject({ name: 'Test', department: 'Engineering', required_skills: ['javascript'] });
    const report = framework.generateReport('daily_ticket', 'today');
    expect(report.data).toBeInstanceOf(Array);
    expect(report.data.length).toBeGreaterThan(0);
  });
});

describe('RBAC Enforcement', () => {
  test('should throw when caller missing and RBAC enabled', () => {
    const fw = new FrameworkEngine();
    // init with RBAC enabled (default) and no caller
    fw.init({
      configPath: './config',
      rolesPath: './roles'
      // no caller
    });
    expect(() => fw.allocate({ id: 'p1' }, {})).toThrow('Caller identity required');
    expect(() => fw.makeDecision('budget_approval', {})).toThrow('Caller identity required');
  });

  test('should allow allocation when caller has sufficient role', () => {
    const fw = new FrameworkEngine();
    fw.init({
      configPath: './config',
      rolesPath: './roles',
      caller: { role: 'Engineering Manager' } // level 4
    });
    // allocate requires level 4 => should succeed
    const result = fw.allocate({ id: 'p2' }, { developers: 1 });
    expect(result.status).toBe('allocated');
  });

  test('should reject allocation when caller lacks authority', () => {
    const fw = new FrameworkEngine();
    fw.init({
      configPath: './config',
      rolesPath: './roles',
      caller: { role: 'Intern' } // level 1, but allocate requires level 4
    });
    expect(() => fw.allocate({ id: 'p3' }, { developers: 1 }))
      .toThrow('Insufficient authority');
  });

  test('should reject makeDecision when caller level below required', () => {
    const fw = new FrameworkEngine();
    fw.init({
      configPath: './config',
      rolesPath: './roles',
      caller: { role: 'Senior Engineer' } // level approx 3
    });
    // high budget requires level 5
    const decision = fw.makeDecision('budget_approval', { budget: 500000, impact: 'critical' });
    expect(decision.requiresEscalation).toBe(true);
    expect(decision.decision).toBe('pending_escalation');
  });
});

describe('Input Validation & Security', () => {
  let framework;
  beforeEach(() => {
    framework = new FrameworkEngine();
    framework.init({ rbac: false });
  });

  test('should sanitize dangerous strings in project name', () => {
    expect(() => framework.routeProject({
      name: '<script>alert(1)</script>',
      department: 'Engineering',
      required_skills: []
    })).toThrow('contains potentially unsafe content');
  });

  test('should reject path traversal in init configPath', () => {
    const fw = new FrameworkEngine();
    expect(() => fw.init({
      configPath: '../../../../etc/passwd',
      rolesPath: './roles'
    })).toThrow('Path traversal blocked');
  });
});
