const axios = require('axios');
const EventEmitter = require('eventemitter3');
const logger = require('../utils/logger');

class AIOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.aiEndpoint = process.env.AI_BACKEND_URL || 'http://localhost:3001/analyze';
    this.analysisQueue = [];
  }

  // Analyze log data using AI backend (from Vijay)
  async analyzeLog(logData) {
    try {
      logger.logAIAnalysis('Starting analysis', { logId: logData.id });

      const response = await axios.post(this.aiEndpoint, {
        log: logData,
        timestamp: new Date().toISOString()
      });

      const analysis = response.data;
      logger.logAIAnalysis('Analysis completed', { logId: logData.id, result: analysis.result });

      // Emit event for RL evaluation
      this.emit('analysisComplete', { logData, analysis });

      return analysis;
    } catch (error) {
      logger.error('AI analysis failed', { error: error.message, logId: logData.id });
      // Emit error event
      this.emit('analysisError', { logData, error: error.message });
      throw error;
    }
  }

  // Handle task completion analysis
  async analyzeTaskCompletion(taskData) {
    try {
      const analysis = await this.analyzeLog({
        id: `task-${taskData.id}`,
        type: 'task_completion',
        message: `Task ${taskData.id} completed`,
        metadata: taskData,
        source: 'workflow'
      });

      return analysis;
    } catch (error) {
      logger.error('Task completion analysis failed', { taskId: taskData.id, error: error.message });
      throw error;
    }
  }

  // Queue analysis for batch processing if needed
  queueAnalysis(logData) {
    this.analysisQueue.push(logData);
    this.processQueue();
  }

  async processQueue() {
    if (this.analysisQueue.length > 0) {
      const logData = this.analysisQueue.shift();
      await this.analyzeLog(logData);
    }
  }
}

module.exports = new AIOrchestrator();