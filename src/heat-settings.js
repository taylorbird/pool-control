const { parseMenuScreen, parseHeatSettingValue } = require('./parser');

const KEY_MENU = '02';
const KEY_RIGHT = '01';
const MAX_MENU_ATTEMPTS = 10;

function createHeatSettingsFetcher({ sendCommand, pollGateway, poller, state, stepDelay = 500 }) {
  let busy = false;

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function sendAndRead(keyId) {
    await sendCommand(keyId);
    await delay(stepDelay);
    return pollGateway();
  }

  async function navigateToSettingsMenu() {
    for (let i = 0; i < MAX_MENU_ATTEMPTS; i++) {
      const html = await sendAndRead(KEY_MENU);
      const screen = parseMenuScreen(html);
      if (screen.line1.includes('Settings') && screen.line2.includes('Menu')) {
        return;
      }
    }
    throw new Error('Could not reach Settings Menu');
  }

  async function navigateToDefaultMenu() {
    for (let i = 0; i < MAX_MENU_ATTEMPTS; i++) {
      const html = await sendAndRead(KEY_MENU);
      const screen = parseMenuScreen(html);
      if (screen.line1.includes('Default') && screen.line2.includes('Menu')) {
        return;
      }
    }
    throw new Error('Could not reach Default Menu');
  }

  async function readCurrentScreen() {
    const html = await pollGateway();
    const screen = parseMenuScreen(html);
    return parseHeatSettingValue(screen.line2);
  }

  async function readNextScreen() {
    const html = await sendAndRead(KEY_RIGHT);
    const screen = parseMenuScreen(html);
    return parseHeatSettingValue(screen.line2);
  }

  async function fetch() {
    if (busy) {
      throw new Error('Heat settings fetch already in progress');
    }

    busy = true;
    poller.stop();

    try {
      await navigateToSettingsMenu();

      const spaHeater = await readCurrentScreen();
      const poolHeater = await readNextScreen();
      const spaSolar = await readNextScreen();
      const poolSolar = await readNextScreen();

      await navigateToDefaultMenu();
      await sendCommand(KEY_MENU); // one more MENU to resume cycling

      const settings = { spaHeater, poolHeater, spaSolar, poolSolar };
      state.updateHeatSettings(settings);
      return settings;
    } finally {
      busy = false;
      poller.start();
    }
  }

  return { fetch };
}

module.exports = { createHeatSettingsFetcher };
