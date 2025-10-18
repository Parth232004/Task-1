const axios = require('axios');
const EventEmitter = require('eventemitter3');
const logger = require('../utils/logger');

class AIOrchestrator extends EventEmitter {
  constructor() {
    super();
    // Use Vijay's AI orchestrator endpoint
    this.aiEndpoint = process.env.AI_BACKEND_URL || 'http://localhost:8002/handle_task';
    this.analysisQueue = [];
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  // Analyze log data using Vijay's AI orchestrator
  async analyzeLog(logData) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        logger.logAIAnalysis('Starting analysis', { logId: logData.id, attempt });

        // Prepare payload for Vijay's MCP bridge
        const payload = {
          agent: 'stream_transformer_agent', // Use intelligent agent routing
          input: `Analyze this log entry: ${JSON.stringify(logData)}`,
          input_type: 'text',
          user_id: logData.userId || 'system',
          tags: ['log_analysis', 'workflow_automation']
        };

        const response = await axios.post(this.aiEndpoint, payload, {
          timeout: 30000, // 30 second timeout
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const analysis = response.data.agent_output || response.data;
        logger.logAIAnalysis('Analysis completed', {
          logId: logData.id,
          result: analysis.response || analysis.result,
          status: analysis.status
        });

        // Emit event for RL evaluation
        this.emit('analysisComplete', { logData, analysis });

        return analysis;
      } catch (error) {
        lastError = error;
        logger.warn(`AI analysis attempt ${attempt} failed`, {
          error: error.message,
          logId: logData.id,
          attempt,
          willRetry: attempt < this.retryAttempts
        });

        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    logger.error('AI analysis failed after all retries', {
      error: lastError.message,
      logId: logData.id,
      attempts: this.retryAttempts
    });

    // Emit error event
    this.emit('analysisError', { logData, error: lastError.message });
    throw lastError;
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

  // Get health status for monitoring
  getHealthStatus() {
    return {
      status: 'healthy',
      endpoint: this.aiEndpoint,
      retry_attempts: this.retryAttempts,
      retry_delay: this.retryDelay,
      queue_size: this.analysisQueue.length
    };
  }
}

module.exports = new AIOrchestrator();