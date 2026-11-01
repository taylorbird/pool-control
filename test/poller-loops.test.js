const { createPoller } = require('../src/poller');
const { createState } = require('../src/state');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'air-temp.html'), 'utf-8');

// Let pending promise callbacks run between fake-timer advances.
const flush = () => new Promise((r) => jest.requireActual('timers').setImmediate(r));

async function advance(ms, step = 100) {
  for (let t = 0; t < ms; t += step) {
    jest.advanceTimersByTime(step);
    await flush();
  }
}

describe('poller loop count', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('a heat-settings fetch that stops/starts the poller does not spawn a second loop', async () => {
    const pollFn = jest.fn().mockResolvedValue(html);
    let poller;
    // Mirrors heat-settings.js: stop() at the start, start() in finally —
    // and it is invoked from inside pollOnce().
    const heatSettingsFetch = jest.fn(async () => {
      poller.stop();
      poller.start();
    });
    poller = createPoller(createState(), {
      interval: 1000,
      pollFn,
      heatSettingsFetch,
      heatSettingsInterval: 3600,
    });

    poller.start();
    await advance(500); // startup poll + startup heat fetch settle
    pollFn.mockClear();

    await advance(10000);
    poller.stop();

    // One loop at 1000ms over 10s = ~10 polls. Two loops would be ~20.
    expect(pollFn.mock.calls.length).toBeLessThanOrEqual(11);
  });

  test('defaults to a slow idle interval (15s)', async () => {
    const pollFn = jest.fn().mockResolvedValue(html);
    const poller = createPoller(createState(), { pollFn });

    poller.start();
    await advance(500);
    pollFn.mockClear();

    await advance(60000, 500);
    poller.stop();

    expect(pollFn.mock.calls.length).toBe(4);
  });

  test('boost() polls fast for the window, then drops back to idle', async () => {
    const pollFn = jest.fn().mockResolvedValue(html);
    const poller = createPoller(createState(), {
      pollFn,
      interval: 15000,
      fastInterval: 1000,
      fastDuration: 10000,
    });

    poller.start();
    await advance(500);
    pollFn.mockClear();

    poller.boost();
    await advance(10000);
    const fastPolls = pollFn.mock.calls.length;
    expect(fastPolls).toBeGreaterThanOrEqual(9);
    expect(fastPolls).toBeLessThanOrEqual(11);

    pollFn.mockClear();
    await advance(30000, 500);
    poller.stop();
    // Back to 15s idle: ~2 polls in 30s, not ~30.
    expect(pollFn.mock.calls.length).toBeLessThanOrEqual(3);
  });

  test('boost() while stopped does not start polling', async () => {
    const pollFn = jest.fn().mockResolvedValue(html);
    const poller = createPoller(createState(), { pollFn });

    poller.boost();
    await advance(5000);

    expect(pollFn).not.toHaveBeenCalled();
    expect(poller.isRunning()).toBe(false);
  });
});
