const express = require('express');
const request = require('supertest');
const { createState } = require('../src/state');
const { createCommandQueue } = require('../src/commands');
const { mountRoutes } = require('../src/routes');

function createApp() {
  const state = createState();
  const mockSendCommand = jest.fn().mockResolvedValue();
  const queue = createCommandQueue(mockSendCommand, { commandDelay: 0 });
  const app = express();
  mountRoutes(app, state, queue, { isRunning: () => true });
  return { app, state, queue, mockSendCommand };
}

describe('GET /api/status', () => {
  test('returns full state snapshot', async () => {
    const { app, state } = createApp();
    state.updateSensor('airTemp', 85);
    state.updateEquipment({
      mode: 'pool', filter: true, lights: false,
      spaLights: false, waterfall: false, solarHeater: false, heater: false,
    });
    state.updateTimestamp('2026-03-14T12:00:00.000Z');

    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('pool');
    expect(res.body.equipment.filter.on).toBe(true);
    expect(res.body.sensors.airTemp).toBe(85);
    expect(res.body.lastUpdated).toBe('2026-03-14T12:00:00.000Z');
  });
});

describe('GET /api/health', () => {
  test('returns health check', async () => {
    const { app, state } = createApp();
    state.updateTimestamp('2026-03-14T12:00:00.000Z');

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.polling).toBe(true);
    expect(res.body.lastUpdated).toBe('2026-03-14T12:00:00.000Z');
  });
});

describe('POST /api/command/:action', () => {
  test('executes valid command', async () => {
    const { app, mockSendCommand } = createApp();
    const res = await request(app).post('/api/command/filter');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.command).toBe('filter');
    expect(mockSendCommand).toHaveBeenCalledWith('08');
  });

  test('rejects unknown command', async () => {
    const { app } = createApp();
    const res = await request(app).post('/api/command/bogus');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 429 when command in progress', async () => {
    const { app, mockSendCommand } = createApp();
    mockSendCommand.mockImplementation(() => new Promise(r => setTimeout(r, 200)));

    const [res1, res2] = await Promise.all([
      request(app).post('/api/command/filter'),
      request(app).post('/api/command/lights'),
    ]);

    const results = [res1.body, res2.body];
    expect(results.filter(r => r.success).length).toBe(1);
    expect(results.filter(r => !r.success).length).toBe(1);
  });
});
