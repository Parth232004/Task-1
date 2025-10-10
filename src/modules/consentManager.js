const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class ConsentManager {
  constructor() {
    this.consentStore = new Map();
    this.consentFile = path.join(__dirname, '../../data/consent.json');
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
  setConsent(userId, consentData) {
    const consent = {
      userId,
      monitoringEnabled: consentData.monitoring_enabled || consentData.consentGiven || false,
      dataCategories: consentData.data_categories || consentData.metadata?.dataCategories || ['all'],
      retentionDays: consentData.retention_days || consentData.metadata?.retentionDays || 90,
      lastUpdated: new Date().toISOString(),
      source: 'sankalp'
    };

    this.consentStore.set(userId, consent);
    this.saveConsentData();

    logger.info('Consent updated for user', {
      userId,
      monitoringEnabled: consent.monitoringEnabled
    });

    return consent;
  }

  // Get consent for a user
  getConsent(userId) {
    return this.consentStore.get(userId) || null;
  }

  // Check if user has consented to monitoring
  hasMonitoringConsent(userId) {
    const consent = this.getConsent(userId);
    if (!consent) {
      return false; // Default to no consent if not found
    }

    // Check if consent has expired (simplified - could add expiration logic)
    return consent.monitoringEnabled;
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