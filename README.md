# AI Project Management Framework

> **⚠️ Status: NOT PRODUCTION READY — Proof of Concept only**
> Production readiness score: 5/100. Do not deploy.

## What this actually is

A **rule-based workflow automation scaffold** that routes projects and
escalations across a JSON-defined role hierarchy. It is not an autonomous AI
system. All routing decisions are deterministic lookups against JSON files.

## What works

- Role loading from 89 JSON files across 10 departments
- Basic ticket routing (security → CISO, billing → CFO)
- Escalation path resolution via hardcoded department chains
- Input sanitisation (injection pattern detection)
- Framework health check endpoint

## What is broken

| Issue | Severity |
|-------|----------|
| Skill-based routing never matches — wrong JSON key | 🔴 Critical |
| 4/6 config files never loaded | 🔴 Critical |
| DecisionEngine operates with empty authority table | 🔴 Critical |
| All state lost on restart (no persistence) | 🔴 Critical |
| Duplicate CISO + Principal Engineer role files | 🔴 Critical |
| No authentication or RBAC | 🔴 Critical |
| Privilege escalation via makeDecision() | 🔴 Critical |
| Path traversal in init() configPath | 🔴 Critical |

## Known security vulnerabilities

- **SEC-001**: No RBAC — any caller can invoke any method
- **SEC-002**: Privilege escalation — `makeDecision({budget:999999})` always returns approved
- **SEC-003**: Prompt injection via project name fields
- **SEC-004**: Path traversal in `init()` options

## Fix roadmap

### Phase 1 — Week 1 (core correctness)
- [ ] Fix config loading paths (TASK-001)
- [ ] Fix skill key mismatch (TASK-002)
- [ ] Remove singleton export (TASK-007)
- [ ] Remove duplicate role files (TASK-008)
- [ ] Fix route sort priority map (TASK-011)

### Phase 2 — Week 2 (security hardening)
- [ ] Path traversal protection (TASK-005)
- [ ] Privilege escalation fix (TASK-004)
- [ ] Prompt injection sanitisation (TASK-006)

### Phase 3 — Weeks 3–4 (testing + CI/CD)
- [ ] Jest test suite — 60% coverage target (TASK-015)
- [ ] GitHub Actions CI pipeline (TASK-016)
- [ ] Dockerfile (TASK-017)

### Phase 4 — Weeks 5–8 (resilience)
- [ ] Persistence layer (TASK-009)
- [ ] Immutable audit logs (TASK-014)
- [ ] Observability stack (TASK-023)
- [ ] Disaster recovery (TASK-024)

## Technical debt

- `src/core/index.js` is a 674-line monolith containing 6 separate engine classes
- No `package-lock.json` — reproducible builds not guaranteed
- `test.js` contains zero assertions — always reports success
- `EscalationEngine` ignores loaded config and uses hardcoded escalation paths
- Node.js version conflict: `package.json` requires ≥18, eslint requires ≥20

## Architecture notes

- **No database** — all state is in-memory and lost on restart
- **No real AI** — routing is string matching against JSON, not ML
- **Singleton pattern** — prevents multi-tenant or isolated test usage
- **Config files** — only `config/core.json` and `config/hierarchy.json` are loaded; the other 4 files in `core/` are documentation only
