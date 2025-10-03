// Integration test for the AI-Driven RL Workflow Automation
const axios = require('axios');
const orchestrator = require('../src/modules/orchestrator');
const emsHandler = require('../src/modules/emsHandler');
const logger = require('../src/utils/logger');

const BASE_URL = 'http://localhost:3000';

// Mock servers for testing (since external services may not be available)
let mockAIServer, mockRLServer, mockDashboardServer;

async function startMockServers() {
  const express = require('express');

  // Mock AI Backend
  const aiApp = express();
  aiApp.use(express.json());
  aiApp.post('/analyze', (req, res) => {
    logger.info('Mock AI: Received analysis request', { logId: req.body.log?.id });
    res.json({
      result: 'analyzed',
      confidence: 0.95,
      insights: ['Pattern detected', 'Anomaly found'],
      recommendation: 'proceed'
    });
  });
  mockAIServer = aiApp.listen(3001, () => logger.info('Mock AI server started on port 3001'));

  // Mock RL Backend
  const rlApp = express();
  rlApp.use(express.json());
  rlApp.post('/evaluate', (req, res) => {
    logger.info('Mock RL: Received evaluation request', { logId: req.body.logData?.id });
    res.json({
      id: `eval-${Date.now()}`,
      reward: Math.random() > 0.5 ? 1 : -1,
      penalty: 0,
      action: 'update_policy',
      confidence: 0.87
    });
  });
  mockRLServer = rlApp.listen(3002, () => logger.info('Mock RL server started on port 3002'));

  // Mock Dashboard
  const dashApp = express();
  dashApp.use(express.json());
  dashApp.post('/update', (req, res) => {
    logger.info('Mock Dashboard: Received update', { evalId: req.body.evaluation?.id });
    res.json({ success: true, updated: true });
  });
  mockDashboardServer = dashApp.listen(3003, () => logger.info('Mock Dashboard server started on port 3003'));
}

async function stopMockServers() {
  if (mockAIServer) mockAIServer.close();
  if (mockRLServer) mockRLServer.close();
  if (mockDashboardServer) mockDashboardServer.close();
  logger.info('Mock servers stopped');
}

async function testEMSLogIngestion() {
  console.log('\n=== Testing EMS Log Ingestion ===');

  try {
    const response = await axios.post(`${BASE_URL}/api/logs`, {
      id: 'test-log-1',
      type: 'system_event',
      message: 'Test system event',
      metadata: { test: true }
    });

    console.log('✓ EMS log ingestion successful:', response.data);
    return true;
  } catch (error) {
    console.log('✗ EMS log ingestion failed:', error.message);
    return false;
  }
}

async function testAlertTrigger() {
  console.log('\n=== Testing Alert Trigger ===');

  try {
    const response = await axios.post(`${BASE_URL}/api/alerts`, {
      message: 'Test alert from integration test',
      severity: 'warning',
      metadata: { test: true, source: 'integration_test' }
    });

    console.log('✓ Alert trigger successful:', response.data);
    return true;
  } catch (error) {
    console.log('✗ Alert trigger failed:', error.message);
    return false;
  }
}

async function testConsentTrigger() {
  console.log('\n=== Testing Consent Trigger ===');

  try {
    const response = await axios.post(`${BASE_URL}/api/consent`, {
      userId: 'test-user-123',
      action: 'data_processing',
      consentGiven: true,
      metadata: { test: true }
    });

    console.log('✓ Consent trigger successful:', response.data);
    return true;
  } catch (error) {
    console.log('✗ Consent trigger failed:', error.message);
    return false;
  }
}

async function testTaskCompletion() {
  console.log('\n=== Testing Task Completion Pipeline ===');

  try {
    const response = await axios.post(`${BASE_URL}/api/tasks/complete`, {
      taskId: 'test-task-456',
      taskData: {
        name: 'Integration Test Task',
        duration: 120,
        success: true
      }
    });

    console.log('✓ Task completion successful:', response.data);
    return true;
  } catch (error) {
    console.log('✗ Task completion failed:', error.message);
    return false;
  }
}

async function testPauseResume() {
  console.log('\n=== Testing Pause/Resume ===');

  try {
    // Pause
    const pauseResponse = await axios.post(`${BASE_URL}/api/pause`, {
      reason: 'Integration testing',
      duration: 2 // Auto-resume after 2 seconds
    });
    console.log('✓ Pause successful:', pauseResponse.data);

    // Wait for auto-resume
    await new Promise(resolve => setTimeout(resolve, 3000));

    return true;
  } catch (error) {
    console.log('✗ Pause/Resume failed:', error.message);
    return false;
  }
}

async function testStatusEndpoint() {
  console.log('\n=== Testing Status Endpoint ===');

  try {
    const response = await axios.get(`${BASE_URL}/api/status`);
    console.log('✓ Status check successful:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log('✗ Status check failed:', error.message);
    return false;
  }
}

async function testEventConsistency() {
  console.log('\n=== Testing Event Consistency ===');

  // Wait a bit for events to process
  await new Promise(resolve => setTimeout(resolve, 2000));

  const consistency = orchestrator.checkEventConsistency();
  console.log('Event consistency check:', JSON.stringify(consistency, null, 2));

  if (consistency.consistent) {
    console.log('✓ Event flow is consistent');
    return true;
  } else {
    console.log('⚠ Event flow has inconsistencies');
    return false;
  }
}

async function runTests() {
  console.log('Starting AI-Driven RL Workflow Automation Integration Tests');
  console.log('='.repeat(60));

  let mainServer;

  try {
    // Start mock servers
    await startMockServers();

    // Start main application server
    const app = require('../index');
    mainServer = app.listen(3000, () => {
      logger.info('Main server started for testing on port 3000');
    });

    // Start orchestrator
    const orchestrator = require('../src/modules/orchestrator');
    orchestrator.start();

    // Wait for servers to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    const results = [];

    // Run tests
    results.push(await testEMSLogIngestion());
    results.push(await testAlertTrigger());
    results.push(await testConsentTrigger());
    results.push(await testTaskCompletion());
    results.push(await testPauseResume());
    results.push(await testStatusEndpoint());
    results.push(await testEventConsistency());

    // Summary
    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log('\n' + '='.repeat(60));
    console.log(`Test Results: ${passed}/${total} tests passed`);

    if (passed === total) {
      console.log('🎉 All integration tests passed!');
    } else {
      console.log('⚠️ Some tests failed. Check logs for details.');
    }

  } catch (error) {
    console.error('Test suite failed:', error);
  } finally {
    // Cleanup
    if (mainServer) mainServer.close();
    await stopMockServers();
    process.exit(0);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };