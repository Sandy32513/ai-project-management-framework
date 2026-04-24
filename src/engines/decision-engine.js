'use strict';

class DecisionEngine {
  constructor(decisionConfig, logger) {
    this.levels = decisionConfig.levels || decisionConfig.decision_levels || [];
    this.logger = logger;
    this.decisionHistory = [];
    this._roleIndex = new Map();
    this.levels.forEach(l => {
      (l.roles || []).forEach(r => {
        this._roleIndex.set(r.toLowerCase(), l);
      });
    });
  }

  makeDecision(decisionType, context, roles, callerLevel = 6) {
    if (!context || typeof context !== 'object') {
      this.logger?.warn('Invalid context provided to makeDecision');
      return { decision: 'rejected', reason: 'Invalid context' };
    }

    const { budget = 0, impact = 'low', requestedBy } = context;

    let requiredLevel = 1;
    if (budget > 500000 || impact === 'critical') requiredLevel = 6;
    else if (budget > 50000 || impact === 'high') requiredLevel = 5;
    else if (budget > 10000 || impact === 'medium_high') requiredLevel = 4;
    else if (budget > 1000 || impact === 'medium') requiredLevel = 3;
    else if (budget > 0 || impact === 'low') requiredLevel = 2;

    const levelConfig = this.levels.find(l => l.level === requiredLevel);

    let requiresEscalation = false;
    let decisionOutcome = 'approved';
    if (callerLevel < requiredLevel) {
      requiresEscalation = true;
      decisionOutcome = 'pending_escalation';
      this.logger?.warn(`Caller authority insufficient: level ${callerLevel} < required ${requiredLevel}`);
    }

    if (requestedBy && roles) {
      const requesterRole = Object.values(roles).find(
        r => r.role === requestedBy || r.role?.toLowerCase() === requestedBy?.toLowerCase()
      );
      if (requesterRole) {
        const requesterInfo = this.getAuthorityLevel(requestedBy, roles);
        if (requesterInfo && requiredLevel > requesterInfo.level) {
          requiresEscalation = true;
          decisionOutcome = 'pending_escalation';
          this.logger?.warn(`Decision requires escalation: requester ${requestedBy} (level ${requesterInfo.level}) < required level ${requiredLevel}`);
        }
      }
    }

    if (levelConfig?.budget_limit !== null && levelConfig?.budget_limit !== undefined && budget > levelConfig.budget_limit) {
      requiresEscalation = true;
      decisionOutcome = 'pending_escalation';
      this.logger?.warn(`Budget $${budget} exceeds limit $${levelConfig.budget_limit} for level ${requiredLevel}`);
    }

    const decision = {
      decision: decisionOutcome,
      decisionType: decisionType,
      level: requiredLevel,
      authority: levelConfig?.authority || 'routine',
      budgetLimit: levelConfig?.budget_limit,
      requiresEscalation: requiresEscalation,
      requestedBy: requestedBy,
      budget: budget,
      impact: impact,
      timestamp: new Date().toISOString()
    };

    this.decisionHistory.push(decision);
    this.logger?.info(`Decision made: ${decisionType} - Level ${requiredLevel} - Outcome: ${decisionOutcome}`);

    return decision;
  }

  getAuthorityLevel(role, roles) {
    if (!role) return null;
    const roleLower = String(role).toLowerCase();

    const levelConfig = this._roleIndex.get(roleLower);
    if (levelConfig) {
      return {
        role: role,
        level: levelConfig.level,
        authority: levelConfig.authority,
        budgetLimit: levelConfig.budget_limit
      };
    }

    const roleData = Object.values(roles).find(r => r.role === role || r.role?.toLowerCase() === roleLower);
    if (roleData) {
      const levelMap = {
        'C-Suite': 6, 'Leadership': 5, 'Senior Leadership': 5,
        'Engineering Leadership': 4, 'Management': 4, 'Technical': 4,
        'Mid-Level Leadership': 3, 'Development': 3,
        'Analysis': 2, 'Facilitation': 2, 'Execution': 2, 'Individual Contributor': 2,
        'Entry': 1
      };
      const level = levelMap[roleData.level] || 1;
      return {
        role: role,
        level: level,
        authority: levelConfig?.authority || roleData.authority || 'standard',
        budgetLimit: levelConfig?.budget_limit || roleData.budget_limit || 1000
      };
    }

    return null;
  }

  getHistory() {
    return this.decisionHistory;
  }
}

module.exports = DecisionEngine;
