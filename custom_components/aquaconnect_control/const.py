"""Constants for the AquaConnect Control integration."""

DOMAIN = "aquaconnect_control"
DEFAULT_SCAN_INTERVAL = 10
CONF_HOST = "host"
CONF_SCAN_INTERVAL = "scan_interval"

SENSOR_DEFINITIONS = [
    {"key": "poolTemp", "name": "Pool Temperature", "device_class": "temperature", "unit": "°F", "state_class": "measurement", "path": ["sensors", "poolTemp"]},
    {"key": "spaTemp", "name": "Spa Temperature", "device_class": "temperature", "unit": "°F", "state_class": "measurement", "path": ["sensors", "spaTemp"]},
    {"key": "airTemp", "name": "Air Temperature", "device_class": "temperature", "unit": "°F", "state_class": "measurement", "path": ["sensors", "airTemp"]},
    {"key": "saltLevel", "name": "Salt Level", "device_class": None, "unit": "PPM", "state_class": "measurement", "path": ["sensors", "saltLevel"]},
    {"key": "filterSpeed", "name": "Filter Speed", "device_class": None, "unit": None, "state_class": None, "path": ["sensors", "filterSpeed"]},
    {"key": "poolChlorinator", "name": "Pool Chlorinator", "device_class": None, "unit": None, "state_class": None, "path": ["sensors", "poolChlorinator"]},
    {"key": "spaChlorinator", "name": "Spa Chlorinator", "device_class": None, "unit": None, "state_class": None, "path": ["sensors", "spaChlorinator"]},
    {"key": "heaterMode", "name": "Heater Mode", "device_class": None, "unit": None, "state_class": None, "path": ["sensors", "heaterMode"]},
]

SWITCH_DEFINITIONS = [
    {"key": "mode", "name": "Pool/Spa Mode", "command": "mode", "state_path": None},
    {"key": "filter", "name": "Filter", "command": "filter", "state_path": ["equipment", "filter", "on"]},
    {"key": "lights", "name": "Lights", "command": "lights", "state_path": ["equipment", "lights", "on"]},
    {"key": "spaLights", "name": "Spa Lights", "command": "spaLights", "state_path": ["equipment", "spaLights", "on"]},
    {"key": "waterfall", "name": "Waterfall", "command": "waterfall", "state_path": ["equipment", "waterfall", "on"]},
    {"key": "solarHeater", "name": "Solar Heater", "command": "solarHeater", "state_path": ["equipment", "solarHeater", "on"]},
]

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
