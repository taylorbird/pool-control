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
