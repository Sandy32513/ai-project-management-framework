const framework = require('./src/core');

console.log('=== AI Project Management Framework Test ===\n');

framework.init({
  configPath: './config',
  rolesPath: './roles'
});

console.log('\n--- Testing Routing Engine ---');
const projectRoute = framework.routeProject({
  name: 'New Feature',
  department: 'Engineering',
  required_skills: ['javascript', 'system_design'],
  priority: 'high'
});
console.log('Project Route:', JSON.stringify(projectRoute, null, 2));

const ticketRoute = framework.routeTicket({
  type: 'security',
  priority: 'critical'
});
console.log('\nTicket Route:', JSON.stringify(ticketRoute, null, 2));

console.log('\n--- Testing Escalation Engine ---');
const escalation = framework.escalate({
  assignedTo: 'Software Engineer',
  department: 'engineering'
}, 'Task exceeded 24h timeout');
console.log('Escalation:', JSON.stringify(escalation, null, 2));

const engPath = framework.getEscalationPath('engineering');
console.log('\nEngineering Escalation Path:', engPath);

console.log('\n--- Testing Decision Engine ---');
const decision = framework.makeDecision('budget_approval', {
  budget: 50000,
  impact: 'high',
  requestedBy: 'Engineering Manager'
});
console.log('Decision:', JSON.stringify(decision, null, 2));

const authLevel = framework.getAuthorityLevel('Tech Lead');
console.log('\nAuthority Level for Tech Lead:', JSON.stringify(authLevel, null, 2));

console.log('\n--- Testing Resource Allocation ---');
const allocation = framework.allocate(
  { id: 'proj-001', name: 'Mobile App' },
  { developers: 3, designers: 1, qa: 2 }
);
console.log('Allocation:', JSON.stringify(allocation, null, 2));

const rebalance = framework.rebalance();
console.log('\nRebalance:', JSON.stringify(rebalance, null, 2));

console.log('\n--- Testing Audit & Reporting ---');
const report = framework.generateReport('quarterly_audit', 'Q1 2026');
console.log('Report Generated:', report.type, '-', report.template.title);

const ceoSent = framework.sendToCEO(report, 'high');
console.log('CEO Notification:', JSON.stringify(ceoSent, null, 2));

console.log('\n--- Testing Validation ---');
const validation = framework.validate();
console.log('Validation:', JSON.stringify(validation, null, 2));

console.log('\n=== All Tests Completed ===');