require('dotenv').config();
const express = require('express');
const orchestrator = require('./src/modules/orchestrator');
const triggerRoutes = require('./src/routes/triggers');
const logger = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active dashboard connections for real-time updates
const dashboardConnections = new Set();

// Routes
app.use('/api', triggerRoutes);

// Real-time dashboard streaming endpoint (Server-Sent Events)
app.get('/api/dashboard/stream', (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Dashboard stream connected' })}\n\n`);

  // Add to active connections
  dashboardConnections.add(res);

  // Remove connection when client disconnects
  req.on('close', () => {
    dashboardConnections.delete(res);
    logger.info('Dashboard client disconnected');
  });

  logger.info('Dashboard client connected for real-time streaming');
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const stats = orchestrator.getStats();
    const consistency = orchestrator.checkEventConsistency();

    // Get health status from all integrated services
    const aiOrchestrator = require('./src/modules/aiOrchestrator');
    const rlEvaluator = require('./src/modules/rlEvaluator');
    const consentManager = require('./src/modules/consentManager');
    const emsIngestion = require('./src/modules/emsIngestion');
    const dashboardIntegration = require('./src/modules/dashboardIntegration');

    const [consentHealth, emsHealth, dashboardHealth] = await Promise.allSettled([
      consentManager.getHealthStatus ? consentManager.getHealthStatus() : Promise.resolve({ status: 'unknown' }),
      emsIngestion.getHealthStatus ? emsIngestion.getHealthStatus() : Promise.resolve({ status: 'unknown' }),
      dashboardIntegration.getHealthStatus ? dashboardIntegration.getHealthStatus() : Promise.resolve({ status: 'unknown' })
    ]);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      orchestrator: {
        running: stats.isRunning,
        stats,
        consistency
      },
      integrations: {
        consent_api: consentHealth.status === 'fulfilled' ? consentHealth.value : { status: 'error' },
        ems_ingestion: emsHealth.status === 'fulfilled' ? emsHealth.value : { status: 'error' },
        dashboard: dashboardHealth.status === 'fulfilled' ? dashboardHealth.value : { status: 'error' }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Task completion endpoint (for automation pipeline)
app.post('/api/tasks/complete', async (req, res) => {
  try {
    const { taskId, taskData } = req.body;

    if (!taskId || !taskData) {
      return res.status(400).json({
        error: 'Missing required fields: taskId and taskData'
      });
    }

    logger.info('Task completion received', { taskId });

    const result = await orchestrator.processTaskCompletion({
      id: taskId,
      ...taskData,
      completedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      taskId,
      result
    });
  } catch (error) {
    logger.error('Task completion processing failed', { taskId: req.body.taskId, error: error.message });
    res.status(500).json({
      error: 'Failed to process task completion',
      details: error.message
    });
  }
});

// EMS log ingestion endpoint (single log)
app.post('/api/logs', (req, res) => {
  try {
    const logData = req.body;

    if (!logData) {
      return res.status(400).json({
        error: 'Log data is required'
      });
    }

    // Import here to avoid circular dependency
    const emsHandler = require('./src/modules/emsHandler');
    emsHandler.receiveLog(logData);

    res.json({
      success: true,
      message: 'Log received and queued for processing'
    });
  } catch (error) {
    logger.error('Log ingestion failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to ingest log',
      details: error.message
    });
  }
});

// EMS bulk log ingestion endpoint
app.post('/api/logs/bulk', (req, res) => {
  try {
    const { logs } = req.body;

    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return res.status(400).json({
        error: 'Logs array is required and must not be empty'
      });
    }

    // Import here to avoid circular dependency
    const emsHandler = require('./src/modules/emsHandler');
    let processed = 0;

    logs.forEach(logData => {
      try {
        emsHandler.receiveLog(logData);
        processed++;
      } catch (error) {
        logger.error('Failed to process log in bulk', { logId: logData?.id, error: error.message });
      }
    });

    res.json({
      success: true,
      message: `${processed}/${logs.length} logs received and queued for processing`
    });
  } catch (error) {
    logger.error('Bulk log ingestion failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to ingest logs',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Start server only if this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`AI-Driven RL Workflow Automation server running on port ${PORT}`);

    // Set dashboard connections for real-time streaming
    orchestrator.setDashboardConnections(dashboardConnections);

    // Start orchestrator
    orchestrator.start();

    // Log startup
    logger.info('System initialized', {
      port: PORT,
      environment: process.env.NODE_ENV,
      aiBackend: process.env.AI_BACKEND_URL,
      rlBackend: process.env.RL_BACKEND_URL,
      dashboard: process.env.DASHBOARD_URL
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    orchestrator.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    orchestrator.stop();
    process.exit(0);
  });
}

module.exports = app;