'use strict';
const crypto = require('crypto');

class AuditEngine {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.logs = [];
    this.reports = [];
    this._chain = [];
    this._previousHash = null;

    this.persistPath = config.persist_path || null;
    if (this.persistPath) {
      try {
        if (fs.existsSync(this.persistPath)) {
          const existing = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
          if (Array.isArray(existing)) {
            this._chain = existing;
            this._previousHash = existing.length > 0 ? existing[existing.length - 1].hash : null;
            this.logs = existing.map(e => e.entry);
            this.logger?.info(`Loaded ${existing.length} audit entries from persisted store`);
          }
        }
      } catch (e) {
        this.logger?.warn(`Failed to load persisted audit log: ${e.message}`);
      }
    }
  }

  _computeHash(entry, previousHash) {
    const hashInput = JSON.stringify({
      p: previousHash,
      t: entry.timestamp,
      e: entry.event,
      d: entry.data || entry
    });
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  log(event) {
    const entry = {
      ...event,
      timestamp: new Date().toISOString()
    };
    const hash = this._computeHash(entry, this._previousHash);
    const chainEntry = {
      entry,
      hash,
      previousHash: this._previousHash
    };
    this._chain.push(chainEntry);
    this._previousHash = hash;
    this.logs.push(entry);

    if (this.persistPath) {
      try {
        fs.writeFileSync(this.persistPath, JSON.stringify(this._chain, null, 2));
      } catch (e) {
        this.logger?.error(`Failed to persist audit log: ${e.message}`);
      }
    }
  }

  verifyChain() {
    if (this._chain.length === 0) return { valid: true, length: 0 };
    let valid = true;
    for (let i = 0; i < this._chain.length; i++) {
      const chainEntry = this._chain[i];
      const expectedPrevHash = i === 0 ? null : this._chain[i - 1].hash;
      if (chainEntry.previousHash !== expectedPrevHash) {
        valid = false;
        break;
      }
      const computed = this._computeHash(chainEntry.entry, expectedPrevHash);
      if (computed !== chainEntry.hash) {
        valid = false;
        break;
      }
    }
    return {
      valid,
      length: this._chain.length,
      lastHash: this._chain.length > 0 ? this._chain[this._chain.length - 1].hash : null
    };
  }

  generateReport(reportType, period) {
    if (!reportType) {
      this.logger?.warn('No reportType provided to generateReport');
      reportType = 'daily_ticket';
    }

    const templates = {
      'quarterly_audit': { title: 'Quarterly Audit Report', sections: ['executive_summary', 'project_metrics', 'budget_analysis', 'risk_assessment'] },
      'monthly_executive': { title: 'Monthly Executive Summary', sections: ['kpi_report', 'project_portfolio', 'resource_utilization'] },
      'weekly_department': { title: 'Weekly Department Report', sections: ['sprint_summary', 'team_velocity', 'blockers'] },
      'daily_ticket': { title: 'Daily Ticket Summary', sections: ['open_tickets', 'resolved_tickets', 'sla_status'] }
    };

    const report = {
      type: reportType,
      period: period,
      template: templates[reportType] || templates['daily_ticket'],
      generatedAt: new Date().toISOString(),
      data: this.logs,
      chainHash: this._chain.length > 0 ? this._chain[this._chain.length - 1].hash : null,
      integrity: this.verifyChain().valid ? 'verified' : 'tampered'
    };

    this.reports.push(report);
    this.logger?.info(`Report generated: ${reportType}`);

    return report;
  }

  sendToCEO(report, priority) {
    if (!report) {
      this.logger?.warn('No report provided to sendToCEO');
      return { sent: false, reason: 'No report provided' };
    }

    this.logger?.info(`Report sent to CEO - Priority: ${priority}`);
    return {
      sent: true,
      to: 'CEO',
      report: report.type,
      priority: priority,
      timestamp: new Date().toISOString(),
      checksum: report.chainHash || report.data.length
    };
  }
}

module.exports = AuditEngine;
