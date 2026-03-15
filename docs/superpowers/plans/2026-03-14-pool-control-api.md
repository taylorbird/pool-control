# Pool Control API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node/Express REST API that polls the AquaConnect pool gateway and serves pool state + toggle commands.

**Architecture:** Single Express process with a background poller that reads the gateway HTML every 500ms, parses LCD text and LED nibble data into an in-memory state object, and serves it via REST endpoints. Commands go through a serial queue to prevent concurrent gateway access.

**Tech Stack:** Node.js 20, Express, node-html-parser, Jest for testing, Docker

**Spec:** `docs/superpowers/specs/2026-03-14-pool-control-api-design.md`

---

## File Structure

```
pool-control/
├── src/
│   ├── index.js              # Express app entry, starts poller, listens on PORT
│   ├── state.js              # In-memory state object with getters/setters
│   ├── parser.js             # Parses gateway HTML: LCD text + LED nibbles
│   ├── gateway.js            # HTTP client for gateway (poll + send command)
│   ├── poller.js             # Background polling loop, updates state
│   ├── commands.js           # Command queue with mutex, sends keypresses
│   └── routes.js             # Express route definitions
├── test/
│   ├── parser.test.js        # Parser unit tests
│   ├── state.test.js         # State unit tests
│   ├── commands.test.js      # Command queue unit tests
│   ├── routes.test.js        # Route integration tests
│   ├── poller.test.js        # Poller unit tests
│   └── fixtures/             # Sample gateway HTML responses
│       ├── air-temp.html
│       ├── pool-temp.html
│       ├── spa-temp.html
│       ├── salt-level.html
│       ├── filter-speed.html
│       ├── pool-chlorinator.html
│       ├── spa-chlorinator.html
│       └── heater-mode.html
├── package.json
├── Dockerfile
├── docker-compose.yaml
├── .env.example
└── legacy/                   # Old C# code moved here
```

---

## Chunk 1: Project Setup & State Module

### Task 1: Move legacy C# code and initialize Node project

**Files:**
- Move: `Program.cs`, `pool.csproj`, `docker/`, `.vscode/` → `legacy/`
- Create: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Move C# files to legacy/**

```bash
mkdir -p legacy
git mv Program.cs legacy/
git mv pool.csproj legacy/
git mv docker legacy/
git mv .vscode legacy/
git mv bin legacy/ 2>/dev/null; true
```

- [ ] **Step 2: Initialize Node project**

```bash
npm init -y
```

Then edit `package.json` to set:
```json
{
  "name": "pool-control-api",
  "version": "1.0.0",
  "description": "REST API for AquaConnect pool gateway",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest --verbose"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install express node-html-parser
npm install --save-dev jest
```

- [ ] **Step 4: Create .env.example**

```
GATEWAY_URL=http://10.33.103.24
PORT=3000
POLL_INTERVAL=500
```

- [ ] **Step 5: Create .gitignore**

Create `.gitignore`:
```
node_modules/
.env
obj/
bin/
.DS_Store
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: move C# to legacy/, init Node project with deps"
```

---

### Task 2: State module

**Files:**
- Create: `src/state.js`
- Create: `test/state.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/state.test.js`:

