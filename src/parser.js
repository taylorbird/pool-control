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
