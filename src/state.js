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
    heatSettings: {
      spaHeater: { enabled: null, setPoint: null },
      poolHeater: { enabled: null, setPoint: null },
      spaSolar: { enabled: null, setPoint: null },
      poolSolar: { enabled: null, setPoint: null },
      lastUpdated: null,
    },
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

    updateHeatSettings({ spaHeater, poolHeater, spaSolar, poolSolar }) {
      data.heatSettings.spaHeater = spaHeater;
      data.heatSettings.poolHeater = poolHeater;
      data.heatSettings.spaSolar = spaSolar;
      data.heatSettings.poolSolar = poolSolar;
      data.heatSettings.lastUpdated = new Date().toISOString();
    },
  };
}

module.exports = { createState };
