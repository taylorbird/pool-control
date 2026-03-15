const { createPoller } = require('../src/poller');
const { createState } = require('../src/state');
const fs = require('fs');
const path = require('path');

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
}

describe('poller', () => {
  let state;

  beforeEach(() => {
    state = createState();
  });

  test('poll updates equipment state from gateway response', async () => {
    const mockPollFn = jest.fn().mockResolvedValue(loadFixture('air-temp.html'));
    const poller = createPoller(state, { interval: 100, pollFn: mockPollFn });

    await poller.pollOnce();

    const snapshot = state.getSnapshot();
    expect(snapshot.mode).toBe('pool');
    expect(snapshot.equipment.filter.on).toBe(true);
    expect(snapshot.equipment.lights.on).toBe(true);
    expect(snapshot.sensors.airTemp).toBe(85);
    expect(snapshot.lastUpdated).not.toBeNull();
  });

  test('poll updates sensor values as LCD screens cycle', async () => {
    const screens = ['air-temp.html', 'salt-level.html', 'filter-speed.html'];
    let callCount = 0;
    const mockPollFn = jest.fn().mockImplementation(() => {
      return Promise.resolve(loadFixture(screens[callCount++ % screens.length]));
    });
    const poller = createPoller(state, { interval: 100, pollFn: mockPollFn });

    await poller.pollOnce();
    await poller.pollOnce();
    await poller.pollOnce();

    const snapshot = state.getSnapshot();
    expect(snapshot.sensors.airTemp).toBe(85);
    expect(snapshot.sensors.saltLevel).toBe(3000);
    expect(snapshot.sensors.filterSpeed).toBe('50% Speed2');
  });

  test('poll handles errors without crashing', async () => {
    const mockPollFn = jest.fn().mockRejectedValue(new Error('Network error'));
    const poller = createPoller(state, { interval: 100, pollFn: mockPollFn });

    await poller.pollOnce();

    const snapshot = state.getSnapshot();
    expect(snapshot.lastUpdated).toBeNull();
  });

  test('start and stop control the polling loop', () => {
    const mockPollFn = jest.fn().mockResolvedValue(loadFixture('air-temp.html'));
    const poller = createPoller(state, { interval: 100, pollFn: mockPollFn });

    expect(poller.isRunning()).toBe(false);
    poller.start();
    expect(poller.isRunning()).toBe(true);
    poller.stop();
    expect(poller.isRunning()).toBe(false);
  });
});
