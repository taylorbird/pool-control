const fs = require('fs');
const path = require('path');
const { createHeatSettingsFetcher } = require('../src/heat-settings');

function loadFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
}

describe('heat settings fetcher', () => {
  let mockSendCommand, mockPollGateway, mockPoller, mockState, fetcher;
  let pollResponses;

  beforeEach(() => {
    pollResponses = [];
    mockSendCommand = jest.fn().mockResolvedValue();
    mockPollGateway = jest.fn().mockImplementation(() => {
      return Promise.resolve(pollResponses.shift());
    });
    mockPoller = {
      stop: jest.fn(),
      start: jest.fn(),
      isRunning: jest.fn().mockReturnValue(true),
    };
    mockState = {
      updateHeatSettings: jest.fn(),
    };
    fetcher = createHeatSettingsFetcher({
      sendCommand: mockSendCommand,
      pollGateway: mockPollGateway,
      poller: mockPoller,
      state: mockState,
      stepDelay: 0,
    });
  });

  test('successful fetch reads all 4 settings', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    const result = await fetcher.fetch();

    expect(result.spaHeater).toEqual({ enabled: true, setPoint: 96 });
    expect(result.poolHeater).toEqual({ enabled: false, setPoint: null });
    expect(result.spaSolar).toEqual({ enabled: false, setPoint: null });
    expect(result.poolSolar).toEqual({ enabled: true, setPoint: 89 });
  });

  test('pauses poller before and resumes after', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    await fetcher.fetch();

    expect(mockPoller.stop).toHaveBeenCalled();
    expect(mockPoller.start).toHaveBeenCalled();
    const stopOrder = mockPoller.stop.mock.invocationCallOrder;
    const startOrder = mockPoller.start.mock.invocationCallOrder;
    expect(stopOrder[0]).toBeLessThan(startOrder[0]);
  });

  test('updates state with fetched settings', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    await fetcher.fetch();

    expect(mockState.updateHeatSettings).toHaveBeenCalledWith({
      spaHeater: { enabled: true, setPoint: 96 },
      poolHeater: { enabled: false, setPoint: null },
      spaSolar: { enabled: false, setPoint: null },
      poolSolar: { enabled: true, setPoint: 89 },
    });
  });

  test('sends correct key sequence', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    await fetcher.fetch();

    const calls = mockSendCommand.mock.calls.map(c => c[0]);
    expect(calls[0]).toBe('02'); // MENU to enter settings
    expect(calls[1]).toBe('01'); // RIGHT to Pool Heater1
    expect(calls[2]).toBe('01'); // RIGHT to Spa Solar
    expect(calls[3]).toBe('01'); // RIGHT to Pool Solar
    expect(calls[4]).toBe('02'); // MENU to find Default Menu
    expect(calls[5]).toBe('02'); // MENU to resume cycling
  });

  test('retries MENU to find Settings Menu', async () => {
    pollResponses = [
      loadFixture('air-temp.html'),
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    const result = await fetcher.fetch();
    expect(result.spaHeater).toEqual({ enabled: true, setPoint: 96 });
    expect(mockSendCommand.mock.calls[0][0]).toBe('02');
    expect(mockSendCommand.mock.calls[1][0]).toBe('02');
  });

  test('throws when Settings Menu not found after max attempts', async () => {
    pollResponses = Array(10).fill(loadFixture('air-temp.html'));

    await expect(fetcher.fetch()).rejects.toThrow('Could not reach Settings Menu');
    expect(mockPoller.start).toHaveBeenCalled();
  });

  test('throws when Default Menu not found after max attempts', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      ...Array(10).fill(loadFixture('spa-heater1.html')),
    ];

    await expect(fetcher.fetch()).rejects.toThrow('Could not reach Default Menu');
    expect(mockPoller.start).toHaveBeenCalled();
  });

  test('returns 429-style error when already fetching', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    mockPollGateway.mockImplementation(() => {
      return new Promise(resolve => setTimeout(() => resolve(pollResponses.shift()), 50));
    });

    const p1 = fetcher.fetch();
    const p2 = fetcher.fetch().catch(e => e);

    const result1 = await p1;
    const err2 = await p2;
    expect(err2).toBeInstanceOf(Error);
    expect(err2.message).toBe('Heat settings fetch already in progress');
    expect(result1.spaHeater).toEqual({ enabled: true, setPoint: 96 });
  });
});