```js
const { createState } = require('../src/state');

describe('state', () => {
  let state;

  beforeEach(() => {
    state = createState();
  });

  test('initializes with all null values', () => {
    const snapshot = state.getSnapshot();
    expect(snapshot.mode).toBeNull();
    expect(snapshot.equipment.filter.on).toBeNull();
    expect(snapshot.equipment.lights.on).toBeNull();
    expect(snapshot.equipment.spaLights.on).toBeNull();
    expect(snapshot.equipment.waterfall.on).toBeNull();
    expect(snapshot.equipment.solarHeater.on).toBeNull();
    expect(snapshot.equipment.heater.on).toBeNull();
    expect(snapshot.sensors.airTemp).toBeNull();
    expect(snapshot.sensors.poolTemp).toBeNull();
    expect(snapshot.sensors.spaTemp).toBeNull();
    expect(snapshot.sensors.saltLevel).toBeNull();
    expect(snapshot.sensors.poolChlorinator).toBeNull();
    expect(snapshot.sensors.spaChlorinator).toBeNull();
    expect(snapshot.sensors.filterSpeed).toBeNull();
    expect(snapshot.sensors.heaterMode).toBeNull();
    expect(snapshot.lastUpdated).toBeNull();
  });

  test('updateEquipment sets equipment and mode', () => {
    state.updateEquipment({
      mode: 'pool',
      filter: true,
      lights: false,
      spaLights: false,
      waterfall: false,
      solarHeater: true,
      heater: false,
    });
    const snapshot = state.getSnapshot();
    expect(snapshot.mode).toBe('pool');
    expect(snapshot.equipment.filter.on).toBe(true);
    expect(snapshot.equipment.solarHeater.on).toBe(true);
    expect(snapshot.equipment.lights.on).toBe(false);
  });

  test('updateSensor updates individual sensor values', () => {
    state.updateSensor('airTemp', 85);
    state.updateSensor('saltLevel', 3000);
    const snapshot = state.getSnapshot();
    expect(snapshot.sensors.airTemp).toBe(85);
    expect(snapshot.sensors.saltLevel).toBe(3000);
    expect(snapshot.sensors.poolTemp).toBeNull();
  });

  test('updateTimestamp sets lastUpdated', () => {
    const now = new Date().toISOString();
    state.updateTimestamp(now);
    expect(state.getSnapshot().lastUpdated).toBe(now);
  });

  test('getSnapshot returns a copy, not a reference', () => {
    state.updateSensor('airTemp', 85);
    const snap1 = state.getSnapshot();
    state.updateSensor('airTemp', 90);
    const snap2 = state.getSnapshot();
    expect(snap1.sensors.airTemp).toBe(85);
    expect(snap2.sensors.airTemp).toBe(90);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/state.test.js --verbose`
Expected: FAIL — cannot find module `../src/state`

- [ ] **Step 3: Write implementation**

Create `src/state.js`:

```js
function createState() {
  const data = {
    mode: null,
    equipment: {
      filter: { on: null },
      lights: { on: null },
      spaLights: { on: null },
      waterfall: { on: null },
      solarHeater: { on: null },
      heater: { on: null },
    },
    sensors: {
      airTemp: null,
      poolTemp: null,
      spaTemp: null,
      saltLevel: null,
      poolChlorinator: null,
      spaChlorinator: null,
      filterSpeed: null,
      heaterMode: null,
    },
    lastUpdated: null,
  };

  return {
    getSnapshot() {
      return JSON.parse(JSON.stringify(data));
    },

    updateEquipment({ mode, filter, lights, spaLights, waterfall, solarHeater, heater }) {
      data.mode = mode;
      data.equipment.filter.on = filter;
      data.equipment.lights.on = lights;
      data.equipment.spaLights.on = spaLights;
      data.equipment.waterfall.on = waterfall;
      data.equipment.solarHeater.on = solarHeater;
      data.equipment.heater.on = heater;
    },

    updateSensor(name, value) {
      if (name in data.sensors) {
        data.sensors[name] = value;
      }
    },

    updateTimestamp(isoString) {
      data.lastUpdated = isoString;
    },
  };
}

module.exports = { createState };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/state.test.js --verbose`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/state.js test/state.test.js
git commit -m "feat: add in-memory state module with tests"
```

---

## Chunk 2: Parser Module

### Task 3: HTML body parser

**Files:**
- Create: `src/parser.js`
- Create: `test/parser.test.js`
- Create: `test/fixtures/air-temp.html`
- Create: `test/fixtures/pool-temp.html`
- Create: `test/fixtures/spa-temp.html`
- Create: `test/fixtures/salt-level.html`
- Create: `test/fixtures/filter-speed.html`
- Create: `test/fixtures/pool-chlorinator.html`
- Create: `test/fixtures/spa-chlorinator.html`
- Create: `test/fixtures/heater-mode.html`

- [ ] **Step 1: Create test fixtures**

Create `test/fixtures/air-temp.html`:
```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Air Temp  85&#176;xxx
      Pool 60%      xxx
TESD5C333333xxx

</body>
</html>
```

Create `test/fixtures/pool-temp.html`:
```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Pool Temp 78&#176;xxx
      Heater Off    xxx
