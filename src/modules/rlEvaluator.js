const axios = require('axios');
const EventEmitter = require('eventemitter3');
const logger = require('../utils/logger');

class RLEvaluator extends EventEmitter {
  constructor() {
    super();
    this.rlEndpoint = process.env.RL_BACKEND_URL || 'http://localhost:3002/evaluate';
    this.dashboardEndpoint = process.env.DASHBOARD_URL || 'http://localhost:3003/update';
  }

  // Evaluate analysis and determine reward/penalty
  async evaluateAnalysis(analysisData) {
    try {
      const { logData, analysis } = analysisData;

      logger.logRLAction('Starting evaluation', { logId: logData.id, analysisResult: analysis.result });

      // Send to RL backend for evaluation
      const response = await axios.post(this.rlEndpoint, {
        logData,
        analysis,
        timestamp: new Date().toISOString()
      });

      const evaluation = response.data;
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
      logger.error('RL evaluation failed', { error: error.message, logId: analysisData.logData?.id });
      this.emit('evaluationError', { analysisData, error: error.message });
      throw error;
    }
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
}

module.exports = new RLEvaluator();