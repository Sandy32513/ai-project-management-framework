// Main entry point — re-exports all classes
// TASK-028: Split monolith into separate engine modules

const FrameworkEngine = require('./framework-engine');
const InputValidator = require('./input-validator');

// Export FrameworkEngine as the default export, and also named export for backward compatibility
module.exports = FrameworkEngine;
module.exports.FrameworkEngine = FrameworkEngine;
module.exports.InputValidator = InputValidator;
