const axios = require('axios');
const EventEmitter = require('eventemitter3');
const logger = require('../utils/logger');

class EMSIngestionService extends EventEmitter {
  constructor() {
    super();
    this.emsEndpoints = [
      process.env.EMS_ENDPOINT_1,
      process.env.EMS_ENDPOINT_2,
      process.env.EMS_ENDPOINT_3
    ].filter(Boolean); // Remove undefined endpoints

    this.pollingInterval = parseInt(process.env.EMS_POLLING_INTERVAL) || 30000; // 30 seconds
    this.isRunning = false;
    this.lastProcessedIds = new Set();
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  // Start ingesting logs from EMS systems
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('EMS Ingestion Service started', {
      endpoints: this.emsEndpoints.length,
      pollingInterval: this.pollingInterval
    });

    this.ingestionLoop();
  }

  // Stop ingesting logs
  stop() {
    this.isRunning = false;
    logger.info('EMS Ingestion Service stopped');
  }

  // Main ingestion loop
  async ingestionLoop() {
    while (this.isRunning) {
      try {
        await this.ingestFromAllEndpoints();
        await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
      } catch (error) {
        logger.error('Error in ingestion loop', { error: error.message });
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  // Ingest from all configured EMS endpoints
  async ingestFromAllEndpoints() {
    const promises = this.emsEndpoints.map(endpoint => this.ingestFromEndpoint(endpoint));
    await Promise.allSettled(promises);
  }

  // Ingest logs from a specific EMS endpoint
  async ingestFromEndpoint(endpoint) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug('Fetching logs from EMS endpoint', { endpoint, attempt });

        const response = await axios.get(`${endpoint}/logs`, {
          params: {
            since: new Date(Date.now() - this.pollingInterval).toISOString(),
            limit: 100
          },
          timeout: 10000,
          headers: {
            'Authorization': `Bearer ${process.env.EMS_API_KEY || 'default-key'}`,
            'Content-Type': 'application/json'
          }
        });

        const logs = response.data.logs || response.data || [];

        if (logs.length > 0) {
          logger.info(`Fetched ${logs.length} logs from EMS`, { endpoint });

          for (const log of logs) {
            await this.processEMSLog(log, endpoint);
          }
        }

        return;

      } catch (error) {
        lastError = error;
        logger.warn(`EMS endpoint fetch attempt ${attempt} failed`, {
          endpoint,
          error: error.message,
          attempt,
          willRetry: attempt < this.maxRetries
        });

        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    logger.error('Failed to fetch from EMS endpoint after all retries', {
      endpoint,
      error: lastError.message,
      attempts: this.maxRetries
    });
  }

  // Process a single EMS log entry
  async processEMSLog(logData, source) {
    try {
      // Create unique ID to avoid duplicates
      const logId = logData.id || `${source}-${logData.timestamp || Date.now()}`;

      if (this.lastProcessedIds.has(logId)) {
        return; // Skip already processed logs
      }

      // Transform EMS log to our format
      const transformedLog = {
        id: logId,
        type: this.mapLogType(logData.type || logData.level),
        message: logData.message || logData.content,
        userId: logData.user_id || logData.employee_id,
        metadata: {
          ...logData,
          source: source,
          ingested_at: new Date().toISOString(),
          original_type: logData.type
        },
        timestamp: logData.timestamp || new Date().toISOString(),
        source: 'EMS'
      };

      // Track processed ID
      this.lastProcessedIds.add(logId);

      // Keep only last 10000 processed IDs to prevent memory leak
      if (this.lastProcessedIds.size > 10000) {
        const oldestIds = Array.from(this.lastProcessedIds).slice(0, 1000);
        oldestIds.forEach(id => this.lastProcessedIds.delete(id));
      }

      logger.debug('Processed EMS log', {
        logId: transformedLog.id,
        type: transformedLog.type,
        userId: transformedLog.userId
      });

      // Emit event for orchestrator
      this.emit('logIngested', transformedLog);

    } catch (error) {
      logger.error('Error processing EMS log', {
        error: error.message,
        logData: JSON.stringify(logData).slice(0, 200)
      });
    }
  }

  // Map EMS log types to our internal types
  mapLogType(emsType) {
    const typeMapping = {
      'error': 'error',
      'warn': 'warning',
      'warning': 'warning',
      'info': 'info',
      'debug': 'debug',
      'activity': 'user_activity',
      'login': 'authentication',
      'logout': 'authentication',
      'task_complete': 'task_completion',
      'alert': 'alert',
      'compliance': 'compliance',
      'system': 'system_event'
    };

    return typeMapping[emsType?.toLowerCase()] || 'unknown';
  }

  // Get ingestion statistics
  getStats() {
    return {
      isRunning: this.isRunning,
      endpoints: this.emsEndpoints.length,
      pollingInterval: this.pollingInterval,
      processedIdsCount: this.lastProcessedIds.size,
      uptime: this.isRunning ? Date.now() - this.startTime : 0
    };
  }

  // Get health status for monitoring
  async getHealthStatus() {
    const healthResults = await this.healthCheck();
    const stats = this.getStats();

    return {
      status: Object.values(healthResults).every(h => h.status === 'healthy') ? 'healthy' : 'degraded',
      endpoints: healthResults,
      stats: stats
    };
  }

  // Health check for EMS endpoints
  async healthCheck() {
    const results = {};

    for (const endpoint of this.emsEndpoints) {
      try {
        const response = await axios.get(`${endpoint}/health`, {
          timeout: 5000,
          headers: {
            'Authorization': `Bearer ${process.env.EMS_API_KEY || 'default-key'}`
          }
        });

        results[endpoint] = {
          status: 'healthy',
          response_time: response.data.response_time || 0,
          last_check: new Date().toISOString()
        };
      } catch (error) {
        results[endpoint] = {
          status: 'unhealthy',
          error: error.message,
          last_check: new Date().toISOString()
        };
      }
    }

    return results;
  }
}

module.exports = new EMSIngestionService();