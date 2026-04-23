const fs = require('fs');
const path = require('path');

// Load all roles
const roles = {};
const roleFiles = [];

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanDir(full);
    } else if (file.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (data.role) {
          roles[data.role] = data;
          roleFiles.push({
            role: data.role,
            file: full,
            reportsTo: data.reportsTo,
            department: data.department
          });
        }
      } catch (e) { }
    }
  });
}

scanDir('roles');

console.log('=== ROLE ANALYSIS ===');
console.log('Total roles loaded:', Object.keys(roles).length);

// Find orphaned roles
console.log('\n=== ORPHANED ROLES (reportsTo not found) ===');
let orphanCount = 0;
roleFiles.forEach(r => {
  if (r.reportsTo && !roles[r.reportsTo] && !r.reportsTo.includes('/') && !r.reportsTo.includes('_Varies')) {
    console.log('  ' + r.role + ' -> ' + r.reportsTo);
    orphanCount++;
  }
});
if (orphanCount === 0) console.log('  None found');

// Find duplicate roles
console.log('\n=== DUPLICATE ROLE DEFINITIONS ===');
const roleCount = {};
roleFiles.forEach(r => {
  roleCount[r.role] = (roleCount[r.role] || 0) + 1;
});
let duplicateFound = false;
Object.entries(roleCount).forEach(([role, count]) => {
  if (count > 1) {
    console.log('  ' + role + ': ' + count + ' definitions');
    duplicateFound = true;
  }
});
if (!duplicateFound) console.log('  None found');

// Check missing required fields
console.log('\n=== ROLES MISSING REQUIRED FIELDS ===');
let missingFields = 0;
roleFiles.forEach(r => {
  const role = roles[r.role];
  if (!role.department) { console.log('  ' + r.role + ': missing department'); missingFields++; }
  if (!role.level) { console.log('  ' + r.role + ': missing level'); missingFields++; }
  if (!role.reportsTo) { console.log('  ' + r.role + ': missing reportsTo'); missingFields++; }
  if (!role.skills) { console.log('  ' + r.role + ': missing skills'); missingFields++; }
});
if (missingFields === 0) console.log('  None found');

// Check escalation path references
console.log('\n=== ESCALATION PATH INCONSISTENCIES ===');
let escalationIssues = 0;
roleFiles.forEach(r => {
  const role = roles[r.role];
  if (role.escalation_path) {
    const { incoming, outgoing } = role.escalation_path;
    if (incoming) incoming.forEach(from => {
      if (!roles[from] && from !== 'Mentor (Junior/Mid-Level Engineer)' && from !== 'Relevant_C-Suite') {
        console.log('  ' + r.role + ': missing incoming role "' + from + '"');
        escalationIssues++;
      }
    });
    if (outgoing) outgoing.forEach(to => {
      if (!roles[to] && to !== 'CEO' && to !== 'Board' && to !== 'Stakeholders' && !to.includes('C-Suite') && to !== 'c_suite_alert' && to !== 'immediate_ceo_alert' && to !== 'immediate_board_alert' && to !== 'mentor_alert' && to !== 'mid_level_engineer_alert' && to !== 'team_lead_alert' && to !== 'manager_alert' && to !== 'senior_manager_alert' && to !== 'vp_alert' && to !== 'c_suite_alert' && to !== 'cto_alert') {
        console.log('  ' + r.role + ': missing outgoing role "' + to + '"');
        escalationIssues++;
      }
    });
  }
});
if (escalationIssues === 0) console.log('  None found');

// Analyze department distribution
console.log('\n=== DEPARTMENT DISTRIBUTION ===');
const deptCount = {};
roleFiles.forEach(r => {
  const dept = r.department || 'UNKNOWN';
  deptCount[dept] = (deptCount[dept] || 0) + 1;
});
Object.entries(deptCount).sort((a, b) => b[1] - a[1]).forEach(([dept, count]) => {
  console.log('  ' + dept + ': ' + count + ' roles');
});

// Analyze level distribution
console.log('\n=== LEVEL DISTRIBUTION ===');
const levelCount = {};
roleFiles.forEach(r => {
  const level = roles[r.role].level || 'UNKNOWN';
  levelCount[level] = (levelCount[level] || 0) + 1;
});
Object.entries(levelCount).sort((a, b) => b[1] - a[1]).forEach(([level, count]) => {
  console.log('  ' + level + ': ' + count + ' roles');
});

console.log('\n=== ANALYSIS COMPLETE ===');
