const fs = require('fs');
const path = require('path');
const { parseGatewayResponse, parseHeatSettingValue } = require('../src/parser');

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
