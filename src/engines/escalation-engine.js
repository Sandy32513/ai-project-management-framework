'use strict';

class EscalationEngine {
  constructor(escalationConfig, hierarchy, logger) {
    this.config = escalationConfig;
    this.hierarchy = hierarchy;
    this.logger = logger;
    this.escalationHistory = [];
    this._rateLimitWindow = 60 * 60 * 1000; // 1 hour
    this._maxEscalationsPerRole = 10;
  }

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

    if (this._isRateLimited(currentLevel)) {
      this.logger?.warn(`Escalation rate limit reached for ${currentLevel} — max ${this._maxEscalationsPerRole}/hour`);
      return { escalated: false, reason: `Rate limit exceeded for ${currentLevel}`, rateLimited: true };
    }

    const escalationPath = this.getPath(department);
    const currentIndex = escalationPath.findIndex(r => r === currentLevel);

    if (currentIndex === -1 || currentIndex >= escalationPath.length - 1) {
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

  _getFallbackTarget(currentLevel, department) {
    const fallbackChain = {
      'CISO': 'CTO',
      'CTO': 'CEO',
      'CFO': 'CEO',
      'COO': 'CEO',
      'CIO': 'CTO',
      'CCO': 'CEO',
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

module.exports = EscalationEngine;
