const express = require('express');
const router = express.Router();
const orchestrator = require('../modules/orchestrator');
const emsHandler = require('../modules/emsHandler');
const logger = require('../utils/logger');

// Middleware to check if orchestrator is running
const checkOrchestratorStatus = (req, res, next) => {
  if (!orchestrator.isRunning) {
    return res.status(503).json({
      error: 'Orchestrator is not running',
      status: 'stopped'
    });
  }
  next();
};

// /alerts - Trigger alert event
router.post('/alerts', checkOrchestratorStatus, (req, res) => {
  try {
    const { message, severity = 'info', metadata = {} } = req.body;

    const alertData = {
      id: `alert-${Date.now()}`,
      type: 'alert',
      message: message || 'Alert triggered',
      severity,
      metadata: { ...metadata, triggeredBy: 'api' },
      timestamp: new Date().toISOString(),
      source: 'trigger'
    };

    // Send to EMS handler
    emsHandler.receiveLog(alertData);

    logger.info('Alert triggered via API', { alertId: alertData.id, severity });

    res.json({
      success: true,
      alertId: alertData.id,
      message: 'Alert triggered successfully'
    });
  } catch (error) {
    logger.error('Alert trigger failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to trigger alert',
      details: error.message
    });
  }
});

// /pause - Pause the orchestration
router.post('/pause', (req, res) => {
  try {
    const { reason, duration } = req.body;

    orchestrator.stop();

    logger.info('Orchestration paused via API', { reason, duration });

    // If duration specified, set timeout to restart
    if (duration && typeof duration === 'number') {
      setTimeout(() => {
        orchestrator.start();
        logger.info('Orchestration auto-restarted after pause', { duration });
      }, duration * 1000);
    }

    res.json({
      success: true,
      status: 'paused',
      reason,
      autoRestart: !!duration,
      duration
    });
  } catch (error) {
    logger.error('Pause trigger failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to pause orchestration',
      details: error.message
    });
  }
});

// /consent - Handle consent events
router.post('/consent', checkOrchestratorStatus, (req, res) => {
  try {
    const { userId, action, consentGiven = true, metadata = {} } = req.body;

    const consentData = {
      id: `consent-${Date.now()}`,
      type: 'consent',
      message: `Consent ${consentGiven ? 'granted' : 'denied'} for ${action}`,
      userId,
      action,
      consentGiven,
      metadata: { ...metadata, triggeredBy: 'api' },
      timestamp: new Date().toISOString(),
      source: 'trigger'
    };

    // Send to EMS handler
    emsHandler.receiveLog(consentData);

    logger.info('Consent event triggered via API', {
      consentId: consentData.id,
      userId,
      action,
      consentGiven
    });

    res.json({
      success: true,
      consentId: consentData.id,
      message: 'Consent event processed successfully'
    });
  } catch (error) {
    logger.error('Consent trigger failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to process consent event',
      details: error.message
    });
  }
});

// /status - Get orchestration status
router.get('/status', (req, res) => {
  const stats = orchestrator.getStats();
  const consistency = orchestrator.checkEventConsistency();

  res.json({
    status: orchestrator.isRunning ? 'running' : 'stopped',
    stats,
    consistency
  });
});

// /logs - Get recent EMS logs
router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const logs = emsHandler.getRecentLogs(limit);

  res.json({
    logs,
    count: logs.length
  });
});

module.exports = router;