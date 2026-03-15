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