EDSD5C333333xxx

</body>
</html>
```

Create `test/fixtures/spa-temp.html`:
```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Spa Temp  92&#176;xxx
      Heater On     xxx
EUSD5C333333xxx

</body>
</html>
```

Create `test/fixtures/salt-level.html`:
```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
     Salt Level     xxx
      3000 PPM      xxx
TESD5C333333xxx

</body>
</html>
```

Create `test/fixtures/filter-speed.html`:
```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
    Filter Speed    xxx
   50% Speed2       xxx
TEDD5C333333xxx

</body>
</html>
```

Create `test/fixtures/pool-chlorinator.html`:
```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
    Pool Chlorinator xxx
       60%          xxx
TESD5C333333xxx

</body>
</html>
```

Create `test/fixtures/spa-chlorinator.html`:
```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
    Spa Chlorinator  xxx
       40%          xxx
TESD5C333333xxx

</body>
</html>
```

Create `test/fixtures/heater-mode.html`:
```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta content="text/html; charset=ISO-8859-1" http-equiv="content-type">
  <title></title>
</head>
<body>
    Heater Mode      xxx
       Off           xxx
TESD5C333333xxx

</body>
</html>
```

- [ ] **Step 2: Write the failing tests**

Create `test/parser.test.js`:

```js
const fs = require('fs');
const path = require('path');
const { parseGatewayResponse } = require('../src/parser');

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
}

