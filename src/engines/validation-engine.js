'use strict';

class ValidationEngine {
  constructor(roles, hierarchy, logger) {
    this.roles = roles;
    this.hierarchy = hierarchy;
    this.logger = logger;
    this._roleIndex = new Map();
    Object.values(roles).forEach(r => {
      if (r.role) {
        this._roleIndex.set(r.role.toLowerCase(), r);
        this._roleIndex.set(r.role.replace(/\s+/g, '_').toLowerCase(), r);
        this._roleIndex.set(r.role.replace(/_/g, ' ').toLowerCase(), r);
      }
    });
  }

  normalizeRoleName(name) {
    if (!name) return null;
    return name.replace(/_/g, ' ').replace(/\//g, '/').trim();
  }

  findRoleByName(name) {
    if (!name) return null;
    if (this.roles[name]) return this.roles[name];
    const normalized = this.normalizeRoleName(name);
    if (this.roles[normalized]) return this.roles[normalized];
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
      if (!reportsTo) return;

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

module.exports = ValidationEngine;
