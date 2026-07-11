# Heat Settings (Read-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read pool/spa heater and solar set points from the AquaConnect gateway's Settings Menu and expose them as API data and HA sensors.

**Architecture:** New `src/heat-settings.js` module handles the multi-step menu navigation sequence (pause poller, send MENU/RIGHT keys, read screens, resume poller). The parser gets a new function to extract set point values from menu screens. State, poller, and routes are extended to store, periodically fetch, and serve heat settings. Four new HA sensors display the set points.

**Tech Stack:** Node 20, Express 5, node-html-parser, Jest, supertest, Python (HA integration), pytest

**Spec:** `docs/superpowers/specs/2026-03-22-heat-settings-design.md`

---

## File Structure

### New Files
- `src/heat-settings.js` — menu navigation sequence, fetches all 4 heat setting screens
- `test/heat-settings.test.js` — tests for the navigation and fetch logic
- `test/fixtures/settings-menu.html` — fixture: "Settings Menu" screen
- `test/fixtures/spa-heater1.html` — fixture: Spa Heater1 set point screen
- `test/fixtures/pool-heater1.html` — fixture: Pool Heater1 "Off" screen
- `test/fixtures/spa-solar.html` — fixture: Spa Solar "Off" screen
- `test/fixtures/pool-solar.html` — fixture: Pool Solar set point screen
- `test/fixtures/default-menu.html` — fixture: "Default Menu" screen

### Modified Files
- `src/parser.js` — add `parseHeatSettingValue()` and `parseMenuScreen()`
- `src/state.js` — add `heatSettings` to data, add `updateHeatSettings()`
- `src/poller.js` — add periodic heat settings fetch trigger
- `src/routes.js` — add `GET /api/heat-settings` route
- `src/index.js` — wire heat settings interval env var, pass deps
- `custom_components/aquaconnect_control/const.py` — add 4 heat setting sensor definitions
- `custom_components/aquaconnect_control/sensor.py` — handle compound heat setting values (enabled + setPoint)
- `tests/ha/conftest.py` — add `heatSettings` to mock status response
- `tests/ha/test_sensor.py` — add heat setting sensor tests

---

## Task 1: Parser — `parseHeatSettingValue()`

**Files:**
- Modify: `src/parser.js`
- Modify: `test/parser.test.js`

- [ ] **Step 1: Write failing tests for `parseHeatSettingValue`**

Add to `test/parser.test.js`:

```js
const { parseHeatSettingValue } = require('../src/parser');

describe('parseHeatSettingValue', () => {
  test('parses temperature with degree symbol entity', () => {
    expect(parseHeatSettingValue('96&#176;F')).toEqual({ enabled: true, setPoint: 96 });
  });

  test('parses temperature with unicode degree symbol', () => {
    expect(parseHeatSettingValue('96\u00b0F')).toEqual({ enabled: true, setPoint: 96 });
  });

  test('parses temperature without degree symbol', () => {
    expect(parseHeatSettingValue('89F')).toEqual({ enabled: true, setPoint: 89 });
  });

  test('parses Off value', () => {
    expect(parseHeatSettingValue('Off')).toEqual({ enabled: false, setPoint: null });
  });

  test('parses Off with surrounding whitespace', () => {
    expect(parseHeatSettingValue('  Off  ')).toEqual({ enabled: false, setPoint: null });
  });

  test('strips span tags', () => {
    expect(parseHeatSettingValue('<span class="WBON">96&#176;F</span>')).toEqual({ enabled: true, setPoint: 96 });
  });

  test('strips span tags around Off', () => {
    expect(parseHeatSettingValue('<span class="WBON">Off</span>')).toEqual({ enabled: false, setPoint: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/parser.test.js --verbose`
Expected: FAIL — `parseHeatSettingValue is not a function`

- [ ] **Step 3: Implement `parseHeatSettingValue`**

Add to `src/parser.js` before the `module.exports` line:

```js
function parseHeatSettingValue(raw) {
  let text = raw.replace(/<[^>]+>/g, '');
  text = text.replace(/&#176;?/g, '').replace(/\u00b0/g, '');
  text = text.replace(/F$/, '').trim();

  if (text.toLowerCase() === 'off') {
    return { enabled: false, setPoint: null };
  }

  const num = parseInt(text, 10);
  return { enabled: true, setPoint: num };
}
```

