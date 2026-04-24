'use strict';

// Input validation utility with injection protection
class InputValidator {
  static validateString(value, fieldName, maxLength = 500) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') throw new Error(`${fieldName} must be a string`);
    const sanitized = value.trim();
    if (sanitized.length > maxLength) throw new Error(`${fieldName} exceeds max length of ${maxLength}`);
    // Prompt injection pattern detection
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

module.exports = InputValidator;
