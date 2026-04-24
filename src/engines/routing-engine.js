'use strict';

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

      if (required_skills && required_skills.length > 0) {
        const roleSkills = [
          ...(role.skills?.technologies || []),
          ...(role.skills?.task_handling?.owns || []),
        ].map(s => s.toLowerCase());
        const hasSkill = required_skills.some(skill => roleSkills.includes(skill.toLowerCase()));
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

    const priorityOrder = {
      'C-Suite': 6, 'Leadership': 5, 'Senior Leadership': 5,
      'Technical': 4, 'Engineering Leadership': 4, 'Management': 4,
      'Mid-Level Leadership': 3, 'Development': 3,
      'Analysis': 2, 'Facilitation': 2, 'Execution': 2, 'Individual Contributor': 2,
      'Entry': 1
    };
    const sorted = candidates.sort((a, b) => {
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

module.exports = RoutingEngine;