Update the `module.exports` to include `parseHeatSettingValue`:

```js
module.exports = { parseGatewayResponse, decodeLedString, parseSensor, parseHeatSettingValue };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/parser.test.js --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/parser.test.js
git commit -m "feat: add parseHeatSettingValue to parser"
```

---

## Task 2: Parser — `parseMenuScreen()`

**Files:**
- Modify: `src/parser.js`
- Modify: `test/parser.test.js`

- [ ] **Step 1: Write failing tests for `parseMenuScreen`**

Add to `test/parser.test.js`:

```js
const { parseMenuScreen } = require('../src/parser');

describe('parseMenuScreen', () => {
  test('extracts line1 and line2 from gateway HTML', () => {
    const html = `<html><head></head><body>
     Spa Heater1   xxx
      <span class="WBON">96&#176;F</span>       xxx
TESD5C333333xxx
</body></html>`;
    const result = parseMenuScreen(html);
    expect(result.line1).toBe('Spa Heater1');
    expect(result.line2).toContain('96');
  });

  test('extracts Settings Menu screen', () => {
    const html = `<html><head></head><body>
     Settings      xxx
      Menu         xxx
TESD5C333333xxx
</body></html>`;
    const result = parseMenuScreen(html);
    expect(result.line1).toBe('Settings');
    expect(result.line2).toBe('Menu');
  });

  test('extracts Default Menu screen', () => {
    const html = `<html><head></head><body>
     Default       xxx
      Menu         xxx
TESD5C333333xxx
</body></html>`;
    const result = parseMenuScreen(html);
    expect(result.line1).toBe('Default');
    expect(result.line2).toBe('Menu');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/parser.test.js --verbose`
Expected: FAIL — `parseMenuScreen is not a function`

- [ ] **Step 3: Implement `parseMenuScreen`**

Add to `src/parser.js` before `module.exports`:

```js
function parseMenuScreen(html) {
  const root = parse(html);
  const body = root.querySelector('body');
  if (!body) throw new Error('No <body> found in gateway response');

  const text = body.rawText || body.text || '';
  const parts = text.split('xxx');
  if (parts.length < 3) throw new Error('Unexpected gateway response format');

  return {
    line1: parts[0].trim(),
    line2: parts[1].trim(),
  };
}
```

Update `module.exports`:

```js
module.exports = { parseGatewayResponse, decodeLedString, parseSensor, parseHeatSettingValue, parseMenuScreen };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/parser.test.js --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/parser.test.js
git commit -m "feat: add parseMenuScreen to parser"
```

---

## Task 3: State — add `heatSettings`

**Files:**
- Modify: `src/state.js`
- Modify: `test/state.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/state.test.js`:

```js
test('initializes heatSettings with null values', () => {
  const snapshot = state.getSnapshot();
  expect(snapshot.heatSettings).toEqual({
    spaHeater: { enabled: null, setPoint: null },
    poolHeater: { enabled: null, setPoint: null },
    spaSolar: { enabled: null, setPoint: null },
    poolSolar: { enabled: null, setPoint: null },
    lastUpdated: null,
  });
});

test('updateHeatSettings sets heat setting values', () => {
  state.updateHeatSettings({
    spaHeater: { enabled: true, setPoint: 96 },
    poolHeater: { enabled: false, setPoint: null },
    spaSolar: { enabled: false, setPoint: null },
    poolSolar: { enabled: true, setPoint: 89 },
  });
  const snapshot = state.getSnapshot();
  expect(snapshot.heatSettings.spaHeater).toEqual({ enabled: true, setPoint: 96 });
  expect(snapshot.heatSettings.poolHeater).toEqual({ enabled: false, setPoint: null });
  expect(snapshot.heatSettings.poolSolar).toEqual({ enabled: true, setPoint: 89 });
  expect(snapshot.heatSettings.lastUpdated).not.toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/state.test.js --verbose`
Expected: FAIL — `snapshot.heatSettings` is undefined

