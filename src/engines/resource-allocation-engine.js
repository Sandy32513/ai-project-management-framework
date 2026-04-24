'use strict';

class ResourceAllocationEngine {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.allocations = [];
    this.resourceCapacity = {};

    const raw = config || {};
    const constraints = raw?.constraints || {};
    const maxTasksConfig = constraints.max_concurrent_tasks;

    if (maxTasksConfig && typeof maxTasksConfig === 'object' && !Array.isArray(maxTasksConfig)) {
      this.maxConcurrentTasksMap = { ...maxTasksConfig };
      this.maxConcurrentTasks = Math.max(...Object.values(maxTasksConfig));
    } else {
      this.maxConcurrentTasks = maxTasksConfig ?? 5;
      this.maxConcurrentTasksMap = null;
    }
  }

  _getGlobalRoleUsage(roleKey) {
    const rk = String(roleKey).toLowerCase();
    return this.allocations.reduce((sum, alloc) => {
      const count = alloc.resources ? (alloc.resources[rk] || 0) : 0;
      return sum + count;
    }, 0);
  }

  allocate(project, resources) {
    if (!project || typeof project !== 'object') {
      this.logger?.warn('Invalid project provided to allocate');
      return null;
    }

    const projectId = project.id || project.name;

    if (this.maxConcurrentTasksMap) {
      for (const [roleKey, requestedCount] of Object.entries(resources)) {
        const count = Number(requestedCount);
        if (isNaN(count) || count <= 0) continue;
        const rk = roleKey.toLowerCase();
        const limit = this.maxConcurrentTasksMap[rk];
        if (limit !== undefined) {
          const current = this._getGlobalRoleUsage(rk);
          if (current + count > limit) {
            this.logger?.warn(`Capacity exceeded for ${roleKey}: ${current} + ${count} > ${limit}`);
            return {
              projectId,
              resources,
              timestamp: new Date().toISOString(),
              status: 'rejected',
              reason: `Capacity exceeded for ${roleKey}`,
              load: current
            };
          }
        }
      }
    } else {
      const currentLoad = this.getResourceLoad(projectId);
      if (currentLoad >= this.maxConcurrentTasks) {
        this.logger?.warn(`Project ${projectId} at max capacity (${this.maxConcurrentTasks}) — allocation REJECTED`);
        return {
          projectId,
          resources,
          timestamp: new Date().toISOString(),
          status: 'rejected',
          reason: `Max concurrent tasks (${this.maxConcurrentTasks}) exceeded`,
          load: currentLoad
        };
      }
    }

    const allocation = {
      projectId,
      resources,
      timestamp: new Date().toISOString(),
      status: 'allocated'
    };

    this.allocations.push(allocation);
    this.logger?.info(`Resources allocated to project: ${projectId}`);
    return allocation;
  }

  deallocate(projectId) {
    if (!projectId) return { projectId, released: 0, timestamp: new Date().toISOString() };
    const before = this.allocations.length;
    this.allocations = this.allocations.filter(a => a.projectId !== projectId);
    const released = before - this.allocations.length;
    this.logger?.info(`Released ${released} allocation(s) for project: ${projectId}`);
    return { projectId, released, timestamp: new Date().toISOString() };
  }

  getResourceLoad(projectId) {
    return this.allocations.filter(a => a.projectId === projectId).length;
  }

  checkCapacity(resourceType, threshold = 90) {
    const totalAllocations = this.allocations.length;
    if (totalAllocations === 0) return { atCapacity: false, percentage: 0 };
    const percentage = (totalAllocations / this.maxConcurrentTasks) * 100;
    return {
      atCapacity: percentage >= threshold,
      percentage: Math.round(percentage),
      threshold: threshold
    };
  }

  rebalance() {
    this.logger?.info('Rebalancing resources across projects');
    return {
      rebalanced: true,
      timestamp: new Date().toISOString(),
      allocations: this.allocations,
      capacity: this.checkCapacity()
    };
  }
}

module.exports = ResourceAllocationEngine;
