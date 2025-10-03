# AI-Driven RL Workflow Automation

**Task 4: Full EMS + AI Automation Integration**

This system connects EMS logs → AI orchestrator → RL evaluation in seamless automation pipelines, ensuring events flow correctly between modules.

## Architecture Overview

```
EMS Logs → AI Orchestrator → RL Evaluator → Dashboard
    ↓           ↓              ↓            ↓
Triggers   Analysis       Rewards/      Updates
(/alerts,   (Vijay)       Penalties     (Nisarg)
/pause,                  (Noopur)
/consent)
```

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Update `.env` with actual service URLs from Vijay, Sankalp, and Nisarg.

3. **Start the System**
   ```bash
   npm start
   ```

4. **Run Integration Tests**
   ```bash
   npm test
   ```

## API Endpoints

### Core Automation Pipeline

- `POST /api/logs` - Ingest EMS logs
- `POST /api/tasks/complete` - Trigger task completion pipeline
- `GET /health` - System health check

### Event Triggers

- `POST /api/alerts` - Trigger alert events
- `POST /api/pause` - Pause orchestration
- `POST /api/consent` - Handle consent events
- `GET /api/status` - Get orchestration status
- `GET /api/logs` - Get recent logs

## Integration Points for Team Members

### From Vijay (AI Backend & Orchestration)
- **Endpoint**: `POST /analyze`
- **Payload**:
  ```json
  {
    "log": {
      "id": "string",
      "type": "string",
      "message": "string",
      "metadata": {}
    },
    "timestamp": "ISO string"
  }
  ```
- **Response**:
  ```json
  {
    "result": "string",
    "confidence": "number",
    "insights": ["string"],
    "recommendation": "string"
  }
  ```

### From Noopur (RL & Workflow Automation)
- **Endpoint**: `POST /evaluate`
- **Payload**:
  ```json
  {
    "logData": {},
    "analysis": {},
    "timestamp": "ISO string"
  }
  ```
- **Response**:
  ```json
  {
    "id": "string",
    "reward": "number",
    "penalty": "number",
    "action": "string",
    "confidence": "number"
  }
  ```

### From Sankalp (Compliance & Audit Layer)
- **Endpoint**: `POST /check` (configured in `.env`)
- Compliance checks are integrated into the pipeline automatically.

### To Nisarg (Dashboard Integration)

#### Dashboard Update Endpoint
- **Endpoint**: `POST /update`
- **Payload**:
  ```json
  {
    "evaluation": {
      "id": "string",
      "reward": "number",
      "penalty": "number",
      "action": "string"
    },
    "timestamp": "ISO string",
    "source": "RL_Evaluator"
  }
  ```

#### Real-time Event Streaming
The system emits events that can be consumed by the dashboard:
- `pipelineComplete` - Full pipeline completion
- `taskPipelineComplete` - Task-specific completion
- `error` - System errors

#### Integration Example
```javascript
// Connect to orchestration events
const orchestrator = require('./src/modules/orchestrator');

orchestrator.on('pipelineComplete', (data) => {
  // Update dashboard with evaluation results
  updateDashboard(data.evaluation);
});

orchestrator.on('taskPipelineComplete', (data) => {
  // Update task-specific metrics
  updateTaskMetrics(data.taskData, data.evaluation);
});
```

## Event Flow Monitoring

The system monitors event consistency:
- EMS logs received vs AI analyses completed
- AI analyses vs RL evaluations completed
- Automatic alerts on inconsistencies

Check status: `GET /api/status`

## Logging

Structured logs for RL and AI agents:
- **AI Analysis**: `{ agent: 'AI', action: 'analysis', data }`
- **RL Actions**: `{ agent: 'RL', action: 'evaluation', data }`

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Errors only
- Console (development mode)

## Configuration

Environment variables in `.env`:
```env
NODE_ENV=development
LOG_LEVEL=info
AI_BACKEND_URL=http://localhost:3001/analyze
RL_BACKEND_URL=http://localhost:3002/evaluate
DASHBOARD_URL=http://localhost:3003/update
COMPLIANCE_URL=http://localhost:3004/check
PORT=3000
```

## Testing

Run integration tests:
```bash
npm test
```

Tests include:
- EMS log ingestion
- Event triggers (/alerts, /pause, /consent)
- Task completion pipeline
- Event consistency monitoring

## Development

```bash
# Development mode with auto-restart
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Monitoring & Debugging

- **Health Check**: `GET /health`
- **Status**: `GET /api/status`
- **Recent Logs**: `GET /api/logs?limit=10`
- **Event Consistency**: Check status endpoint for pipeline metrics

## Security & Compliance

- All events are logged for audit trails
- Compliance checks integrated via Sankalp's service
- Structured logging for regulatory requirements
- Event triggers include metadata for tracking

## Deployment

1. Update `.env` with production URLs
2. Set `NODE_ENV=production`
3. Run `npm start`
4. Monitor logs and health endpoints

## Support

For integration issues:
- Vijay: AI backend connectivity
- Sankalp: Compliance & audit integration
- Noopur: RL evaluation pipeline
- Nisarg: Dashboard updates
- Parth: Overall orchestration & event flow