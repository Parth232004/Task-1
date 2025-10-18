const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');

class ConsentManager {
  constructor() {
    this.consentStore = new Map();
    this.consentFile = path.join(__dirname, '../../data/consent.json');
    // Sankalp's consent API endpoint
    this.consentApiUrl = process.env.CONSENT_API_URL || 'http://localhost:8000/compliance/consent';
    this.apiKey = process.env.CONSENT_API_KEY || 'uniguru-dev-key-2025';
    this.useApi = process.env.USE_CONSENT_API === 'true';
    this.loadConsentData();
  }

  // Load consent data from file
  loadConsentData() {
    try {
      if (fs.existsSync(this.consentFile)) {
        const data = fs.readFileSync(this.consentFile, 'utf8');
        const consentData = JSON.parse(data);
        // Convert back to Map
        Object.entries(consentData).forEach(([userId, consent]) => {
          this.consentStore.set(userId, consent);
        });
        logger.info('Consent data loaded', { users: this.consentStore.size });
      } else {
        // Create directory if it doesn't exist
        const dir = path.dirname(this.consentFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        logger.info('No existing consent data found, starting fresh');
      }
    } catch (error) {
      logger.error('Error loading consent data', { error: error.message });
    }
  }

  // Save consent data to file
  saveConsentData() {
    try {
      const data = Object.fromEntries(this.consentStore);
      fs.writeFileSync(this.consentFile, JSON.stringify(data, null, 2));
      logger.debug('Consent data saved');
    } catch (error) {
      logger.error('Error saving consent data', { error: error.message });
    }
  }

  // Set consent for a user
  async setConsent(userId, consentData) {
    const consent = {
      userId,
      monitoringEnabled: consentData.monitoring_enabled || consentData.consentGiven || false,
      dataCategories: consentData.data_categories || consentData.metadata?.dataCategories || ['all'],
      retentionDays: consentData.retention_days || consentData.metadata?.retentionDays || 90,
      lastUpdated: new Date().toISOString(),
      source: 'sankalp'
    };

    // Try to sync with Sankalp's API if enabled
    if (this.useApi) {
      try {
        const apiPayload = {
          employee_id: userId,
          monitoring_enabled: consent.monitoringEnabled,
          retention_days: consent.retentionDays,
          data_categories: consent.dataCategories
        };

        const response = await axios.post(this.consentApiUrl, apiPayload, {
          headers: {
            'X-API-Key': this.apiKey,
            'X-User-ID': 'system'
          },
          timeout: 5000
        });

        logger.info('Consent synced with Sankalp API', { userId, apiResponse: response.data });
      } catch (error) {
        logger.warn('Failed to sync consent with Sankalp API, using local storage', {
          userId,
          error: error.message
        });
      }
    }

    this.consentStore.set(userId, consent);
    this.saveConsentData();

    logger.info('Consent updated for user', {
      userId,
      monitoringEnabled: consent.monitoringEnabled,
      syncedWithApi: this.useApi
    });

    return consent;
  }

  // Get consent for a user
  async getConsent(userId) {
    // Try to get from API first if enabled
    if (this.useApi) {
      try {
        const response = await axios.get(`${this.consentApiUrl}/${userId}`, {
          headers: {
            'X-API-Key': this.apiKey,
            'X-User-ID': 'system'
          },
          timeout: 5000
        });

        if (response.data && response.data.status === 'success') {
          const apiConsent = response.data;
          // Cache locally
          this.consentStore.set(userId, apiConsent);
          return apiConsent;
        }
      } catch (error) {
        logger.warn('Failed to get consent from Sankalp API, using local cache', {
          userId,
          error: error.message
        });
      }
    }

    // Fallback to local storage
    return this.consentStore.get(userId) || null;
  }

  // Check if user has consented to monitoring
  async hasMonitoringConsent(userId) {
    const consent = await this.getConsent(userId);
    if (!consent) {
      return false; // Default to no consent if not found
    }

    // Check if consent has expired (simplified - could add expiration logic)
    return consent.monitoring_enabled || consent.monitoringEnabled;
  }

  // Get health status for monitoring
  async getHealthStatus() {
    try {
      // Test API connectivity if enabled
      if (this.useApi && this.consentApiUrl) {
        const response = await axios.get(`${this.consentApiUrl.replace('/consent', '/health')}`, {
          headers: { 'X-API-Key': this.apiKey },
          timeout: 3000
        });
        return { status: 'healthy', api_connected: true, response_time: response.data.response_time || 0 };
      }

      return { status: 'healthy', api_connected: false, local_storage: true };
    } catch (error) {
      return { status: 'degraded', error: error.message, api_connected: false };
    }
  }

  // Get all consents
  getAllConsents() {
    return Array.from(this.consentStore.values());
  }

  // Remove consent for a user
  removeConsent(userId) {
    const removed = this.consentStore.delete(userId);
    if (removed) {
      this.saveConsentData();
      logger.info('Consent removed for user', { userId });
    }
    return removed;
  }
}

module.exports = new ConsentManager();