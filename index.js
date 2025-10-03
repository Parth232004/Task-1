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

// Routes
app.use('/api', triggerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const stats = orchestrator.getStats();
  const consistency = orchestrator.checkEventConsistency();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    orchestrator: {
      running: stats.isRunning,
      stats,
      consistency
    }
  });
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

// EMS log ingestion endpoint
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