- [ ] **Step 3: Implement state changes**

In `src/state.js`, add `heatSettings` to the `data` object after `lastUpdated`:

```js
heatSettings: {
  spaHeater: { enabled: null, setPoint: null },
  poolHeater: { enabled: null, setPoint: null },
  spaSolar: { enabled: null, setPoint: null },
  poolSolar: { enabled: null, setPoint: null },
  lastUpdated: null,
},
```

Add `updateHeatSettings` method to the returned object:

```js
updateHeatSettings({ spaHeater, poolHeater, spaSolar, poolSolar }) {
  data.heatSettings.spaHeater = spaHeater;
  data.heatSettings.poolHeater = poolHeater;
  data.heatSettings.spaSolar = spaSolar;
  data.heatSettings.poolSolar = poolSolar;
  data.heatSettings.lastUpdated = new Date().toISOString();
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/state.test.js --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/state.js test/state.test.js
git commit -m "feat: add heatSettings to state"
```

---

## Task 4: Test fixtures for menu screens

**Files:**
- Create: `test/fixtures/settings-menu.html`
- Create: `test/fixtures/spa-heater1.html`
- Create: `test/fixtures/pool-heater1.html`
- Create: `test/fixtures/spa-solar.html`
- Create: `test/fixtures/pool-solar.html`
- Create: `test/fixtures/default-menu.html`

These fixtures follow the exact same format as the existing fixtures (e.g., `test/fixtures/air-temp.html`). The body contains `line1 xxx line2 xxx ledString xxx`.

- [ ] **Step 1: Create `test/fixtures/settings-menu.html`**

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Settings      xxx
      Menu         xxx
TESD5C333333xxx

</body>
</html>
```

- [ ] **Step 2: Create `test/fixtures/spa-heater1.html`**

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Spa Heater1   xxx
      <span class="WBON">96&#176;F</span>       xxx
TESD5C333333xxx

</body>
</html>
```

- [ ] **Step 3: Create `test/fixtures/pool-heater1.html`**

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Pool Heater1  xxx
      <span class="WBON">Off</span>       xxx
TESD5C333333xxx

</body>
</html>
```

- [ ] **Step 4: Create `test/fixtures/spa-solar.html`**

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Spa Solar     xxx
      <span class="WBON">Off</span>       xxx
TESD5C333333xxx

</body>
</html>
```

- [ ] **Step 5: Create `test/fixtures/pool-solar.html`**

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Pool Solar    xxx
      <span class="WBON">89&#176;F</span>       xxx
TESD5C333333xxx

</body>
</html>
```

- [ ] **Step 6: Create `test/fixtures/default-menu.html`**

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Default       xxx
      Menu         xxx
TESD5C333333xxx

</body>
</html>
```

- [ ] **Step 7: Commit**

```bash
git add test/fixtures/settings-menu.html test/fixtures/spa-heater1.html test/fixtures/pool-heater1.html test/fixtures/spa-solar.html test/fixtures/pool-solar.html test/fixtures/default-menu.html
git commit -m "test: add heat settings menu screen fixtures"
```

---

## Task 5: Heat settings fetch module

**Files:**
- Create: `src/heat-settings.js`
- Create: `test/heat-settings.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/heat-settings.test.js`:

