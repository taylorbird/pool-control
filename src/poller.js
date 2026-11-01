const { pollGateway } = require('./gateway');
const { parseGatewayResponse } = require('./parser');

// The gateway is a small embedded HTTP server that locks up under sustained
// load, so poll slowly by default and only speed up briefly after a command
// (see boost()) so the new equipment state shows up quickly.
const DEFAULT_INTERVAL = 15000;
const DEFAULT_FAST_INTERVAL = 1000;
const DEFAULT_FAST_DURATION = 10000;

function createPoller(state, {
  interval = DEFAULT_INTERVAL,
  fastInterval = DEFAULT_FAST_INTERVAL,
  fastDuration = DEFAULT_FAST_DURATION,
  pollFn = pollGateway,
  heatSettingsFetch = null,
  heatSettingsInterval = 3600,
} = {}) {
  let timerId = null;
  let running = false;
  // Each start() begins a new generation; a loop from an older generation
  // must not reschedule itself. Without this, stop()+start() from inside a
  // poll (the heat-settings fetch does exactly that) leaves two loops running.
  let generation = 0;
  let fastUntil = 0;
  let lastHeatSettingsFetch = 0;

  async function maybeFetchHeatSettings() {
    if (!heatSettingsFetch) return;

    const now = Date.now();
    const elapsed = (now - lastHeatSettingsFetch) / 1000;
    if (elapsed >= heatSettingsInterval) {
      lastHeatSettingsFetch = now;
      try {
        await heatSettingsFetch();
      } catch (err) {
        console.error('Heat settings fetch error:', err.message);
      }
    }
  }

  async function pollOnce() {
    try {
      const html = await pollFn();
      const result = parseGatewayResponse(html);

      state.updateEquipment(result.equipment);

      if (result.sensor) {
        state.updateSensor(result.sensor.name, result.sensor.value);
      }

      if (result.system) {
        state.updateSystem(result.system);
      }

      state.updateTimestamp(new Date().toISOString());
    } catch (err) {
      console.error('Poll error:', err.message);
    }

    await maybeFetchHeatSettings();
  }

  function nextDelay() {
    return Date.now() < fastUntil ? fastInterval : interval;
  }

  function schedule(gen, delay) {
    timerId = setTimeout(() => loop(gen), delay);
  }

  async function loop(gen) {
    timerId = null;
    await pollOnce();
    if (running && gen === generation && !timerId) {
      schedule(gen, nextDelay());
    }
  }

  function start() {
    if (running) return;
    running = true;
    generation += 1;
    loop(generation);
    console.log(`Poller started (interval: ${interval}ms, fast: ${fastInterval}ms for ${fastDuration}ms after commands)`);
  }

  // Poll at fastInterval for the next fastDuration ms, e.g. right after a
  // command so the changed LED state is picked up within about a second.
  function boost() {
    fastUntil = Date.now() + fastDuration;
    if (running && timerId) {
      clearTimeout(timerId);
      schedule(generation, fastInterval);
    }
    // If a poll is in flight, the loop reschedules with nextDelay() when it
    // finishes, which now returns fastInterval.
  }

  function stop() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    running = false;
  }

  function isRunning() {
    return running;
  }

  return { start, stop, isRunning, pollOnce, boost };
}

module.exports = { createPoller };
