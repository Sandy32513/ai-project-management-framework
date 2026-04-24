'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const InputValidator = require('./input-validator');
const RoutingEngine = require('../engines/routing-engine');
const EscalationEngine = require('../engines/escalation-engine');
const DecisionEngine = require('../engines/decision-engine');
const ResourceAllocationEngine = require('../engines/resource-allocation-engine');
const AuditEngine = require('../engines/audit-engine');
const ValidationEngine = require('../engines/validation-engine');

// Environment flags
const ENV = {
  FRAMEWORK_MODE: process.env.FRAMEWORK_MODE || 'autonomous',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  AUTO_ESCALATION: process.env.AUTO_ESCALATION !== 'false',
  CEO_FINAL_REPORT: process.env.CEO_FINAL_REPORT !== 'false',
};

function shouldLog(msgLevel) {
  const LOG_LEVELS = { debug: 0, info: 1, warning: 2, warn: 2, error: 3 };
  return (LOG_LEVELS[msgLevel] || 0) >= (LOG_LEVELS[ENV.LOG_LEVEL] || 0);
}

class FrameworkEngine {
  constructor() {
    this.config = {};
    this.roles = {};
    this.hierarchy = {};
    this.modules = {};
    this.initialized = false;
    this.env = { ...ENV };
    this.caller = null;
    this.rbacEnabled = true;
    this.logger = {
      debug: (msg) => shouldLog('debug') && console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`),
      info: (msg) => shouldLog('info') && console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
      error: (msg, err) => shouldLog('error') && console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, err || ''),
      warn: (msg) => shouldLog('warn') && console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`)
    };
  }

  init(options = {}) {
    this.caller = options.caller || null;
    this.rbacEnabled = options.rbac !== false;

    const basePath = options.basePath || path.join(__dirname, '..', '..');
    const configPath = options.configPath ? path.isAbsolute(options.configPath) ? options.configPath : path.join(basePath, options.configPath) : path.join(basePath, 'config');
    const rolesPath = options.rolesPath ? path.isAbsolute(options.rolesPath) ? options.rolesPath : path.join(basePath, options.rolesPath) : path.join(basePath, 'roles');

    const resolvedConfig = path.resolve(configPath);
    const resolvedRoles = path.resolve(rolesPath);
    const resolvedBase = path.resolve(basePath);
    if (!resolvedConfig.startsWith(resolvedBase) || !resolvedRoles.startsWith(resolvedBase)) {
      throw new Error('Path traversal blocked: config and roles must be within base directory');
    }

    try {
      this.config = this.loadConfig(resolvedConfig, resolvedBase);
      this.roles = this.loadRoles(resolvedRoles);
      this.hierarchy = this.config.hierarchy || {};

      this.logger.info(`Loaded ${Object.keys(this.roles).length} roles from ${resolvedRoles}`);

      const decisionConfig = this.config._decisionConfig || this.config.modules?.decision || {};
      this.modules = {
        routing: new RoutingEngine(this.roles, this.hierarchy, this.logger),
        escalation: new EscalationEngine(this.config._escalationConfig || {}, this.hierarchy, this.logger),
        decision: new DecisionEngine(decisionConfig, this.logger),
        resources: new ResourceAllocationEngine(this.config._resourceConfig || {}, this.logger),
        audit: new AuditEngine(this.config._auditConfig || {}, this.logger),
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

  _verifyCaller(minLevel, operation) {
    if (!this.rbacEnabled) return;
    if (!this.caller) throw new Error(`Caller identity required for ${operation} (RBAC enabled)`);
    const callerInfo = this.modules.decision.getAuthorityLevel(this.caller.role, this.roles);
    const callerLevel = callerInfo?.level || 0;
    if (callerLevel < minLevel) {
      throw new Error(`Insufficient authority for ${operation}: ${this.caller.role} (level ${callerLevel}) < level ${minLevel} required`);
    }
  }

  _getCallerLevel() {
    if (!this.caller) return 0;
    const info = this.modules.decision.getAuthorityLevel(this.caller.role, this.roles);
    return info?.level || 0;
  }

  loadConfig(configPath, basePath) {
    const config = {};
    const configMap = [
      { file: path.join(configPath, 'core.json') },
      { file: path.join(configPath, 'hierarchy.json') },
      { file: path.join(basePath, 'core', 'skills', 'decision.json'), key: '_decisionConfig' },
      { file: path.join(basePath, 'core', 'routing', 'routing.json'), key: '_routingConfig' },
      { file: path.join(basePath, 'core', 'escalation', 'escalation.json'), key: '_escalationConfig' },
      { file: path.join(basePath, 'core', 'skills', 'resource_allocation.json'), key: '_resourceConfig' },
      { file: path.join(basePath, 'core', 'skills', 'audit.json'), key: '_auditConfig' },
    ];

    configMap.forEach(({ file, key }) => {
      if (fs.existsSync(file)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (key) {
            config[key] = data;
          } else {
            Object.assign(config, data);
          }
          this.logger.info(`Loaded config: ${path.basename(file)}`);
        } catch (e) {
          this.logger.warn(`Config parse failed: ${path.basename(file)} — ${e.message}`);
        }
      } else {
        this.logger.debug(`Config not found: ${path.basename(file)}`);
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
    this._verifyCaller(1, 'routeProject');
    const sanitized = InputValidator.sanitizeProject(project);
    const result = this.modules.routing.routeProject(sanitized, this.roles);
    this.modules.audit.log({
      event: 'project_routed',
      projectId: sanitized.id || sanitized.name,
      department: sanitized.department,
      requiredSkills: sanitized.required_skills,
      result: result
    });
    return result;
  }

  routeTicket(ticket) {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(1, 'routeTicket');
    const sanitized = InputValidator.sanitizeTicket(ticket);
    const result = this.modules.routing.routeTicket(sanitized, this.roles);
    this.modules.audit.log({
      event: 'ticket_routed',
      ticketType: sanitized.type,
      priority: sanitized.priority,
      department: sanitized.department,
      result: result
    });
    return result;
  }

  escalate(task, reason) {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(1, 'escalate');
    const sanitized = InputValidator.sanitizeTask(task);
    const sanitizedReason = InputValidator.validateString(reason, 'reason', 1000);
    const result = this.modules.escalation.escalate(sanitized, sanitizedReason, this.roles);
    this.modules.audit.log({
      event: 'task_escalated',
      from: sanitized.currentLevel || sanitized.assignedTo,
      department: sanitized.department,
      reason: sanitizedReason,
      result: result
    });
    return result;
  }

  getEscalationPath(department) {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(1, 'getEscalationPath');
    const sanitized = InputValidator.validateString(department, 'department');
    return this.modules.escalation.getPath(sanitized);
  }

  makeDecision(decisionType, context) {
    if (!this.initialized) throw new Error('Framework not initialized');
    InputValidator.validateString(decisionType, 'decisionType');
    InputValidator.validateObject(context, 'context');
    let result;
    if (this.rbacEnabled) {
      this._verifyCaller(1, 'makeDecision');
      const callerLevel = this._getCallerLevel();
      result = this.modules.decision.makeDecision(decisionType, context, this.roles, callerLevel);
    } else {
      result = this.modules.decision.makeDecision(decisionType, context, this.roles);
    }
    this.modules.audit.log({
      event: 'decision_made',
      decisionType: decisionType,
      decision: result.decision,
      authorityLevel: result.level,
      requiresEscalation: result.requiresEscalation,
      context: context
    });
    return result;
  }

  getAuthorityLevel(role) {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(1, 'getAuthorityLevel');
    InputValidator.validateString(role, 'role');
    return this.modules.decision.getAuthorityLevel(role, this.roles);
  }

  allocate(project, resources) {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(4, 'allocate');
    InputValidator.validateObject(project, 'project');
    InputValidator.validateObject(resources, 'resources');
    const result = this.modules.resources.allocate(project, resources);
    if (result && result.status === 'allocated') {
      this.modules.audit.log({
        event: 'resources_allocated',
        projectId: project.id || project.name,
        resources: resources,
        load: result.load
      });
    }
    return result;
  }

  deallocate(projectId) {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(4, 'deallocate');
    InputValidator.validateString(projectId, 'projectId');
    const result = this.modules.resources.deallocate(projectId);
    this.modules.audit.log({
      event: 'resources_deallocated',
      projectId: projectId,
      released: result.released
    });
    return result;
  }

  rebalance() {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(5, 'rebalance');
    const result = this.modules.resources.rebalance();
    this.modules.audit.log({
      event: 'resources_rebalanced',
      timestamp: result.timestamp,
      allocationCount: result.allocations.length
    });
    return result;
  }

  validate() {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(3, 'validate');
    return this.modules.validation.validate(this.config, this.roles);
  }

  generateReport(reportType, period) {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(5, 'generateReport');
    InputValidator.validateString(reportType, 'reportType');
    const result = this.modules.audit.generateReport(reportType, period);
    this.modules.audit.log({
      event: 'report_generated',
      reportType: reportType,
      period: period
    });
    return result;
  }

  sendToCEO(report, priority = 'normal') {
    if (!this.initialized) throw new Error('Framework not initialized');
    this._verifyCaller(6, 'sendToCEO');
    InputValidator.validateObject(report, 'report');
    const result = this.modules.audit.sendToCEO(report, priority);
    this.modules.audit.log({
      event: 'report_sent_to_ceo',
      reportType: report.type,
      priority: priority
    });
    return result;
  }

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

module.exports = FrameworkEngine;
