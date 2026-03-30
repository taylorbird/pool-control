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
