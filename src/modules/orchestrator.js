const EventEmitter = require('eventemitter3');
const emsHandler = require('./emsHandler');
const aiOrchestrator = require('./aiOrchestrator');
const rlEvaluator = require('./rlEvaluator');
const logger = require('../utils/logger');

class WorkflowOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.eventCounts = {
      logsReceived: 0,
      analysesCompleted: 0,
      evaluationsCompleted: 0,
      errors: 0
    };
    this.setupEventListeners();
  }

  // Start the orchestration
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Workflow Orchestrator started');
    this.emit('started');
  }

  // Stop the orchestration
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    logger.info('Workflow Orchestrator stopped');
    this.emit('stopped');
  }

  // Setup event listeners for the pipeline
  setupEventListeners() {
    // EMS log received -> AI analysis
    emsHandler.on('logReceived', async (logData) => {
      if (!this.isRunning) return;
      this.eventCounts.logsReceived++;
      logger.info('Processing EMS log in orchestrator', { logId: logData.id });

      try {
        await aiOrchestrator.analyzeLog(logData);
      } catch (error) {
        this.eventCounts.errors++;
        logger.error('Failed to analyze log in orchestrator', { logId: logData.id, error: error.message });
      }
    });

    // AI analysis complete -> RL evaluation
    aiOrchestrator.on('analysisComplete', async (analysisData) => {
      if (!this.isRunning) return;
      this.eventCounts.analysesCompleted++;
      logger.info('Processing AI analysis in orchestrator', { logId: analysisData.logData.id });

      try {
        await rlEvaluator.evaluateAnalysis(analysisData);
      } catch (error) {
        this.eventCounts.errors++;
        logger.error('Failed to evaluate analysis in orchestrator', { logId: analysisData.logData.id, error: error.message });
      }
    });

    // RL evaluation complete -> emit final event
    rlEvaluator.on('evaluationComplete', (evaluationData) => {
      if (!this.isRunning) return;
      this.eventCounts.evaluationsCompleted++;
      logger.info('Evaluation pipeline completed', { logId: evaluationData.logData.id });
      this.emit('pipelineComplete', evaluationData);
    });

    // Handle errors
    emsHandler.on('error', (error) => {
      this.eventCounts.errors++;
      logger.error('EMS Handler error', { error: error.message });
      this.emit('error', { source: 'EMS', error });
    });

    aiOrchestrator.on('analysisError', (errorData) => {
      this.eventCounts.errors++;
      logger.error('AI Orchestrator error', { logId: errorData.logData?.id, error: errorData.error });
      this.emit('error', { source: 'AI', ...errorData });
    });

    rlEvaluator.on('evaluationError', (errorData) => {
      this.eventCounts.errors++;
      logger.error('RL Evaluator error', { logId: errorData.analysisData?.logData?.id, error: errorData.error });
      this.emit('error', { source: 'RL', ...errorData });
    });
  }

  // Handle task completion pipeline
  async processTaskCompletion(taskData) {
    if (!this.isRunning) {
      throw new Error('Orchestrator is not running');
    }

    logger.info('Processing task completion', { taskId: taskData.id });

    try {
      const analysis = await aiOrchestrator.analyzeTaskCompletion(taskData);
      const evaluation = await rlEvaluator.evaluateTaskCompletion(taskData, analysis);

      this.emit('taskPipelineComplete', { taskData, analysis, evaluation });
      return { analysis, evaluation };
    } catch (error) {
      this.eventCounts.errors++;
      logger.error('Task completion pipeline failed', { taskId: taskData.id, error: error.message });
      this.emit('taskError', { taskData, error: error.message });
      throw error;
    }
  }

  // Get orchestration stats
  getStats() {
    return {
      isRunning: this.isRunning,
      ...this.eventCounts,
      uptime: this.isRunning ? Date.now() - this.startTime : 0
    };
  }

  // Monitor event consistency
  checkEventConsistency() {
    const { logsReceived, analysesCompleted, evaluationsCompleted } = this.eventCounts;

    if (logsReceived !== analysesCompleted) {
      logger.warn('Event consistency issue: Logs received vs Analyses completed', {
        logsReceived, analysesCompleted
      });
    }

    if (analysesCompleted !== evaluationsCompleted) {
      logger.warn('Event consistency issue: Analyses vs Evaluations completed', {
        analysesCompleted, evaluationsCompleted
      });
    }

    return {
      consistent: logsReceived === analysesCompleted && analysesCompleted === evaluationsCompleted,
      stats: this.eventCounts
    };
  }
}

module.exports = new WorkflowOrchestrator();