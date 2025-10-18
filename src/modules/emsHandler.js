const EventEmitter = require('eventemitter3');
const logger = require('../utils/logger');
const consentManager = require('./consentManager');

class EMSHandler extends EventEmitter {
  constructor() {
    super();
    this.logs = [];
  }

  // Receive log from EMS via HTTP POST or direct integration
  receiveLog(logData) {
    try {
      const parsedLog = this.parseLog(logData);

      // Handle consent events specially
      if (parsedLog.type === 'consent') {
        this.handleConsentEvent(parsedLog);
        // Still emit for logging purposes, but mark as consent
        parsedLog.isConsentEvent = true;
      }

      this.logs.push(parsedLog);
      logger.info('EMS Log received', { logId: parsedLog.id, type: parsedLog.type });

      // Emit event for AI orchestrator (skip consent events from normal processing)
      if (parsedLog.type !== 'consent') {
        this.emit('logReceived', parsedLog);
      } else {
        // Emit separate consent event
        this.emit('consentReceived', parsedLog);
    
        // Notify dashboard of consent update
        const dashboardIntegration = require('./dashboardIntegration');
        dashboardIntegration.sendConsentUpdate({
          userId: parsedLog.userId,
          action: parsedLog.action,
          consentGiven: parsedLog.consentGiven,
          timestamp: parsedLog.timestamp
        });
      }
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
      userId: logData.userId || logData.metadata?.userId,
      metadata: logData.metadata || {},
      source: 'EMS'
    };
  }

  // Handle consent events
  handleConsentEvent(consentLog) {
    try {
      const { userId, consentGiven, metadata } = consentLog;

      if (!userId) {
        logger.warn('Consent event missing userId', { consentLog });
        return;
      }

      // Store consent using consent manager
      const consentData = {
        monitoring_enabled: consentGiven,
        data_categories: metadata?.dataCategories || ['all'],
        retention_days: metadata?.retentionDays || 90,
        ...metadata
      };

      consentManager.setConsent(userId, consentData);

      logger.info('Consent event processed', {
        userId,
        consentGiven,
        source: 'sankalp'
      });
    } catch (error) {
      logger.error('Error handling consent event', { error: error.message, consentLog });
    }
  }

  // Get recent logs
  getRecentLogs(limit = 10) {
    return this.logs.slice(-limit);
  }
}

module.exports = new EMSHandler();