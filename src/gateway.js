const GATEWAY_URL = process.env.GATEWAY_URL;

function getGatewayUrl() {
  if (!GATEWAY_URL) throw new Error('GATEWAY_URL environment variable is required');
  return GATEWAY_URL;
}

async function pollGateway() {
  const url = `${getGatewayUrl()}/WNewSt.htm`;
  const response = await fetch(url, {
    method: 'POST',
    body: 'Update Local Server&',
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
  });
  if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
}

module.exports = { pollGateway, sendCommand };
