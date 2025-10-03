const EventEmitter = require('eventemitter3');
const logger = require('../utils/logger');

class EMSHandler extends EventEmitter {
  constructor() {
    super();
    this.logs = [];
  }

  // Receive log from EMS (simulated as HTTP POST or direct call)
  receiveLog(logData) {
    try {
      const parsedLog = this.parseLog(logData);
      this.logs.push(parsedLog);
      logger.info('EMS Log received', { logId: parsedLog.id, type: parsedLog.type });

      // Emit event for AI orchestrator
      this.emit('logReceived', parsedLog);
    } catch (error) {
      logger.error('Error processing EMS log', { error: error.message, logData });
    }
  }

  // Parse log data (assuming JSON format)
  parseLog(logData) {
    // Basic parsing - extend based on actual EMS log format
    return {
      id: logData.id || Date.now().toString(),
      timestamp: logData.timestamp || new Date().toISOString(),
      type: logData.type || 'unknown',
      message: logData.message || '',
      metadata: logData.metadata || {},
      source: 'EMS'
    };
  }

  // Get recent logs
  getRecentLogs(limit = 10) {
    return this.logs.slice(-limit);
  }
}

module.exports = new EMSHandler();