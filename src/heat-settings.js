const { parseMenuScreen, parseHeatSettingValue } = require('./parser');

const KEY_MENU = '02';
const KEY_RIGHT = '01';
const MAX_MENU_ATTEMPTS = 10;
const MAX_SCREEN_POLLS = 3;

function createHeatSettingsFetcher({ sendCommand, pollGateway, poller, state, stepDelay = 700 }) {
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

  // The Settings Menu screen itself shows "Settings / Menu" — each item,
  // including the first, is reached with a RIGHT press. The display can lag
  // behind the keypress, so re-poll a few times before giving up. Verify the
  // label so a misaligned menu never gets parsed as a set point.
  async function readSetting(expectedLabel) {
    await sendCommand(KEY_RIGHT);
    let lastSeen = null;
    for (let i = 0; i < MAX_SCREEN_POLLS; i++) {
      await delay(stepDelay);
      const screen = parseMenuScreen(await pollGateway());
      if (screen.line1.includes(expectedLabel)) {
        return parseHeatSettingValue(screen.line2);
      }
      lastSeen = screen.line1;
    }
    throw new Error(`Expected "${expectedLabel}" screen, got "${lastSeen}"`);
  }

  // After a failed fetch the display may be stranded mid-menu, which blinds
  // sensor polling until the panel times out (~90s). Try to exit cleanly;
  // if this fails too, the timeout gets us home anyway.
  async function recoverDisplay() {
    try {
      await navigateToDefaultMenu();
      await sendCommand(KEY_RIGHT);
    } catch (_) {
      // best effort only
    }
  }

  async function fetch() {
    if (busy) {
      throw new Error('Heat settings fetch already in progress');
    }

    busy = true;
    poller.stop();

    try {
      await navigateToSettingsMenu();

      const spaHeater = await readSetting('Spa Heater1');
      const poolHeater = await readSetting('Pool Heater1');
      const spaSolar = await readSetting('Spa Solar');
      const poolSolar = await readSetting('Pool Solar');

      await navigateToDefaultMenu();
      await sendCommand(KEY_RIGHT); // RIGHT from Default Menu resumes the cycling display

      const settings = { spaHeater, poolHeater, spaSolar, poolSolar };
      state.updateHeatSettings(settings);
      return settings;
    } catch (err) {
      await recoverDisplay();
      throw err;
    } finally {
      busy = false;
      poller.start();
    }
  }

  return { fetch };
}

module.exports = { createHeatSettingsFetcher };
