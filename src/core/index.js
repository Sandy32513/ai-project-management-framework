const fs = require('fs');
const path = require('path');

// TASK-033: Environment variable support
const ENV = {
  FRAMEWORK_MODE: process.env.FRAMEWORK_MODE || 'autonomous',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  AUTO_ESCALATION: process.env.AUTO_ESCALATION !== 'false',
  CEO_FINAL_REPORT: process.env.CEO_FINAL_REPORT !== 'false',
};

// TASK-033: Log level filtering
const LOG_LEVELS = { debug: 0, info: 1, warning: 2, warn: 2, error: 3 };
function shouldLog(msgLevel) {
  return (LOG_LEVELS[msgLevel] || 0) >= (LOG_LEVELS[ENV.LOG_LEVEL] || 0);
}

// TASK-016: Input validation utility
class InputValidator {
  static validateString(value, fieldName, maxLength = 500) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') throw new Error(`${fieldName} must be a string`);
    const sanitized = value.trim();
    if (sanitized.length > maxLength) throw new Error(`${fieldName} exceeds max length of ${maxLength}`);
    // TASK-017: Basic injection pattern detection
    const dangerous = /(<script|javascript:|on\w+=|\{\{|__|\$\{|eval\(|require\()/i;
    if (dangerous.test(sanitized)) throw new Error(`${fieldName} contains potentially unsafe content`);
    return sanitized;
  }

  static validateObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${fieldName} must be a non-null object`);
    }
    return value;
  }

  static validateNumber(value, fieldName, min = -Infinity, max = Infinity) {
    if (value === null || value === undefined) return 0;
    const num = Number(value);
    if (isNaN(num)) throw new Error(`${fieldName} must be a number`);
    if (num < min || num > max) throw new Error(`${fieldName} must be between ${min} and ${max}`);
    return num;
  }

  static sanitizeProject(project) {
    InputValidator.validateObject(project, 'project');
    return {
      name: InputValidator.validateString(project.name, 'project.name'),
      id: project.id ? InputValidator.validateString(String(project.id), 'project.id') : undefined,
      department: InputValidator.validateString(project.department, 'project.department'),
      required_skills: Array.isArray(project.required_skills) ? project.required_skills.map(s => InputValidator.validateString(s, 'skill')) : [],
      priority: InputValidator.validateString(project.priority, 'project.priority'),
      budget: project.budget ? InputValidator.validateNumber(project.budget, 'project.budget', 0) : undefined,
    };
  }

  static sanitizeTicket(ticket) {
    InputValidator.validateObject(ticket, 'ticket');
    return {
      type: InputValidator.validateString(ticket.type, 'ticket.type'),
      priority: InputValidator.validateString(ticket.priority, 'ticket.priority'),
      department: ticket.department ? InputValidator.validateString(ticket.department, 'ticket.department') : undefined,
    };
  }

  static sanitizeTask(task) {
    InputValidator.validateObject(task, 'task');
    return {
      currentLevel: task.currentLevel ? InputValidator.validateString(task.currentLevel, 'task.currentLevel') : undefined,
      assignedTo: task.assignedTo ? InputValidator.validateString(task.assignedTo, 'task.assignedTo') : undefined,
      department: task.department ? InputValidator.validateString(task.department, 'task.department') : undefined,
    };
  }
}

class FrameworkEngine {
  constructor() {
    this.config = {};
    this.roles = {};
    this.hierarchy = {};
    this.modules = {};
    this.initialized = false;
    this.env = { ...ENV };
    this.logger = {
      debug: (msg) => shouldLog('debug') && console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`),
      info: (msg) => shouldLog('info') && console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
      error: (msg, err) => shouldLog('error') && console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err || ''),
      warn: (msg) => shouldLog('warn') && console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`)
    };
  }

  init(options = {}) {
    const basePath = options.basePath || path.join(__dirname, '..', '..');
    const configPath = options.configPath ? path.isAbsolute(options.configPath) ? options.configPath : path.join(basePath, options.configPath) : path.join(basePath, 'config');
    const rolesPath = options.rolesPath ? path.isAbsolute(options.rolesPath) ? options.rolesPath : path.join(basePath, options.rolesPath) : path.join(basePath, 'roles');
    
    // Sanitize paths — prevent path traversal (TASK-018)
    const resolvedConfig = path.resolve(configPath);
    const resolvedRoles = path.resolve(rolesPath);
    const resolvedBase = path.resolve(basePath);
    if (!resolvedConfig.startsWith(resolvedBase) || !resolvedRoles.startsWith(resolvedBase)) {
      throw new Error('Config and roles paths must be within the project base directory');
    }
    
    try {
      this.config = this.loadConfig(resolvedConfig, resolvedBase);
      this.roles = this.loadRoles(resolvedRoles);
      this.hierarchy = this.config.hierarchy || {};
      
      this.logger.info(`Loaded ${Object.keys(this.roles).length} roles from ${resolvedRoles}`);
      
      // FIX TASK-001: Load decision levels from core/skills/decision.json or fall back to modules.decision
      const decisionConfig = this.config._decisionLevels || this.config.modules?.decision || {};
      
      this.modules = {
        routing: new RoutingEngine(this.roles, this.hierarchy, this.logger),
        escalation: new EscalationEngine(this.config.escalation, this.hierarchy, this.logger),
        decision: new DecisionEngine(decisionConfig, this.logger),
        resources: new ResourceAllocationEngine(this.config.modules?.resource_allocation || {}, this.logger),
        audit: new AuditEngine(this.config.audit || {}, this.logger),
        validation: new ValidationEngine(this.roles, this.hierarchy, this.logger)
      };
      
      this.initialized = true;
      this.logger.info('Framework initialized successfully');
      return this;
    } catch (error) {
      this.logger.error('Failed to initialize framework', error);
      throw new Error(`Framework initialization failed: ${error.message}`);
    }
  }

  loadConfig(configPath, basePath) {
    const config = {};
    const files = ['core.json', 'hierarchy.json'];
    
    files.forEach(file => {
      const filePath = path.join(configPath, file);
      if (fs.existsSync(filePath)) {
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          Object.assign(config, data);
        } catch (error) {
          throw new Error(`Failed to parse config file ${file}: ${error.message}`);
        }
      }
    });
    
    // FIX TASK-001: Also load decision levels from core/skills/decision.json
    const decisionPath = path.join(basePath, 'core', 'skills', 'decision.json');
    if (fs.existsSync(decisionPath)) {
      try {
        const decisionData = JSON.parse(fs.readFileSync(decisionPath, 'utf8'));
        config._decisionLevels = { levels: decisionData.decision_levels || [] };
        this.logger.info(`Loaded decision levels from ${decisionPath}`);
      } catch (error) {
        this.logger.warn(`Failed to load decision config: ${error.message}`);
      }
    }
    
    return config;
  }

  loadRoles(rolesPath) {
    const roles = {};
    const departments = ['engineering', 'executive', 'qa', 'devops', 'security', 'product', 'design', 'data', 'sales', 'it_support'];
    
    departments.forEach(dept => {
      const deptPath = path.join(rolesPath, dept);
      if (fs.existsSync(deptPath)) {
        const files = fs.readdirSync(deptPath);
        files.forEach(file => {
          if (file.endsWith('.json')) {
            const rolePath = path.join(deptPath, file);
            try {
              const roleData = JSON.parse(fs.readFileSync(rolePath, 'utf8'));
              roles[roleData.role] = roleData;
            } catch (error) {
              console.warn(`Warning: Failed to parse role file ${file}: ${error.message}`);
            }
          }
        });
      }
    });
    
    return roles;
  }

  // TASK-016: Public API methods now validate and sanitize inputs
  routeProject(project) {
    if (!this.initialized) throw new Error('Framework not initialized');
    const sanitized = InputValidator.sanitizeProject(project);
    return this.modules.routing.routeProject(sanitized, this.roles);
  }

  routeTicket(ticket) {
    if (!this.initialized) throw new Error('Framework not initialized');
    const sanitized = InputValidator.sanitizeTicket(ticket);
    return this.modules.routing.routeTicket(sanitized, this.roles);
  }

  escalate(task, reason) {
    if (!this.initialized) throw new Error('Framework not initialized');
    const sanitized = InputValidator.sanitizeTask(task);
    const sanitizedReason = InputValidator.validateString(reason, 'reason', 1000);
    return this.modules.escalation.escalate(sanitized, sanitizedReason, this.roles);
  }

  getEscalationPath(department) {
    if (!this.initialized) throw new Error('Framework not initialized');
    const sanitized = InputValidator.validateString(department, 'department');
    return this.modules.escalation.getPath(sanitized);
  }

  makeDecision(decisionType, context) {
    if (!this.initialized) throw new Error('Framework not initialized');
    InputValidator.validateString(decisionType, 'decisionType');
    InputValidator.validateObject(context, 'context');
    return this.modules.decision.makeDecision(decisionType, context, this.roles);
  }

  getAuthorityLevel(role) {
    if (!this.initialized) throw new Error('Framework not initialized');
    InputValidator.validateString(role, 'role');
    return this.modules.decision.getAuthorityLevel(role, this.roles);
  }

  allocate(project, resources) {
    if (!this.initialized) throw new Error('Framework not initialized');
    InputValidator.validateObject(project, 'project');
    InputValidator.validateObject(resources, 'resources');
    return this.modules.resources.allocate(project, resources);
  }

  deallocate(projectId) {
    if (!this.initialized) throw new Error('Framework not initialized');
    InputValidator.validateString(projectId, 'projectId');
    return this.modules.resources.deallocate(projectId);
  }

  rebalance() {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.resources.rebalance();
  }

  validate() {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.validation.validate(this.config, this.roles);
  }

  generateReport(reportType, period) {
    if (!this.initialized) throw new Error('Framework not initialized');
    InputValidator.validateString(reportType, 'reportType');
    return this.modules.audit.generateReport(reportType, period);
  }

  sendToCEO(report, priority = 'normal') {
    if (!this.initialized) throw new Error('Framework not initialized');
    InputValidator.validateObject(report, 'report');
    return this.modules.audit.sendToCEO(report, priority);
  }

  // TASK-029: Health check endpoint
  healthCheck() {
    return {
      status: this.initialized ? 'healthy' : 'uninitialized',
      mode: this.env.FRAMEWORK_MODE,
      rolesLoaded: Object.keys(this.roles).length,
      modulesActive: Object.keys(this.modules).length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
}

class RoutingEngine {
  constructor(roles, hierarchy, logger) {
    this.roles = roles;
    this.hierarchy = hierarchy;
    this.logger = logger;
  }

  routeProject(project, roles) {
    if (!project || typeof project !== 'object') {
      this.logger?.warn('Invalid project object provided to routeProject');
      return { assigned: null, reason: 'Invalid project object' };
    }
    
    const { department, required_skills, priority } = project;
    const rolesArray = Object.values(roles);
    
    if (rolesArray.length === 0) {
      this.logger?.warn('No roles loaded for routing');
      return { assigned: null, reason: 'No roles available' };
    }
    
    const candidates = rolesArray.filter(role => {
      if (department && role.department) {
        if (role.department.toLowerCase() !== department.toLowerCase()) {
          return false;
        }
      } else if (department) {
        return false;
      }
      
      if (required_skills && required_skills.length > 0 && role.skills?.technical) {
        const hasSkill = required_skills.some(skill => 
          role.skills.technical.includes(skill.toLowerCase())
        );
        if (!hasSkill) return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      this.logger?.info(`No exact match, finding any available role in ${department || 'all departments'}`);
      const fallbackCandidates = rolesArray.filter(role => {
        if (role.level && (role.level === 'C-Suite' || role.level === 'Leadership')) {
          if (department) {
            return role.department?.toLowerCase() === department.toLowerCase();
          }
          return true;
        }
        return false;
      });
      
      if (fallbackCandidates.length > 0) {
        const selected = fallbackCandidates[0];
        this.logger?.info(`Project routed via fallback to ${selected.role}`);
        return {
          assigned: selected.role,
          department: selected.department,
          reason: 'Routed to leadership role as no skill match found'
        };
      }
      
      if (rolesArray.length > 0) {
        const anyRole = rolesArray[0];
        this.logger?.info(`Project routed to any available role: ${anyRole.role}`);
        return {
          assigned: anyRole.role,
          department: anyRole.department,
          reason: 'No specific match found, routed to available role'
        };
      }
      
      return { assigned: null, reason: 'No matching role found' };
    }

    // FIX TASK-004: Sort ascending — route to the LOWEST sufficient authority, not highest
    const sorted = candidates.sort((a, b) => {
      const priorityOrder = { 'C-Suite': 6, 'Leadership': 5, 'Technical': 4, 'Development': 3, 'Entry': 1 };
      return (priorityOrder[a.level] || 0) - (priorityOrder[b.level] || 0);
    });

    this.logger?.info(`Project routed to ${sorted[0].role}`);
    return {
      assigned: sorted[0].role,
      department: sorted[0].department,
      reason: 'Best match based on skills and authority level'
    };
  }

  routeTicket(ticket, roles) {
    if (!ticket || typeof ticket !== 'object') {
      this.logger?.warn('Invalid ticket object provided to routeTicket');
      return { assigned: 'Manager', type: 'unknown', sla: '24h' };
    }
    
    const { type, priority, department } = ticket;
    const rolesArray = Object.values(roles);
    
    let targetRole = null;
    let targetRoleName = null;
    
    if (type === 'security' || type === 'incident') {
      targetRole = rolesArray.find(r => r.role === 'CISO') || rolesArray.find(r => r.level === 'C-Suite' && r.department === 'Security');
      targetRoleName = 'CISO';
    } else if (type === 'technical') {
      targetRole = rolesArray.find(r => r.role === 'Tech Lead') || rolesArray.find(r => r.authority === 'technical');
      targetRoleName = 'Tech Lead';
    } else if (type === 'billing' || type === 'financial') {
      targetRole = rolesArray.find(r => r.role === 'CFO') || rolesArray.find(r => r.level === 'C-Suite');
      targetRoleName = 'CFO';
    } else {
      targetRole = rolesArray.find(r => r.role === 'Manager' || r.role === 'Engineering Manager');
      targetRoleName = targetRole?.role || 'Manager';
    }
    
    if (!targetRole && rolesArray.length > 0) {
      targetRole = rolesArray[0];
      targetRoleName = targetRole.role;
    }
    
    this.logger?.info(`Ticket type '${type}' routed to ${targetRoleName}`);
    return {
      assigned: targetRoleName,
      type: type,
      sla: this.getSLA(priority)
    };
  }

  getSLA(priority) {
    const slaMap = {
      'critical': '15m',
      'high': '1h',
      'medium': '4h',
      'low': '24h'
    };
    return slaMap[priority] || '24h';
  }
}

class EscalationEngine {
  constructor(escalationConfig, hierarchy, logger) {
    this.config = escalationConfig;
    this.hierarchy = hierarchy;
    this.logger = logger;
    this.escalationHistory = [];
    // TASK-034: Rate limiting state — max escalations per role per window
    this._rateLimitWindow = 60 * 60 * 1000; // 1 hour
    this._maxEscalationsPerRole = 10;
  }

  // TASK-034: Rate limiting check
  _isRateLimited(roleKey) {
    const now = Date.now();
    const windowStart = now - this._rateLimitWindow;
    const recentCount = this.escalationHistory.filter(
      e => e.from === roleKey && new Date(e.timestamp).getTime() > windowStart
    ).length;
    return recentCount >= this._maxEscalationsPerRole;
  }

  escalate(task, reason, roles) {
    if (!task || typeof task !== 'object') {
      this.logger?.warn('Invalid task object provided to escalate');
      return { escalated: false, reason: 'Invalid task object' };
    }
    
    const currentLevel = task.currentLevel || task.assignedTo;
    const department = task.department || 'engineering';
    
    if (!currentLevel) {
      this.logger?.warn('No currentLevel or assignedTo provided in task');
      return { escalated: false, reason: 'No current level specified' };
    }

    // TASK-034: Check rate limit before escalating
    if (this._isRateLimited(currentLevel)) {
      this.logger?.warn(`Escalation rate limit reached for ${currentLevel} — max ${this._maxEscalationsPerRole}/hour`);
      return { escalated: false, reason: `Rate limit exceeded for ${currentLevel}`, rateLimited: true };
    }
    
    const escalationPath = this.getPath(department);
    const currentIndex = escalationPath.findIndex(r => r === currentLevel);
    
    if (currentIndex === -1 || currentIndex >= escalationPath.length - 1) {
      // TASK-035: Fallback chain — try cross-department escalation
      const fallbackTarget = this._getFallbackTarget(currentLevel, department);
      if (fallbackTarget) {
        const escalation = {
          escalated: true,
          from: currentLevel,
          to: fallbackTarget,
          reason: reason,
          department: department,
          fallback: true,
          timestamp: new Date().toISOString()
        };
        this.escalationHistory.push(escalation);
        this.logger?.info(`Escalated via fallback from ${currentLevel} to ${fallbackTarget}`);
        return escalation;
      }
      this.logger?.info(`Cannot escalate - already at highest level: ${currentLevel}`);
      return { escalated: false, reason: 'Already at highest level or level not found' };
    }

    const nextLevel = escalationPath[currentIndex + 1];
    const escalation = {
      escalated: true,
      from: currentLevel,
      to: nextLevel,
      reason: reason,
      department: department,
      timestamp: new Date().toISOString()
    };
    
    this.escalationHistory.push(escalation);
    this.logger?.info(`Escalated from ${currentLevel} to ${nextLevel}`);
    
    return escalation;
  }

  // TASK-035: Fallback escalation targets when primary path is exhausted
  _getFallbackTarget(currentLevel, department) {
    const fallbackChain = {
      'CISO': 'CTO',        // Security falls back to CTO
      'CTO': 'CEO',         // Tech falls back to CEO
      'CFO': 'CEO',         // Finance falls back to CEO
      'COO': 'CEO',         // Operations falls back to CEO
      'CIO': 'CTO',         // IT falls back to CTO
      'CCO': 'CEO',         // Commercial falls back to CEO
      'VP Engineering': 'CTO',
      'VP DevOps': 'CTO',
      'VP Product': 'CEO',
      'VP Sales': 'CCO',
    };
    return fallbackChain[currentLevel] || null;
  }

  getPath(department) {
    const paths = {
      'engineering': ['Junior Developer', 'Software Engineer', 'Senior Developer', 'Tech Lead', 'Engineering Manager', 'Director Engineering', 'VP Engineering', 'CTO'],
      'product': ['PM Intern', 'Associate PM', 'Product Manager', 'Product Director', 'VP Product', 'CEO'],
      'design': ['Design Intern', 'Visual Designer', 'UI/UX Designer', 'UX Lead', 'UX Manager', 'Design Director', 'VP Product', 'CEO'],
      'qa': ['QA Intern', 'QA Engineer', 'Senior QA Engineer', 'QA Lead', 'QA Director', 'VP Engineering', 'CTO'],
      'devops': ['DevOps Intern', 'DevOps Engineer', 'Senior DevOps Engineer', 'DevOps Lead', 'DevOps Manager', 'VP DevOps', 'CTO'],
      'security': ['Security Intern', 'SOC Analyst', 'Security Engineer', 'Security Architect', 'Security Director', 'CISO', 'CEO'],
      'data': ['Data Intern', 'Data Analyst', 'Data Scientist', 'Data Architect', 'Head of Data', 'CTO', 'CEO'],
      'sales': ['Business Analyst', 'Account Executive', 'Sales Manager', 'VP Sales', 'CEO'],
      'it_support': ['IT Intern', 'Helpdesk Technician', 'IT Support Engineer', 'System Admin', 'IT Manager', 'CIO', 'CEO']
    };
    
    return paths[department?.toLowerCase()] || paths['engineering'];
  }
  
  getHistory() {
    return this.escalationHistory;
  }
}

class DecisionEngine {
  constructor(decisionConfig, logger) {
    this.levels = decisionConfig.levels || decisionConfig.decision_levels || [];
    this.logger = logger;
    this.decisionHistory = [];
  }

  makeDecision(decisionType, context, roles) {
    if (!context || typeof context !== 'object') {
      this.logger?.warn('Invalid context provided to makeDecision');
      return { decision: 'rejected', reason: 'Invalid context' };
    }
    
    const { budget = 0, impact = 'low', requestedBy } = context;
    
    let authorityLevel = 1;
    if (budget > 500000 || impact === 'critical') authorityLevel = 6;
    else if (budget > 50000 || impact === 'high') authorityLevel = 5;
    else if (budget > 10000 || impact === 'medium_high') authorityLevel = 4;
    else if (budget > 1000 || impact === 'medium') authorityLevel = 3;
    else if (budget > 0 || impact === 'low') authorityLevel = 2;

    const levelConfig = this.levels.find(l => l.level === authorityLevel);
    
    // FIX TASK-008: Check if the requester has sufficient authority to approve
    let requiresEscalation = false;
    let decisionOutcome = 'approved';
    if (requestedBy && roles) {
      const requesterRole = Object.values(roles).find(
        r => r.role === requestedBy || r.role?.toLowerCase() === requestedBy?.toLowerCase()
      );
      if (requesterRole) {
        const levelMap = { 'C-Suite': 6, 'Leadership': 5, 'Senior Leadership': 5, 'Engineering Leadership': 4, 'Management': 4, 'Technical': 3, 'Development': 2, 'Execution': 2, 'Individual Contributor': 1, 'Entry': 1 };
        const requesterAuthority = levelMap[requesterRole.level] || 1;
        if (authorityLevel > requesterAuthority) {
          requiresEscalation = true;
          decisionOutcome = 'pending_escalation';
          this.logger?.warn(`Decision requires escalation: requester ${requestedBy} (level ${requesterAuthority}) < required level ${authorityLevel}`);
        }
      }
    }
    
    // Reject if budget exceeds the level's budget limit
    if (levelConfig?.budget_limit !== null && levelConfig?.budget_limit !== undefined && budget > levelConfig.budget_limit) {
      requiresEscalation = true;
      decisionOutcome = 'pending_escalation';
      this.logger?.warn(`Budget $${budget} exceeds limit $${levelConfig.budget_limit} for level ${authorityLevel}`);
    }
    
    const decision = {
      decision: decisionOutcome,
      decisionType: decisionType,
      level: authorityLevel,
      authority: levelConfig?.authority || 'routine',
      budgetLimit: levelConfig?.budget_limit,
      requiresEscalation: requiresEscalation,
      requestedBy: requestedBy,
      budget: budget,
      impact: impact,
      timestamp: new Date().toISOString()
    };
    
    this.decisionHistory.push(decision);
    this.logger?.info(`Decision made: ${decisionType} - Level ${authorityLevel} - Outcome: ${decisionOutcome}`);
    
    return decision;
  }

  getAuthorityLevel(role, roles) {
    if (!role) return null;
    
    const roleData = Object.values(roles).find(r => r.role === role || r.role?.toLowerCase() === role.toLowerCase());
    if (!roleData) {
      for (const levelConfig of this.levels) {
        if (levelConfig.handlers?.includes(role)) {
          return {
            role: role,
            level: levelConfig.level,
            authority: levelConfig.authority,
            budgetLimit: levelConfig.budget_limit
          };
        }
      }
      return null;
    }
    
    const level = this.levels.find(l => 
      l.handlers?.includes(role)
    );
    
    return {
      role: role,
      level: level?.level || (roleData.level === 'C-Suite' ? 6 : roleData.level === 'Leadership' ? 5 : roleData.level === 'Technical' ? 3 : 1),
      authority: level?.authority || roleData.authority || 'standard',
      budgetLimit: level?.budget_limit || roleData.budget_limit || 1000
    };
  }
  
  getHistory() {
    return this.decisionHistory;
  }
}

class ResourceAllocationEngine {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.allocations = [];
    this.resourceCapacity = {};
    this.maxConcurrentTasks = config?.max_concurrent_tasks || 5;
  }

  allocate(project, resources) {
    if (!project || typeof project !== 'object') {
      this.logger?.warn('Invalid project provided to allocate');
      return null;
    }
    
    const projectId = project.id || project.name;
    const currentLoad = this.getResourceLoad(projectId);
    
    // FIX TASK-009: Enforce capacity limits — reject allocation when at max
    if (currentLoad >= this.maxConcurrentTasks) {
      this.logger?.warn(`Project ${projectId} at max capacity (${this.maxConcurrentTasks}) — allocation REJECTED`);
      return {
        projectId: projectId,
        resources: resources,
        timestamp: new Date().toISOString(),
        status: 'rejected',
        reason: `Max concurrent tasks (${this.maxConcurrentTasks}) exceeded`,
        load: currentLoad
      };
    }
    
    const allocation = {
      projectId: projectId,
      resources: resources,
      timestamp: new Date().toISOString(),
      status: 'allocated',
      load: currentLoad + 1
    };
    
    this.allocations.push(allocation);
    this.logger?.info(`Resources allocated to project: ${projectId}`);
    return allocation;
  }

  // FIX TASK-011: Add resource deallocation
  deallocate(projectId) {
    const before = this.allocations.length;
    this.allocations = this.allocations.filter(a => a.projectId !== projectId);
    const released = before - this.allocations.length;
    this.logger?.info(`Released ${released} allocation(s) for project: ${projectId}`);
    return { projectId, released, timestamp: new Date().toISOString() };
  }

  getResourceLoad(projectId) {
    return this.allocations.filter(a => a.projectId === projectId).length;
  }

  checkCapacity(resourceType, threshold = 90) {
    const totalAllocations = this.allocations.length;
    if (totalAllocations === 0) return { atCapacity: false, percentage: 0 };
    
    const percentage = (totalAllocations / this.maxConcurrentTasks) * 100;
    return {
      atCapacity: percentage >= threshold,
      percentage: Math.round(percentage),
      threshold: threshold
    };
  }

  rebalance() {
    this.logger?.info('Rebalancing resources across projects');
    return {
      rebalanced: true,
      timestamp: new Date().toISOString(),
      allocations: this.allocations,
      capacity: this.checkCapacity()
    };
  }
}

class AuditEngine {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.logs = [];
    this.reports = [];
  }

  generateReport(reportType, period) {
    if (!reportType) {
      this.logger?.warn('No reportType provided to generateReport');
      reportType = 'daily_ticket';
    }
    
    const templates = {
      'quarterly_audit': { title: 'Quarterly Audit Report', sections: ['executive_summary', 'project_metrics', 'budget_analysis', 'risk_assessment'] },
      'monthly_executive': { title: 'Monthly Executive Summary', sections: ['kpi_report', 'project_portfolio', 'resource_utilization'] },
      'weekly_department': { title: 'Weekly Department Report', sections: ['sprint_summary', 'team_velocity', 'blockers'] },
      'daily_ticket': { title: 'Daily Ticket Summary', sections: ['open_tickets', 'resolved_tickets', 'sla_status'] }
    };

    const report = {
      type: reportType,
      period: period,
      template: templates[reportType] || templates['daily_ticket'],
      generatedAt: new Date().toISOString(),
      data: this.logs
    };
    
    this.reports.push(report);
    this.logger?.info(`Report generated: ${reportType}`);
    
    return report;
  }

  sendToCEO(report, priority) {
    if (!report) {
      this.logger?.warn('No report provided to sendToCEO');
      return { sent: false, reason: 'No report provided' };
    }
    
    this.logger?.info(`Report sent to CEO - Priority: ${priority}`);
    return {
      sent: true,
      to: 'CEO',
      report: report.type,
      priority: priority,
      timestamp: new Date().toISOString()
    };
  }

  log(event) {
    this.logs.push({
      ...event,
      timestamp: new Date().toISOString()
    });
  }
}

class ValidationEngine {
  constructor(roles, hierarchy, logger) {
    this.roles = roles;
    this.hierarchy = hierarchy;
    this.logger = logger;
    // FIX TASK-005: Build a lookup index for role names (case-insensitive, underscore-normalized)
    this._roleIndex = new Map();
    Object.values(roles).forEach(r => {
      if (r.role) {
        this._roleIndex.set(r.role.toLowerCase(), r);
        this._roleIndex.set(r.role.replace(/\s+/g, '_').toLowerCase(), r);
        this._roleIndex.set(r.role.replace(/_/g, ' ').toLowerCase(), r);
      }
    });
  }

  // FIX TASK-005: Improved normalization that handles both formats
  normalizeRoleName(name) {
    if (!name) return null;
    return name.replace(/_/g, ' ').replace(/\//g, '/').trim();
  }

  // FIX TASK-005: Lookup using the pre-built index
  findRoleByName(name) {
    if (!name) return null;
    // Direct lookup
    if (this.roles[name]) return this.roles[name];
    // Normalized lookup (underscores → spaces)
    const normalized = this.normalizeRoleName(name);
    if (this.roles[normalized]) return this.roles[normalized];
    // Case-insensitive index lookup
    const lower = name.toLowerCase();
    if (this._roleIndex.has(lower)) return this._roleIndex.get(lower);
    const normalizedLower = normalized.toLowerCase();
    if (this._roleIndex.has(normalizedLower)) return this._roleIndex.get(normalizedLower);
    return null;
  }

  validate(config, roles) {
    const issues = [];
    const validTopRoles = ['CEO', 'CTO', 'CFO', 'COO', 'CCO', 'CIO', 'CISO', 'C-Suite', 'Board'];
    
    Object.values(roles).forEach(role => {
      const reportsTo = role.reportsTo;
      if (!reportsTo) return; // CEO reports to nobody — valid
      
      // Handle composite references like 'Junior_Engineer/Mid_Level_Engineer'
      const targets = reportsTo.split('/');
      const anyResolved = targets.some(target => {
        const trimmed = target.trim();
        const normalized = this.normalizeRoleName(trimmed);
        return validTopRoles.includes(normalized) || this.findRoleByName(trimmed);
      });
      
      if (!anyResolved) {
        issues.push({
          type: 'orphaned_role',
          role: role.role,
          reportsTo: reportsTo,
          suggestedFix: this.suggestParentRole(role),
          severity: 'high'
        });
      }
    });

    return {
      valid: issues.length === 0,
      issueCount: issues.length,
      issues: issues,
      validatedAt: new Date().toISOString()
    };
  }

  // FIX TASK-003: Use Map to eliminate 11 duplicate keys from the old object literal
  suggestParentRole(role) {
    const suggestions = new Map([
      ['Backend Developer', 'Tech Lead'],
      ['Frontend Developer', 'Tech Lead'],
      ['Full Stack Developer', 'Tech Lead'],
      ['Mobile Developer', 'Tech Lead'],
      ['Junior Engineer', 'Team Lead'],
      ['Mid-Level Engineer', 'Senior Engineer'],
      ['Senior Engineer', 'Team Lead'],
      ['VP', 'CEO'],
      ['QA Lead', 'QA Director'],
      ['QA Engineer', 'Senior QA Engineer'],
      ['Senior QA Engineer', 'QA Lead'],
      ['QA Intern', 'QA Engineer'],
      ['Cloud Architect', 'VP DevOps'],
      ['DevOps Manager', 'VP DevOps'],
      ['DevOps Lead', 'DevOps Manager'],
      ['DevOps Engineer', 'Senior DevOps Engineer'],
      ['DevOps Intern', 'DevOps Engineer'],
      ['VP DevOps', 'CTO'],
      ['VP Engineering', 'CTO'],
      ['Product Director', 'VP Product'],
      ['Product Manager', 'Product Director'],
      ['Associate PM', 'Product Manager'],
      ['PM Intern', 'Associate PM'],
      ['VP Product', 'CEO'],
      ['Design Director', 'VP Product'],
      ['UX Manager', 'Design Director'],
      ['UX Lead', 'UX Manager'],
      ['UI/UX Designer', 'UX Lead'],
      ['Visual Designer', 'UX Lead'],
      ['Design Intern', 'Visual Designer'],
      ['Security Director', 'CISO'],
      ['Security Architect', 'Security Director'],
      ['Security Engineer', 'Security Architect'],
      ['SOC Analyst', 'Security Engineer'],
      ['Security Intern', 'SOC Analyst'],
      ['Data Analyst', 'Data Scientist'],
      ['Data Scientist', 'Data Architect'],
      ['Data Architect', 'Head of Data'],
      ['Data Intern', 'Data Analyst'],
      ['Account Executive', 'Sales Manager'],
      ['Business Analyst', 'Sales Manager'],
      ['Sales Manager', 'VP Sales'],
      ['Scrum Master', 'Engineering Manager'],
      ['Release Manager', 'VP Engineering'],
      ['SEO Specialist', 'Marketing Manager'],
      ['Helpdesk Technician', 'IT Support Engineer'],
      ['IT Intern', 'Helpdesk Technician'],
      ['IT Support Engineer', 'System Admin'],
      ['System Admin', 'IT Manager'],
      ['Junior Developer', 'Software Engineer'],
      ['Software Engineer', 'Senior Developer'],
      ['Senior Developer', 'Tech Lead'],
      ['Intern', 'Junior Developer'],
      ['Manager', 'Director'],
      ['Director', 'VP'],
    ]);
    return suggestions.get(role.role) || null;
  }
}

// FIX TASK-020: Export class for proper instantiation and testability
// Backward-compatible: also export a default instance
const defaultInstance = new FrameworkEngine();
module.exports = defaultInstance;
module.exports.FrameworkEngine = FrameworkEngine;
module.exports.InputValidator = InputValidator;