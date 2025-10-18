const axios = require('axios');
const EventEmitter = require('eventemitter3');
const logger = require('../utils/logger');

class DashboardIntegration extends EventEmitter {
  constructor() {
    super();
    this.dashboardEndpoints = [
      process.env.DASHBOARD_URL_1,
      process.env.DASHBOARD_URL_2
    ].filter(Boolean);

    this.websocketUrl = process.env.DASHBOARD_WS_URL;
    this.apiKey = process.env.DASHBOARD_API_KEY || 'dashboard-key';
    this.retryAttempts = 3;
    this.retryDelay = 2000;
    this.isConnected = false;
    this.websocket = null;
  }

  // Send real-time update to Nisarg's dashboard
  async sendRealtimeUpdate(eventType, data) {
    const payload = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data: data,
      source: 'workflow_automation'
    };

    // Send to all configured dashboard endpoints
    const promises = this.dashboardEndpoints.map(endpoint =>
      this.sendToEndpoint(endpoint, payload)
    );

    // Also send via WebSocket if connected
    if (this.websocket && this.isConnected) {
      this.sendViaWebSocket(payload);
    }

    await Promise.allSettled(promises);
  }

  // Send update to specific dashboard endpoint
  async sendToEndpoint(endpoint, payload) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        await axios.post(`${endpoint}/api/realtime`, payload, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });

        logger.debug('Dashboard update sent', {
          endpoint,
          eventType: payload.type,
          attempt
        });
        return;

      } catch (error) {
        lastError = error;
        logger.warn(`Dashboard update attempt ${attempt} failed`, {
          endpoint,
          error: error.message,
          attempt,
          willRetry: attempt < this.retryAttempts
        });

        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    logger.error('Failed to send dashboard update after all retries', {
      endpoint,
      error: lastError.message,
      attempts: this.retryAttempts
    });
  }

  // Send via WebSocket connection
  sendViaWebSocket(payload) {
    try {
      if (this.websocket && this.websocket.readyState === 1) { // OPEN
        this.websocket.send(JSON.stringify(payload));
        logger.debug('Dashboard update sent via WebSocket', {
          eventType: payload.type
        });
      }
    } catch (error) {
      logger.error('WebSocket send failed', { error: error.message });
      this.isConnected = false;
    }
  }

  // Connect to dashboard WebSocket
  connectWebSocket() {
    if (!this.websocketUrl || this.websocket) return;

    try {
      const WebSocket = require('ws');
      this.websocket = new WebSocket(this.websocketUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      this.websocket.on('open', () => {
        this.isConnected = true;
        logger.info('Connected to dashboard WebSocket', { url: this.websocketUrl });
      });

      this.websocket.on('close', () => {
        this.isConnected = false;
        logger.warn('Dashboard WebSocket connection closed');
        // Auto-reconnect after delay
        setTimeout(() => this.connectWebSocket(), 5000);
      });

      this.websocket.on('error', (error) => {
        logger.error('Dashboard WebSocket error', { error: error.message });
        this.isConnected = false;
      });

      this.websocket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleDashboardMessage(message);
        } catch (error) {
          logger.error('Error parsing dashboard message', { error: error.message });
        }
      });

    } catch (error) {
      logger.error('Failed to connect to dashboard WebSocket', { error: error.message });
    }
  }

  // Handle messages from dashboard
  handleDashboardMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'request_workflow_stats':
        this.emit('statsRequested', data);
        break;
      case 'pause_workflow':
        this.emit('pauseRequested', data);
        break;
      case 'resume_workflow':
        this.emit('resumeRequested', data);
        break;
      default:
        logger.debug('Unknown dashboard message type', { type });
    }
  }

  // Send workflow statistics to dashboard
  async sendWorkflowStats(stats) {
    await this.sendRealtimeUpdate('workflow_stats', stats);
  }

  // Send pipeline completion event
  async sendPipelineComplete(pipelineData) {
    await this.sendRealtimeUpdate('pipeline_complete', {
      taskId: pipelineData.logData?.id,
      analysis: pipelineData.analysis,
      evaluation: pipelineData.evaluation,
      processingTime: pipelineData.evaluation?.processing_time || 0
    });
  }

  // Send error event
  async sendError(errorData) {
    await this.sendRealtimeUpdate('workflow_error', {
      error: errorData.error,
      source: errorData.source,
      logId: errorData.logData?.id,
      timestamp: new Date().toISOString()
    });
  }

  // Send consent update
  async sendConsentUpdate(consentData) {
    await this.sendRealtimeUpdate('consent_update', consentData);
  }

  // Send RL learning update
  async sendRLUpdate(rlData) {
    await this.sendRealtimeUpdate('rl_learning', rlData);
  }

  // Get dashboard health status
  async getHealthStatus() {
    const results = {};

    // Check HTTP endpoints
    for (const endpoint of this.dashboardEndpoints) {
      try {
        const response = await axios.get(`${endpoint}/health`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
          timeout: 3000
        });
        results[endpoint] = { status: 'healthy', ...response.data };
      } catch (error) {
        results[endpoint] = { status: 'unhealthy', error: error.message };
      }
    }

    // Check WebSocket
    results.websocket = {
      status: this.isConnected ? 'connected' : 'disconnected',
      url: this.websocketUrl
    };

    return results;
  }

  // Initialize dashboard integration
  initialize() {
    // Connect WebSocket if configured
    if (this.websocketUrl) {
      this.connectWebSocket();
    }

    logger.info('Dashboard integration initialized', {
      endpoints: this.dashboardEndpoints.length,
      websocket: !!this.websocketUrl
    });
  }

  // Cleanup resources
  cleanup() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
      this.isConnected = false;
    }
    logger.info('Dashboard integration cleaned up');
  }
}

module.exports = new DashboardIntegration();