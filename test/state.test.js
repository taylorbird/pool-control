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
