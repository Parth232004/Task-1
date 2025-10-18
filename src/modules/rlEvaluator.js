const axios = require('axios');
const EventEmitter = require('eventemitter3');
const logger = require('../utils/logger');

class RLEvaluator extends EventEmitter {
  constructor() {
    super();
    // Use Vijay's MCP bridge for RL evaluation
    this.rlEndpoint = process.env.RL_BACKEND_URL || 'http://localhost:8002/feedback';
    this.dashboardEndpoint = process.env.DASHBOARD_URL || 'http://localhost:3003/update';
    this.retryAttempts = 3;
    this.retryDelay = 1000;
  }

  // Evaluate analysis and determine reward/penalty using Vijay's RL system
  async evaluateAnalysis(analysisData) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const { logData, analysis } = analysisData;

        logger.logRLAction('Starting evaluation', { logId: logData.id, analysisResult: analysis.response || analysis.result });

        // Calculate reward based on analysis quality and log metrics
        const reward = this.calculateRewardFromAnalysis(logData, analysis);

        // Send feedback to Vijay's RL system
        const feedbackPayload = {
          task_id: logData.id,
          rating: Math.max(1, Math.min(5, Math.round((reward + 2) * 1.25))), // Convert reward to 1-5 scale
          feedback_text: `Analysis quality: ${analysis.response || 'completed'}`,
          useful: reward > 0,
          agent_used: 'workflow_ai_analyzer',
          user_id: logData.userId || 'system'
        };

        const response = await axios.post(this.rlEndpoint, feedbackPayload, {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' }
        });

        const evaluation = {
          id: `eval-${Date.now()}`,
          reward: reward,
          penalty: reward < 0 ? Math.abs(reward) : 0,
          action: reward > 0 ? 'positive_reinforcement' : 'negative_reinforcement',
          confidence: 0.8,
          feedback_response: response.data
        };

        logger.logRLAction('Evaluation completed', {
          logId: logData.id,
          reward: evaluation.reward,
          penalty: evaluation.penalty,
          action: evaluation.action
        });

        // Update dashboard
        await this.updateDashboard(evaluation);

        // Emit completion event
        this.emit('evaluationComplete', { logData, analysis, evaluation });

        return evaluation;
      } catch (error) {
        lastError = error;
        logger.warn(`RL evaluation attempt ${attempt} failed`, {
          error: error.message,
          logId: analysisData.logData?.id,
          attempt,
          willRetry: attempt < this.retryAttempts
        });

        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    logger.error('RL evaluation failed after all retries', {
      error: lastError.message,
      logId: analysisData.logData?.id,
      attempts: this.retryAttempts
    });

    this.emit('evaluationError', { analysisData, error: lastError.message });
    throw lastError;
  }

  // Calculate reward based on analysis quality and log characteristics
  calculateRewardFromAnalysis(logData, analysis) {
    let reward = 0;

    // Base reward for successful analysis
    if (analysis.status === 200 || analysis.status === 'success') {
      reward += 1.0;
    }

    // Reward for detailed analysis
    const response = analysis.response || analysis.result || '';
    if (response.length > 50) {
      reward += 0.5;
    }

    // Reward for actionable insights
    if (response.toLowerCase().includes('recommend') ||
        response.toLowerCase().includes('suggest') ||
        response.toLowerCase().includes('action')) {
      reward += 0.3;
    }

    // Penalty for errors or incomplete analysis
    if (analysis.status === 500 || analysis.error) {
      reward -= 1.0;
    }

    // Context-based rewards
    if (logData.type === 'alert' || logData.type === 'error') {
      reward += 0.2; // Higher reward for analyzing important logs
    }

    return reward;
  }

  // Handle task completion evaluation
  async evaluateTaskCompletion(taskData, analysis) {
    try {
      const evaluation = await this.evaluateAnalysis({
        logData: {
          id: `task-${taskData.id}`,
          type: 'task_completion',
          message: `Task ${taskData.id} completed`,
          metadata: taskData,
          source: 'workflow'
        },
        analysis
      });

      return evaluation;
    } catch (error) {
      logger.error('Task completion evaluation failed', { taskId: taskData.id, error: error.message });
      throw error;
    }
  }

  // Update dashboard with evaluation results
  async updateDashboard(evaluation) {
    try {
      await axios.post(this.dashboardEndpoint, {
        evaluation,
        timestamp: new Date().toISOString(),
        source: 'RL_Evaluator'
      });

      logger.info('Dashboard updated', { evaluationId: evaluation.id });
    } catch (error) {
      logger.error('Dashboard update failed', { error: error.message });
      // Don't throw here, as evaluation is still valid
    }
  }

  // Get evaluation history
  getEvaluationHistory(limit = 10) {
    // In a real implementation, this would query a database
    return [];
  }

  // Get health status for monitoring
  getHealthStatus() {
    return {
      status: 'healthy',
      endpoint: this.rlEndpoint,
      retry_attempts: this.retryAttempts,
      retry_delay: this.retryDelay
    };
  }
}

module.exports = new RLEvaluator();