```js
const fs = require('fs');
const path = require('path');
const { createHeatSettingsFetcher } = require('../src/heat-settings');

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
}

describe('heat settings fetcher', () => {
  let mockSendCommand, mockPollGateway, mockPoller, mockState, fetcher;
  let pollResponses;

  beforeEach(() => {
    pollResponses = [];
    mockSendCommand = jest.fn().mockResolvedValue();
    mockPollGateway = jest.fn().mockImplementation(() => {
      return Promise.resolve(pollResponses.shift());
    });
    mockPoller = {
      stop: jest.fn(),
      start: jest.fn(),
      isRunning: jest.fn().mockReturnValue(true),
    };
    mockState = {
      updateHeatSettings: jest.fn(),
    };
    fetcher = createHeatSettingsFetcher({
      sendCommand: mockSendCommand,
      pollGateway: mockPollGateway,
      poller: mockPoller,
      state: mockState,
      stepDelay: 0,
    });
  });

  test('successful fetch reads all 4 settings', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),    // after MENU: Settings Menu
      loadFixture('spa-heater1.html'),       // read Spa Heater1
      loadFixture('pool-heater1.html'),      // after RIGHT: Pool Heater1
      loadFixture('spa-solar.html'),         // after RIGHT: Spa Solar
      loadFixture('pool-solar.html'),        // after RIGHT: Pool Solar
      loadFixture('default-menu.html'),      // after MENU: Default Menu
    ];

    const result = await fetcher.fetch();

    expect(result.spaHeater).toEqual({ enabled: true, setPoint: 96 });
    expect(result.poolHeater).toEqual({ enabled: false, setPoint: null });
    expect(result.spaSolar).toEqual({ enabled: false, setPoint: null });
    expect(result.poolSolar).toEqual({ enabled: true, setPoint: 89 });
  });

  test('pauses poller before and resumes after', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    await fetcher.fetch();

    expect(mockPoller.stop).toHaveBeenCalled();
    expect(mockPoller.start).toHaveBeenCalled();
    const stopOrder = mockPoller.stop.mock.invocationOrder;
    const startOrder = mockPoller.start.mock.invocationOrder;
    expect(stopOrder[0]).toBeLessThan(startOrder[0]);
  });

  test('updates state with fetched settings', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    await fetcher.fetch();

    expect(mockState.updateHeatSettings).toHaveBeenCalledWith({
      spaHeater: { enabled: true, setPoint: 96 },
      poolHeater: { enabled: false, setPoint: null },
      spaSolar: { enabled: false, setPoint: null },
      poolSolar: { enabled: true, setPoint: 89 },
    });
  });

  test('sends correct key sequence', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    await fetcher.fetch();

    const calls = mockSendCommand.mock.calls.map(c => c[0]);
    // MENU to enter settings, then RIGHT x3 for remaining screens, then MENU to exit, then MENU to resume
    expect(calls[0]).toBe('02'); // MENU to enter settings
    expect(calls[1]).toBe('01'); // RIGHT to Pool Heater1
    expect(calls[2]).toBe('01'); // RIGHT to Spa Solar
    expect(calls[3]).toBe('01'); // RIGHT to Pool Solar
    expect(calls[4]).toBe('02'); // MENU to find Default Menu
    expect(calls[5]).toBe('02'); // MENU to resume cycling
  });

  test('retries MENU to find Settings Menu', async () => {
    pollResponses = [
      loadFixture('air-temp.html'),         // first MENU: still on cycling display
      loadFixture('settings-menu.html'),    // second MENU: found Settings Menu
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    const result = await fetcher.fetch();
    expect(result.spaHeater).toEqual({ enabled: true, setPoint: 96 });
    // MENU sent twice to enter settings
    expect(mockSendCommand.mock.calls[0][0]).toBe('02');
    expect(mockSendCommand.mock.calls[1][0]).toBe('02');
  });

  test('throws when Settings Menu not found after max attempts', async () => {
    // Return non-settings screens for all attempts
    pollResponses = Array(10).fill(loadFixture('air-temp.html'));

    await expect(fetcher.fetch()).rejects.toThrow('Could not reach Settings Menu');
    expect(mockPoller.start).toHaveBeenCalled(); // poller resumed even on failure
  });

  test('throws when Default Menu not found after max attempts', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      // 10 non-default-menu screens when trying to exit
      ...Array(10).fill(loadFixture('spa-heater1.html')),
    ];

    await expect(fetcher.fetch()).rejects.toThrow('Could not reach Default Menu');
    expect(mockPoller.start).toHaveBeenCalled();
  });

  test('returns 429-style error when already fetching', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    // Make pollGateway slow so first fetch is still in progress
    mockPollGateway.mockImplementation(() => {
      return new Promise(resolve => setTimeout(() => resolve(pollResponses.shift()), 50));
    });

    const p1 = fetcher.fetch();
    const p2 = fetcher.fetch();

    const result1 = await p1;
    await expect(p2).rejects.toThrow('Heat settings fetch already in progress');
    expect(result1.spaHeater).toEqual({ enabled: true, setPoint: 96 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/heat-settings.test.js --verbose`
