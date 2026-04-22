const fs = require('fs');
const path = require('path');

class FrameworkEngine {
  constructor() {
    this.config = {};
    this.roles = {};
    this.hierarchy = {};
    this.modules = {};
    this.initialized = false;
    this.logger = {
      info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
      error: (msg, err) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err),
      warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`)
    };
  }

  init(options = {}) {
    const basePath = options.basePath || path.join(__dirname, '..', '..');
    const configPath = options.configPath ? path.isAbsolute(options.configPath) ? options.configPath : path.join(basePath, options.configPath) : path.join(basePath, 'config');
    const rolesPath = options.rolesPath ? path.isAbsolute(options.rolesPath) ? options.rolesPath : path.join(basePath, options.rolesPath) : path.join(basePath, 'roles');
    
    try {
      this.config = this.loadConfig(configPath);
      this.roles = this.loadRoles(rolesPath);
      this.hierarchy = this.config.hierarchy || {};
      
      this.logger.info(`Loaded ${Object.keys(this.roles).length} roles from ${rolesPath}`);
      
      this.modules = {
        routing: new RoutingEngine(this.roles, this.hierarchy, this.logger),
        escalation: new EscalationEngine(this.config.escalation, this.hierarchy, this.logger),
        decision: new DecisionEngine(this.config.decision || {}, this.logger),
        resources: new ResourceAllocationEngine(this.config.resource_allocation || {}, this.logger),
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

  loadConfig(configPath) {
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

  routeProject(project) {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.routing.routeProject(project, this.roles);
  }

  routeTicket(ticket) {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.routing.routeTicket(ticket, this.roles);
  }

  escalate(task, reason) {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.escalation.escalate(task, reason, this.roles);
  }

  getEscalationPath(department) {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.escalation.getPath(department);
  }

  makeDecision(decisionType, context) {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.decision.makeDecision(decisionType, context, this.roles);
  }

  getAuthorityLevel(role) {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.decision.getAuthorityLevel(role, this.roles);
  }

  allocate(project, resources) {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.resources.allocate(project, resources);
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
    return this.modules.audit.generateReport(reportType, period);
  }

  sendToCEO(report, priority = 'normal') {
    if (!this.initialized) throw new Error('Framework not initialized');
    return this.modules.audit.sendToCEO(report, priority);
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

    const sorted = candidates.sort((a, b) => {
      const priorityOrder = { 'C-Suite': 6, 'Leadership': 5, 'Technical': 4, 'Development': 3, 'Entry': 1 };
      return (priorityOrder[b.level] || 0) - (priorityOrder[a.level] || 0);
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
    
    const path = this.getPath(department);
    const currentIndex = path.findIndex(r => r === currentLevel);
    
    if (currentIndex === -1 || currentIndex >= path.length - 1) {
      this.logger?.info(`Cannot escalate - already at highest level: ${currentLevel}`);
      return { escalated: false, reason: 'Already at highest level or level not found' };
    }

    const nextLevel = path[currentIndex + 1];
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
    this.levels = decisionConfig.levels || [];
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
    
    const decision = {
      decision: 'approved',
      decisionType: decisionType,
      level: authorityLevel,
      authority: levelConfig?.authority || 'routine',
      budgetLimit: levelConfig?.budget_limit,
      requiresEscalation: false,
      requestedBy: requestedBy,
      budget: budget,
      impact: impact,
      timestamp: new Date().toISOString()
    };
    
    this.decisionHistory.push(decision);
    this.logger?.info(`Decision made: ${decisionType} - Level ${authorityLevel}`);
    
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
    
    if (currentLoad >= this.maxConcurrentTasks) {
      this.logger?.warn(`Project ${projectId} at max capacity (${this.maxConcurrentTasks})`);
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
  }

  normalizeRoleName(name) {
    if (!name) return null;
    return name.replace(/_/g, ' ').trim();
  }

  findRoleByName(name) {
    if (!name) return null;
    const normalized = this.normalizeRoleName(name);
    return this.roles[normalized] || Object.values(this.roles).find(r => r.role === normalized);
  }

  validate(config, roles) {
    const issues = [];
    const validRoles = ['CEO', 'CTO', 'CFO', 'COO', 'CCO', 'CIO', 'CISO'];
    const excludedRoles = ['Intern', 'Junior Engineer', 'Mid-Level Engineer', 'VP', 'QA Lead', 'Cloud Architect', 'DevOps Manager', 'Product Director', 'Design Intern'];
    
    Object.values(roles).forEach(role => {
      if (excludedRoles.includes(role.role)) return;
      
      const reportsTo = role.reportsTo;
      if (!reportsTo) return;
      
      const normalizedReportsTo = this.normalizeRoleName(reportsTo);
      const targetRole = this.findRoleByName(reportsTo);
      
      if (!validRoles.includes(normalizedReportsTo) && !targetRole) {
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
      issues: issues,
      validatedAt: new Date().toISOString()
    };
  }

  suggestParentRole(role) {
    const suggestions = {
      'Backend Developer': 'Tech Lead',
      'Frontend Developer': 'Tech Lead',
      'Full Stack Developer': 'Tech Lead',
      'Mobile Developer': 'Tech Lead',
      'Junior Engineer': 'Team Lead',
      'Mid-Level Engineer': 'Senior Engineer',
      'Senior Engineer': 'Team Lead',
      'VP': 'CEO',
      'QA Lead': 'QA Director',
      'QA Engineer': 'Senior QA Engineer',
      'Senior QA Engineer': 'QA Lead',
      'Cloud Architect': 'VP DevOps',
      'DevOps Manager': 'VP DevOps',
      'DevOps Lead': 'DevOps Manager',
      'VP DevOps': 'CTO',
      'VP Engineering': 'CTO',
      'Product Director': 'VP Product',
      'Product Manager': 'Product Director',
      'VP Product': 'CEO',
      'Design Director': 'VP Product',
      'UX Manager': 'Design Director',
      'UX Lead': 'UX Manager',
      'UI/UX Designer': 'UX Lead',
      'Visual Designer': 'UX Lead',
      'Design Intern': 'Visual Designer',
      'Security Director': 'CISO',
      'Security Architect': 'Security Director',
      'Security Engineer': 'Security Architect',
      'QA Engineer': 'Senior QA Engineer',
      'QA Intern': 'QA Engineer',
      'QA Lead': 'QA Director',
      'Senior QA Engineer': 'QA Lead',
      'DevOps Engineer': 'Senior DevOps Engineer',
      'DevOps Intern': 'DevOps Engineer',
      'DevOps Lead': 'DevOps Manager',
      'Security Engineer': 'Security Architect',
      'SOC Analyst': 'Security Engineer',
      'Security Intern': 'SOC Analyst',
      'Product Manager': 'Product Director',
      'Associate PM': 'Product Manager',
      'PM Intern': 'Associate PM',
      'Visual Designer': 'UX Lead',
      'UI/UX Designer': 'UX Lead',
      'UX Lead': 'UX Manager',
      'UX Manager': 'Design Director',
      'Data Analyst': 'Data Scientist',
      'Data Scientist': 'Data Architect',
      'Data Architect': 'Head of Data',
      'Data Intern': 'Data Analyst',
      'Account Executive': 'Sales Manager',
      'Business Analyst': 'Sales Manager',
      'Sales Manager': 'VP Sales',
      'Scrum Master': 'Engineering Manager',
      'Release Manager': 'VP Engineering',
      'SEO Specialist': 'Marketing Manager',
      'Helpdesk Technician': 'IT Support Engineer',
      'IT Intern': 'Helpdesk Technician',
      'IT Support Engineer': 'System Admin',
      'System Admin': 'IT Manager',
      'Junior Developer': 'Software Engineer',
      'Software Engineer': 'Senior Developer',
      'Senior Developer': 'Tech Lead',
      'Intern': 'Junior Developer',
      'Manager': 'Director',
      'Director': 'VP',
      'VP': 'CEO'
    };
    return suggestions[role.role] || null;
  }
}

module.exports = new FrameworkEngine();