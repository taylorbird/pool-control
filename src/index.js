const express = require('express');
const { createState } = require('./state');
const { createPoller } = require('./poller');
const { createCommandQueue } = require('./commands');
const { createHeatSettingsFetcher } = require('./heat-settings');
const { sendCommand, pollGateway } = require('./gateway');
const { mountRoutes } = require('./routes');

const PORT = process.env.PORT || 3000;
// The gateway can't take sustained load: poll slowly when idle, fast briefly after a command.
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '15000', 10);
const FAST_POLL_INTERVAL = parseInt(process.env.FAST_POLL_INTERVAL || '1000', 10);
const FAST_POLL_DURATION = parseInt(process.env.FAST_POLL_DURATION || '10000', 10);
const HEAT_SETTINGS_INTERVAL = parseInt(process.env.HEAT_SETTINGS_INTERVAL || '3600', 10);
// Enable the on-screen toggle buttons on the status page. Off by default;
// the command API (used by the HA integration) is always available regardless.
const STATUS_PAGE_CONTROLS = /^(1|true|yes|on)$/i.test(process.env.STATUS_PAGE_CONTROLS || '');

const state = createState();
const commandQueue = createCommandQueue(sendCommand);

// Create heat settings fetcher — needs poller reference, which is circular.
// Solve by creating poller with a lazy fetch function.
let heatSettingsFetcher;

const poller = createPoller(state, {
  interval: POLL_INTERVAL,
  fastInterval: FAST_POLL_INTERVAL,
  fastDuration: FAST_POLL_DURATION,
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
mountRoutes(app, state, commandQueue, poller, heatSettingsFetcher, {
  controlsEnabled: STATUS_PAGE_CONTROLS,
});

poller.start();

app.listen(PORT, () => {
  console.log(`Pool Control API listening on port ${PORT}`);
});