Expected: FAIL — `Cannot find module '../src/heat-settings'`

- [ ] **Step 3: Implement `src/heat-settings.js`**

Create `src/heat-settings.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/heat-settings.test.js --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/heat-settings.js test/heat-settings.test.js
git commit -m "feat: add heat settings fetcher with menu navigation"
```

---

## Task 6: Route — `GET /api/heat-settings`

**Files:**
- Modify: `src/routes.js`
- Modify: `test/routes.test.js`

- [ ] **Step 1: Write failing test**

Add to `test/routes.test.js`:

```js
const { createHeatSettingsFetcher } = require('../src/heat-settings');
```

Update `createApp` to include a mock heat settings fetcher:

Replace the existing `createApp` function:

```js
function createApp({ fetcherOverrides } = {}) {
  const state = createState();
  const mockSendCommand = jest.fn().mockResolvedValue();
  const queue = createCommandQueue(mockSendCommand, { commandDelay: 0 });
  const poller = { isRunning: () => true, stop: jest.fn(), start: jest.fn() };
  const mockFetcher = {
    fetch: jest.fn().mockResolvedValue({
      spaHeater: { enabled: true, setPoint: 96 },
      poolHeater: { enabled: false, setPoint: null },
      spaSolar: { enabled: false, setPoint: null },
      poolSolar: { enabled: true, setPoint: 89 },
    }),
    ...fetcherOverrides,
  };
  const app = express();
  mountRoutes(app, state, queue, poller, mockFetcher);
  return { app, state, queue, mockSendCommand, mockFetcher };
}
```

Add new test block:

```js
describe('GET /api/heat-settings', () => {
  test('returns heat settings from fetcher', async () => {
    const { app } = createApp();
    const res = await request(app).get('/api/heat-settings');
    expect(res.status).toBe(200);
    expect(res.body.spaHeater).toEqual({ enabled: true, setPoint: 96 });
    expect(res.body.poolSolar).toEqual({ enabled: true, setPoint: 89 });
  });

  test('returns 429 when fetch already in progress', async () => {
    const { app } = createApp({
      fetcherOverrides: {
        fetch: jest.fn().mockRejectedValue(new Error('Heat settings fetch already in progress')),
      },
    });
    const res = await request(app).get('/api/heat-settings');
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('in progress');
  });

  test('returns 503 when navigation fails', async () => {
    const { app } = createApp({
      fetcherOverrides: {
        fetch: jest.fn().mockRejectedValue(new Error('Could not reach Settings Menu')),
      },
    });
    const res = await request(app).get('/api/heat-settings');
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/routes.test.js --verbose`
Expected: FAIL — `mountRoutes` called with wrong arity / route not found

- [ ] **Step 3: Update `mountRoutes` to accept and use fetcher**

In `src/routes.js`, update the function signature and add the route:

```js
const { COMMAND_MAP } = require('./commands');

function mountRoutes(app, state, commandQueue, poller, heatSettingsFetcher) {
  app.get('/api/status', (req, res) => {
    res.json(state.getSnapshot());
  });

  app.get('/api/health', (req, res) => {
    const snapshot = state.getSnapshot();
    res.json({
      ok: true,
      polling: poller.isRunning(),
      lastUpdated: snapshot.lastUpdated,
    });
  });

  app.get('/api/heat-settings', async (req, res) => {
    try {
      const settings = await heatSettingsFetcher.fetch();
      res.json(settings);
    } catch (err) {
      if (err.message.includes('in progress')) {
        return res.status(429).json({ error: err.message });
      }
      res.status(503).json({ error: err.message });
    }
  });

  app.post('/api/command/:action', async (req, res) => {
    const { action } = req.params;
    const keyId = COMMAND_MAP[action];

    if (!keyId) {
      return res.status(400).json({
        success: false,
        error: `Unknown command: ${action}`,
      });
    }

    const result = await commandQueue.execute(action, keyId);

    if (!result.success && result.error.includes('Command in progress')) {
      return res.status(429).json(result);
    }
    if (!result.success) {
      return res.status(503).json(result);
    }

    res.json(result);
  });
}

module.exports = { mountRoutes };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/routes.test.js --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes.js test/routes.test.js
git commit -m "feat: add GET /api/heat-settings route"
```

