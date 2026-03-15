const COMMAND_MAP = {
  mode: '07',
  filter: '08',
  lights: '09',
  spaLights: '0A',
  waterfall: '0B',
  solarHeater: '11',
};

function createCommandQueue(sendCommandFn, { commandDelay = 500 } = {}) {
  let busy = false;

  async function execute(command, keyId) {
    if (busy) {
      return { success: false, error: 'Command in progress, try again' };
    }

    busy = true;
    try {
      await sendCommandFn(keyId);
      await new Promise((r) => setTimeout(r, commandDelay));
      return { success: true, command };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      busy = false;
    }
  }

  return { execute, COMMAND_MAP };
}

module.exports = { createCommandQueue, COMMAND_MAP };
