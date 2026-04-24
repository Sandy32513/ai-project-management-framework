/**
 * Validation script for CI pipeline
 * Checks config files, role files, and ensures no duplicates
 */
const fs = require('fs');
const path = require('path');

const basePath = process.cwd();
const errors = [];
const warnings = [];

function log(msg, type = 'info') {
  const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '✅';
  console.log(`${prefix} ${msg}`);
}

function validateJSON(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { valid: true, data };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// 1. Validate core config files
const configFiles = [
  'config/core.json',
  'config/hierarchy.json',
  'core/skills/decision.json',
  'core/routing/routing.json',
  'core/escalation/escalation.json',
  'core/skills/resource_allocation.json',
  'core/skills/audit.json'
];

log('Validating configuration files...');
configFiles.forEach(f => {
  const full = path.join(basePath, f);
  if (!fs.existsSync(full)) {
    errors.push(`Missing config file: ${f}`);
    log(`Missing: ${f}`, 'error');
    return;
  }
  const result = validateJSON(full);
  if (!result.valid) {
    errors.push(`Invalid JSON in ${f}: ${result.error}`);
    log(`Invalid JSON: ${f}`, 'error');
  } else {
    log(`Loaded: ${f}`);
  }
});

// 2. Validate role files — ensure no duplicates and required fields
const rolesDir = path.join(basePath, 'roles');
if (!fs.existsSync(rolesDir)) {
  errors.push('Roles directory not found');
  log('Roles directory missing', 'error');
} else {
  log('Validating role files...');
  const roleNames = new Set();
  const requiredRoleFields = ['role', 'department', 'level', 'skills'];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const result = validateJSON(full);
        if (!result.valid) {
          errors.push(`Invalid JSON in role file ${path.relative(basePath, full)}: ${result.error}`);
          log(`Invalid JSON: ${entry.name}`, 'error');
          continue;
        }
        const data = result.data;
        const missing = requiredRoleFields.filter(k => !data.hasOwnProperty(k));
        if (missing.length > 0) {
          warnings.push(`Role file ${path.relative(basePath, full)} missing fields: ${missing.join(', ')}`);
          log(`Missing fields in ${entry.name}: ${missing.join(', ')}`, 'warn');
        }
        if (!data.role) {
          errors.push(`Role file ${path.relative(basePath, full)} has no 'role' name`);
          log(`No role name: ${entry.name}`, 'error');
          continue;
        }
        if (roleNames.has(data.role)) {
          errors.push(`Duplicate role name: ${data.role} (in ${path.relative(basePath, full)} and earlier)`);
          log(`Duplicate role: ${data.role}`, 'error');
        } else {
          roleNames.add(data.role);
        }
      }
    }
  }
  walk(rolesDir);
  log(`Total unique roles loaded: ${roleNames.size}`);
}

// 3. Validate DecisionEngine levels mapping
log('Validating decision levels...');
const decisionPath = path.join(basePath, 'core/skills/decision.json');
if (fs.existsSync(decisionPath)) {
  const decision = JSON.parse(fs.readFileSync(decisionPath, 'utf8'));
  const levels = decision.decision_levels || [];
  if (levels.length === 0) {
    errors.push('decision.json has no decision_levels');
    log('No decision_levels found', 'error');
  } else {
    log(`Found ${levels.length} decision levels`);
    // Ensure each level has roles array
    levels.forEach(l => {
      if (!l.roles || !Array.isArray(l.roles) || l.roles.length === 0) {
        warnings.push(`Decision level ${l.level} (${l.authority}) has no roles mapping`);
      }
    });
  }
}

// Summary
console.log('\n========================================');
if (errors.length > 0) {
  console.log(`❌ VALIDATION FAILED: ${errors.length} error(s)`);
  errors.forEach(e => console.log(`   - ${e}`));
  process.exit(1);
} else if (warnings.length > 0) {
  console.log(`⚠️  VALIDATION PASSED with ${warnings.length} warning(s)`);
  warnings.forEach(w => console.log(`   - ${w}`));
  process.exit(0);
} else {
  console.log('✅ All validations passed!');
  process.exit(0);
}