---

## Task 7: Poller — periodic heat settings fetch

**Files:**
- Modify: `src/poller.js`
- Modify: `test/poller.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/poller.test.js`:

```js
describe('heat settings periodic fetch', () => {
  test('calls heatSettingsFetch after heatSettingsInterval elapses', async () => {
    const mockPollFn = jest.fn().mockResolvedValue(loadFixture('air-temp.html'));
    const mockHeatSettingsFetch = jest.fn().mockResolvedValue({});
    const poller = createPoller(state, {
      interval: 100,
      pollFn: mockPollFn,
      heatSettingsFetch: mockHeatSettingsFetch,
      heatSettingsInterval: 0, // fetch immediately (0 seconds = always due)
    });

    await poller.pollOnce();

    expect(mockHeatSettingsFetch).toHaveBeenCalledTimes(1);
  });

  test('does not call heatSettingsFetch when interval has not elapsed', async () => {
    const mockPollFn = jest.fn().mockResolvedValue(loadFixture('air-temp.html'));
    const mockHeatSettingsFetch = jest.fn().mockResolvedValue({});
    const poller = createPoller(state, {
      interval: 100,
      pollFn: mockPollFn,
      heatSettingsFetch: mockHeatSettingsFetch,
      heatSettingsInterval: 9999,
    });

    // First poll triggers fetch (startup)
    await poller.pollOnce();
    expect(mockHeatSettingsFetch).toHaveBeenCalledTimes(1);

    // Second poll should NOT trigger (interval not elapsed)
    await poller.pollOnce();
    expect(mockHeatSettingsFetch).toHaveBeenCalledTimes(1);
  });

  test('handles heatSettingsFetch errors without crashing', async () => {
    const mockPollFn = jest.fn().mockResolvedValue(loadFixture('air-temp.html'));
    const mockHeatSettingsFetch = jest.fn().mockRejectedValue(new Error('nav failed'));
    const poller = createPoller(state, {
      interval: 100,
      pollFn: mockPollFn,
      heatSettingsFetch: mockHeatSettingsFetch,
      heatSettingsInterval: 0,
    });

    await poller.pollOnce(); // should not throw
    expect(mockHeatSettingsFetch).toHaveBeenCalled();
  });

  test('skips heat settings fetch when no fetch function provided', async () => {
    const mockPollFn = jest.fn().mockResolvedValue(loadFixture('air-temp.html'));
    const poller = createPoller(state, { interval: 100, pollFn: mockPollFn });

    await poller.pollOnce(); // should not throw
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/poller.test.js --verbose`
Expected: FAIL — `heatSettingsFetch` never called (poller doesn't know about it yet)

- [ ] **Step 3: Implement poller changes**

Replace `src/poller.js`:

```js
const { pollGateway } = require('./gateway');
const { parseGatewayResponse } = require('./parser');

function createPoller(state, {
  interval = 500,
  pollFn = pollGateway,
  heatSettingsFetch = null,
  heatSettingsInterval = 3600,
} = {}) {
  let timerId = null;
  let running = false;
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

      state.updateTimestamp(new Date().toISOString());
    } catch (err) {
      console.error('Poll error:', err.message);
    }

    await maybeFetchHeatSettings();
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/poller.test.js --verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/poller.js test/poller.test.js
git commit -m "feat: add periodic heat settings fetch to poller"
```

---

## Task 8: Wire everything up in `index.js`

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Update `src/index.js`**

Replace `src/index.js`:

```js
const express = require('express');
const { createState } = require('./state');
const { createPoller } = require('./poller');
const { createCommandQueue } = require('./commands');
const { createHeatSettingsFetcher } = require('./heat-settings');
const { sendCommand, pollGateway } = require('./gateway');
const { mountRoutes } = require('./routes');

const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '500', 10);
const HEAT_SETTINGS_INTERVAL = parseInt(process.env.HEAT_SETTINGS_INTERVAL || '3600', 10);

const state = createState();
const commandQueue = createCommandQueue(sendCommand);

// Create heat settings fetcher — needs poller reference, which is circular.
// Solve by creating poller with a lazy fetch function.
let heatSettingsFetcher;

const poller = createPoller(state, {
  interval: POLL_INTERVAL,
  heatSettingsFetch: () => heatSettingsFetcher.fetch(),
  heatSettingsInterval: HEAT_SETTINGS_INTERVAL,
});

heatSettingsFetcher = createHeatSettingsFetcher({
  sendCommand,
  pollGateway,
  poller,
  state,
});

const app = express();
mountRoutes(app, state, commandQueue, poller, heatSettingsFetcher);

poller.start();

app.listen(PORT, () => {
  console.log(`Pool Control API listening on port ${PORT}`);
});
```

- [ ] **Step 2: Run all Node tests**

Run: `npx jest --verbose`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: wire heat settings into app startup"
```

---

## Task 9: HA integration — sensor definitions and display

**Files:**
- Modify: `custom_components/aquaconnect_control/const.py`
- Modify: `custom_components/aquaconnect_control/sensor.py`
- Modify: `tests/ha/conftest.py`
- Modify: `tests/ha/test_sensor.py`

- [ ] **Step 1: Write failing HA tests**

Update `tests/ha/conftest.py` — add `heatSettings` to `MOCK_STATUS_RESPONSE`:

Add this after the `"lastUpdated"` line in `MOCK_STATUS_RESPONSE`:

```python
"heatSettings": {
    "spaHeater": {"enabled": True, "setPoint": 96},
    "poolHeater": {"enabled": False, "setPoint": None},
    "spaSolar": {"enabled": False, "setPoint": None},
    "poolSolar": {"enabled": True, "setPoint": 89},
    "lastUpdated": "2026-03-22T22:30:00.000Z",
},
```

Add tests to `tests/ha/test_sensor.py`:

```python
from custom_components.aquaconnect_control.const import HEAT_SETTING_SENSOR_DEFINITIONS


def test_heat_setting_sensor_enabled(mock_coordinator, mock_entry):
    """Heat setting sensor shows set point when enabled."""
    defn = HEAT_SETTING_SENSOR_DEFINITIONS[0]  # spa_heater_set_point
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value == 96
    assert sensor.native_unit_of_measurement == "°F"


def test_heat_setting_sensor_disabled(mock_coordinator, mock_entry):
    """Heat setting sensor shows None when disabled."""
    defn = HEAT_SETTING_SENSOR_DEFINITIONS[1]  # pool_heater_set_point
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    assert sensor.native_value is None


def test_heat_setting_sensor_extra_attrs(mock_coordinator, mock_entry):
    """Heat setting sensor exposes enabled as extra state attribute."""
    defn = HEAT_SETTING_SENSOR_DEFINITIONS[0]  # spa_heater_set_point
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    attrs = sensor.extra_state_attributes
    assert attrs["enabled"] is True


def test_heat_setting_sensor_disabled_extra_attrs(mock_coordinator, mock_entry):
    """Disabled heat setting sensor has enabled=False in extra attrs."""
    defn = HEAT_SETTING_SENSOR_DEFINITIONS[1]  # pool_heater_set_point
    sensor = AquaConnectSensor(mock_coordinator, mock_entry, defn)
    attrs = sensor.extra_state_attributes
    assert attrs["enabled"] is False
```

- [ ] **Step 2: Run HA tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/ha/test_sensor.py -v`
Expected: FAIL — `HEAT_SETTING_SENSOR_DEFINITIONS` not found

- [ ] **Step 3: Add sensor definitions to `const.py`**

Add to the bottom of `custom_components/aquaconnect_control/const.py`:

```python
HEAT_SETTING_SENSOR_DEFINITIONS = [
    {
        "key": "spa_heater_set_point",
        "name": "Spa Heater Set Point",
        "device_class": "temperature",
        "unit": "°F",
        "state_class": "measurement",
        "path": ["heatSettings", "spaHeater"],
        "heat_setting": True,
    },
    {
        "key": "pool_heater_set_point",
        "name": "Pool Heater Set Point",
        "device_class": "temperature",
        "unit": "°F",
        "state_class": "measurement",
        "path": ["heatSettings", "poolHeater"],
        "heat_setting": True,
    },
    {
        "key": "spa_solar_set_point",
        "name": "Spa Solar Set Point",
        "device_class": "temperature",
        "unit": "°F",
        "state_class": "measurement",
        "path": ["heatSettings", "spaSolar"],
        "heat_setting": True,
    },
    {
        "key": "pool_solar_set_point",
        "name": "Pool Solar Set Point",
        "device_class": "temperature",
        "unit": "°F",
        "state_class": "measurement",
        "path": ["heatSettings", "poolSolar"],
        "heat_setting": True,
    },
]
```

- [ ] **Step 4: Update `sensor.py` to handle heat setting sensors**

Update `sensor.py` to create entities from both definition lists and handle the compound value:

```python
"""Sensor platform for AquaConnect Control."""
from homeassistant.components.sensor import SensorEntity, SensorStateClass, SensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, SENSOR_DEFINITIONS, HEAT_SETTING_SENSOR_DEFINITIONS
from .coordinator import AquaConnectCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up sensor entities."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [
        AquaConnectSensor(coordinator, entry, defn)
        for defn in SENSOR_DEFINITIONS + HEAT_SETTING_SENSOR_DEFINITIONS
    ]
    async_add_entities(entities)


class AquaConnectSensor(CoordinatorEntity, SensorEntity):
    """Sensor entity for a pool reading."""

    def __init__(
        self,
        coordinator: AquaConnectCoordinator,
        entry: ConfigEntry,
        definition: dict,
    ) -> None:
        super().__init__(coordinator)
        self._definition = definition
        self._entry = entry
        self._attr_name = definition["name"]
        self._attr_unique_id = f"{entry.entry_id}_{definition['key']}"
        self._attr_native_unit_of_measurement = definition["unit"]
        self._attr_device_class = definition["device_class"]
        self._attr_state_class = definition["state_class"]

    def _resolve_path(self):
        """Walk the data dict following the definition path."""
        data = self.coordinator.data
        if data is None:
            return None
        for key in self._definition["path"]:
            if isinstance(data, dict):
                data = data.get(key)
            else:
                return None
        return data

    @property
    def native_value(self):
        """Return the sensor value from coordinator data."""
        data = self._resolve_path()
        if data is None:
            return None
        if self._definition.get("heat_setting"):
            return data.get("setPoint") if data.get("enabled") else None
        return data

    @property
    def extra_state_attributes(self):
        """Return extra state attributes."""
        if not self._definition.get("heat_setting"):
            return None
        data = self._resolve_path()
        if data is None:
            return {"enabled": None}
        return {"enabled": data.get("enabled")}

    @property
    def device_info(self):
        """Return device info to group entities."""
        return {
            "identifiers": {(DOMAIN, self._entry.entry_id)},
            "name": "AquaConnect Control",
            "manufacturer": "Hayward",
            "model": "AquaConnect",
        }
```

- [ ] **Step 5: Run HA tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/ha/test_sensor.py -v`
Expected: All PASS

- [ ] **Step 6: Run all HA tests**

Run: `.venv/bin/python -m pytest tests/ha/ -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add custom_components/aquaconnect_control/const.py custom_components/aquaconnect_control/sensor.py tests/ha/conftest.py tests/ha/test_sensor.py
git commit -m "feat: add heat setting sensors to HA integration"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all Node tests**

Run: `npx jest --verbose`
Expected: All PASS

- [ ] **Step 2: Run all HA tests**

Run: `.venv/bin/python -m pytest tests/ha/ -v`
Expected: All PASS

- [ ] **Step 3: Verify `/api/status` includes `heatSettings`**

Check that the state snapshot (returned by `GET /api/status`) includes the `heatSettings` key by reviewing the state test from Task 3. The existing `getSnapshot()` does a deep clone of `data`, which now includes `heatSettings` — no further changes needed.

- [ ] **Step 4: Verify `HEAT_SETTINGS_INTERVAL` env var is wired**

Confirm in `src/index.js` that `HEAT_SETTINGS_INTERVAL` is parsed and passed to the poller.
