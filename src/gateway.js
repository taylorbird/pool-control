function getGatewayUrl() {
  const url = process.env.GATEWAY_URL;
  if (!url) throw new Error('GATEWAY_URL environment variable is required');
  return url;
}

async function pollGateway() {
  const url = `${getGatewayUrl()}/WNewSt.htm`;
  const response = await fetch(url, {
    method: 'POST',
    body: 'Update Local Server&',
    signal: AbortSignal.timeout(5000),
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
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
}

module.exports = { pollGateway, sendCommand };