describe('parseGatewayResponse', () => {
  test('parses air temp screen', () => {
    const result = parseGatewayResponse(loadFixture('air-temp.html'));
    expect(result.lcd.line1).toContain('Air Temp');
    expect(result.sensor).toEqual({ name: 'airTemp', value: 85 });
  });

  test('parses pool temp screen', () => {
    const result = parseGatewayResponse(loadFixture('pool-temp.html'));
    expect(result.sensor).toEqual({ name: 'poolTemp', value: 78 });
  });

  test('parses spa temp screen', () => {
    const result = parseGatewayResponse(loadFixture('spa-temp.html'));
    expect(result.sensor).toEqual({ name: 'spaTemp', value: 92 });
  });

  test('parses salt level screen', () => {
    const result = parseGatewayResponse(loadFixture('salt-level.html'));
    expect(result.sensor).toEqual({ name: 'saltLevel', value: 3000 });
  });

  test('parses filter speed screen', () => {
    const result = parseGatewayResponse(loadFixture('filter-speed.html'));
    expect(result.sensor).toEqual({ name: 'filterSpeed', value: '50% Speed2' });
  });

  test('parses pool chlorinator screen', () => {
    const result = parseGatewayResponse(loadFixture('pool-chlorinator.html'));
    expect(result.sensor).toEqual({ name: 'poolChlorinator', value: '60%' });
  });

  test('parses spa chlorinator screen', () => {
    const result = parseGatewayResponse(loadFixture('spa-chlorinator.html'));
    expect(result.sensor).toEqual({ name: 'spaChlorinator', value: '40%' });
  });

  test('parses heater mode screen', () => {
    const result = parseGatewayResponse(loadFixture('heater-mode.html'));
    expect(result.sensor).toEqual({ name: 'heaterMode', value: 'Off' });
  });

  test('returns null sensor for unknown screen', () => {
    const html = `<html><head></head><body>
     Some Unknown    xxx
      Whatever       xxx
TESD5C333333xxx
</body></html>`;
    const result = parseGatewayResponse(html);
    expect(result.sensor).toBeNull();
  });

  test('decodes LED equipment states', () => {
    // TESD5C333333 — see spec for full decode
    const result = parseGatewayResponse(loadFixture('air-temp.html'));
    expect(result.equipment.mode).toBe('pool');
    expect(result.equipment.filter).toBe(true);
    expect(result.equipment.lights).toBe(true);
    expect(result.equipment.heater).toBe(false);
    expect(result.equipment.solarHeater).toBe(false);
    expect(result.equipment.spaLights).toBe(true);
    expect(result.equipment.waterfall).toBe(false);
  });

  test('decodes spa mode from LEDs', () => {
    // EDSD5C... — Key_00=OFF, Key_01=ON → spa mode
    const result = parseGatewayResponse(loadFixture('pool-temp.html'));
    expect(result.equipment.mode).toBe('spa');
  });

  test('decodes mode as null when neither pool nor spa LED is on', () => {
    const html = `<html><head></head><body>
     Air Temp  85xxx
      test         xxx
DDDD3C333333xxx
</body></html>`;
    const result = parseGatewayResponse(html);
    expect(result.equipment.mode).toBeNull();
  });

  test('strips degree symbol entity and unicode', () => {
    const result = parseGatewayResponse(loadFixture('air-temp.html'));
    expect(result.lcd.line1).not.toContain('&#176');
    expect(result.lcd.line1).not.toContain('\u00b0');
    expect(result.sensor.value).toBe(85);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest test/parser.test.js --verbose`
Expected: FAIL — cannot find module `../src/parser`

- [ ] **Step 4: Write implementation**

Create `src/parser.js`:

**Note:** `node-html-parser`'s `.text` property may decode `&#176;` into `°` (Unicode \u00b0). We use `.rawText` to get the raw entity string, and strip both forms to be safe.

```js
const { parse } = require('node-html-parser');

// Nibble decode: 3=NOKEY, 4=OFF, 5=ON, 6=BLINK
const NIBBLE_ON = 5;

function decodeNibbles(char) {
  const code = char.charCodeAt(0);
  const high = (code >> 4) & 0x0f;
  const low = code & 0x0f;
  return [high, low];
}

function decodeLedString(ledStr) {
  const buttons = [];
  for (let i = 0; i < ledStr.length; i++) {
    const [high, low] = decodeNibbles(ledStr[i]);
    buttons.push(high);
    buttons.push(low);
  }

  // Button index mapping (see spec):
  // 0=POOL, 1=SPA, 2=SPILLOVER, 3=FILTER, 4=LIGHTS, 5=unused
  // 6=HEATER1, 7=VALVE3/Solar, 8=unused, 9=AUX1/SpaLights
  // 10=AUX2/Waterfall, 11=unused
  const isOn = (idx) => buttons[idx] === NIBBLE_ON;

  let mode = null;
  if (isOn(0)) mode = 'pool';
  else if (isOn(1)) mode = 'spa';

  return {
    mode,
    filter: isOn(3),
    lights: isOn(4),
    heater: isOn(6),
    solarHeater: isOn(7),
    spaLights: isOn(9),
    waterfall: isOn(10),
  };
}

function parseSensor(line1, line2) {
  const trimmed1 = line1.trim();
  const trimmed2 = line2.trim();
  const prefix = trimmed1.substring(0, 6);

  switch (prefix) {
    case 'Air Te': {
      const num = parseInt(trimmed1.replace(/Air Temp\s*/i, ''), 10);
      return isNaN(num) ? null : { name: 'airTemp', value: num };
    }
    case 'Pool T': {
      const num = parseInt(trimmed1.replace(/Pool Temp\s*/i, ''), 10);
      return isNaN(num) ? null : { name: 'poolTemp', value: num };
    }
    case 'Spa Te': {
      const num = parseInt(trimmed1.replace(/Spa Temp\s*/i, ''), 10);
      return isNaN(num) ? null : { name: 'spaTemp', value: num };
    }
    case 'Salt L': {
      const num = parseInt(trimmed2, 10);
      return isNaN(num) ? null : { name: 'saltLevel', value: num };
    }
    case 'Pool C':
      return { name: 'poolChlorinator', value: trimmed2 };
    case 'Spa Ch':
      return { name: 'spaChlorinator', value: trimmed2 };
    case 'Filter':
      return { name: 'filterSpeed', value: trimmed2 };
    case 'Heater':
      return { name: 'heaterMode', value: trimmed2 };
    default:
      return null;
  }
}

function parseGatewayResponse(html) {
  const root = parse(html);
  const body = root.querySelector('body');
  if (!body) throw new Error('No <body> found in gateway response');

  // Use rawText to avoid entity decoding issues, then strip both forms
  let text = body.rawText || body.text || '';
  // Strip degree symbol: HTML entity &#176; and Unicode \u00b0
  text = text.replace(/&#176;?/g, '').replace(/\u00b0/g, '');

  const parts = text.split('xxx');
  if (parts.length < 3) throw new Error('Unexpected gateway response format');

  const line1 = parts[0];
  const line2 = parts[1];
  const ledStr = parts[2].trim();

  const equipment = decodeLedString(ledStr);
  const sensor = parseSensor(line1, line2);

  return {
    lcd: { line1: line1.trim(), line2: line2.trim() },
    equipment,
    sensor,
  };
}

module.exports = { parseGatewayResponse, decodeLedString, parseSensor };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest test/parser.test.js --verbose`
Expected: All 13 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser.js test/parser.test.js test/fixtures/
git commit -m "feat: add gateway response parser with LED nibble decoding"
```

---

## Chunk 3: Gateway Client, Command Queue & Poller

### Task 4: Gateway HTTP client

**Files:**
- Create: `src/gateway.js`

This module handles raw HTTP to the gateway. No tests — it's a thin wrapper around `fetch` and will be tested indirectly via integration tests with mocks.

- [ ] **Step 1: Write implementation**

Create `src/gateway.js`:

```js
const GATEWAY_URL = process.env.GATEWAY_URL;

function getGatewayUrl() {
  if (!GATEWAY_URL) throw new Error('GATEWAY_URL environment variable is required');
  return GATEWAY_URL;
}

async function pollGateway() {
  const url = `${getGatewayUrl()}/WNewSt.htm`;
  const response = await fetch(url, {
    method: 'POST',
    body: 'Update Local Server&',
  });
  if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
  return response.text();
}

async function sendCommand(keyId) {
  const url = `${getGatewayUrl()}/WNewSt.htm`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `KeyId=${keyId}`,
  });
  if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
}

module.exports = { pollGateway, sendCommand };
```

- [ ] **Step 2: Commit**

```bash
git add src/gateway.js
git commit -m "feat: add gateway HTTP client for polling and commands"
```

---

### Task 5: Command queue with mutex

**Files:**
- Create: `src/commands.js`
- Create: `test/commands.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/commands.test.js`:

```js
const { createCommandQueue } = require('../src/commands');

describe('command queue', () => {
  let queue;
  let mockSendCommand;

  beforeEach(() => {
    mockSendCommand = jest.fn().mockResolvedValue();
    // Use 0ms delay in tests to avoid slow test suite
    queue = createCommandQueue(mockSendCommand, { commandDelay: 0 });
  });

  test('executes a command', async () => {
    const result = await queue.execute('filter', '08');
    expect(result).toEqual({ success: true, command: 'filter' });
    expect(mockSendCommand).toHaveBeenCalledWith('08');
  });

  test('rejects concurrent commands', async () => {
    // Start a command that takes time (mock holds for 50ms)
    mockSendCommand.mockImplementation(() => new Promise(r => setTimeout(r, 50)));
    const p1 = queue.execute('filter', '08');
    const p2 = queue.execute('lights', '09');

    const result1 = await p1;
    const result2 = await p2;

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Command in progress');
  });

  test('allows next command after previous completes', async () => {
    mockSendCommand.mockResolvedValue();
    const result1 = await queue.execute('filter', '08');
    expect(result1.success).toBe(true);

    const result2 = await queue.execute('lights', '09');
    expect(result2.success).toBe(true);
    expect(mockSendCommand).toHaveBeenCalledTimes(2);
  });

  test('returns error when sendCommand throws', async () => {
    mockSendCommand.mockRejectedValue(new Error('Gateway unavailable'));
    const result = await queue.execute('filter', '08');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Gateway unavailable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/commands.test.js --verbose`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

Create `src/commands.js`:

```js
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
      // Hold lock to let gateway process
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/commands.test.js --verbose`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands.js test/commands.test.js
git commit -m "feat: add command queue with mutex for serial gateway commands"
```

---

### Task 6: Background poller

**Files:**
- Create: `src/poller.js`

The poller ties gateway + parser + state together. It accepts a `pollFn` parameter for testability.

- [ ] **Step 1: Write the failing test**

Create `test/poller.test.js`:

```js
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

    // Run a single poll cycle
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

    // Simulate 3 LCD cycles
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

    // Should not throw
    await poller.pollOnce();

    const snapshot = state.getSnapshot();
    expect(snapshot.lastUpdated).toBeNull(); // No update on error
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/poller.test.js --verbose`
Expected: FAIL — cannot find module `../src/poller`

- [ ] **Step 3: Write implementation**

Create `src/poller.js`:

```js
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

  function start() {
    if (running) return;
    running = true;
    timerId = setInterval(pollOnce, interval);
    // Run first poll immediately
    pollOnce();
    console.log(`Poller started (interval: ${interval}ms)`);
  }

  function stop() {
    if (timerId) {
      clearInterval(timerId);
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/poller.test.js --verbose`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/poller.js test/poller.test.js
git commit -m "feat: add background poller that updates state from gateway"
```

---

## Chunk 4: Routes, App Entry Point & Docker

### Task 7: Express routes

**Files:**
- Create: `src/routes.js`
- Create: `test/routes.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/routes.test.js`:

```js
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

    // Fire two commands concurrently
    const [res1, res2] = await Promise.all([
      request(app).post('/api/command/filter'),
      request(app).post('/api/command/lights'),
    ]);

    const results = [res1.body, res2.body];
    expect(results.filter(r => r.success).length).toBe(1);
    expect(results.filter(r => !r.success).length).toBe(1);
  });
});
```

- [ ] **Step 2: Install supertest**

```bash
npm install --save-dev supertest
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest test/routes.test.js --verbose`
Expected: FAIL — cannot find module `../src/routes`

- [ ] **Step 4: Write implementation**

Create `src/routes.js`:

```js
const { COMMAND_MAP } = require('./commands');

function mountRoutes(app, state, commandQueue, poller) {
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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest test/routes.test.js --verbose`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes.js test/routes.test.js
git commit -m "feat: add Express routes for status, health, and commands"
```

---

### Task 8: App entry point

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: Write implementation**

Create `src/index.js`:

```js
const express = require('express');
const { createState } = require('./state');
const { createPoller } = require('./poller');
const { createCommandQueue } = require('./commands');
const { sendCommand } = require('./gateway');
const { mountRoutes } = require('./routes');

const PORT = process.env.PORT || 3000;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '500', 10);

const state = createState();
const poller = createPoller(state, { interval: POLL_INTERVAL });
const commandQueue = createCommandQueue(sendCommand);

const app = express();
mountRoutes(app, state, commandQueue, poller);

poller.start();

app.listen(PORT, () => {
  console.log(`Pool Control API listening on port ${PORT}`);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/index.js
git commit -m "feat: add app entry point wiring poller, state, and routes"
```

---

### Task 9: Docker setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yaml` (replace existing root one)

- [ ] **Step 1: Write Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 3000

CMD ["node", "src/index.js"]
```

- [ ] **Step 2: Write docker-compose.yaml**

Replace the existing root `docker-compose.yaml`:

```yaml
version: '3.8'
services:
  pool-control:
    build: .
    container_name: pool-control
    restart: always
    ports:
      - "3000:3000"
    environment:
      - GATEWAY_URL=${GATEWAY_URL}
      - PORT=3000
      - POLL_INTERVAL=500
```

- [ ] **Step 3: Add .dockerignore**

Create `.dockerignore`:

```
node_modules
test
legacy
docs
.git
.env
*.md
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yaml .dockerignore
git commit -m "feat: add Docker setup for containerized deployment"
```

---

### Task 10: Run all tests and verify

- [ ] **Step 1: Run full test suite**

```bash
npx jest --verbose
```

Expected: All tests across all test files PASS (state: 5, parser: 13, commands: 4, poller: 4, routes: 4 = ~30 tests).

- [ ] **Step 2: Verify app starts locally (smoke test)**

```bash
GATEWAY_URL=http://pool.thebirds.casa node src/index.js
```

In another terminal:
```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/status
```

Expected: Health returns `{ ok: true, polling: true, ... }`. Status returns the state object with values populating as the LCD cycles.

- [ ] **Step 3: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: final adjustments after integration testing"
```
