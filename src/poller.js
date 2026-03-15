const { pollGateway } = require('./gateway');
const { parseGatewayResponse } = require('./parser');

function createPoller(state, { interval = 500, pollFn = pollGateway } = {}) {
  let timerId = null;
  let running = false;

  async function pollOnce() {
    try {
      const html = await pollFn();
      const result = parseGatewayResponse(html);

      state.updateEquipment(result.equipment);

      if (result.sensor) {
        state.updateSensor(result.sensor.name, result.sensor.value);
      }

      state.updateTimestamp(new Date().toISOString());
    } catch (err) {
      console.error('Poll error:', err.message);
    }
  }

  async function loop() {
    await pollOnce();
    if (running) {
      timerId = setTimeout(loop, interval);
    }
  }

  function start() {
    if (running) return;
    running = true;
    loop();
    console.log(`Poller started (interval: ${interval}ms)`);
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

  return { start, stop, isRunning, pollOnce };
}

module.exports = { createPoller };
