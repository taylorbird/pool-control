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
    // Real gateway: the Settings Menu screen itself shows "Settings / Menu";
    // a RIGHT press is required to reach the first item (Spa Heater1).
    expect(calls).toEqual([
      '02', // MENU to enter settings
      '01', // RIGHT to Spa Heater1
      '01', // RIGHT to Pool Heater1
      '01', // RIGHT to Spa Solar
      '01', // RIGHT to Pool Solar
      '02', // MENU to find Default Menu
      '01', // RIGHT from Default Menu resumes cycling display immediately
    ]);
  });

  test('throws when a settings screen is not the expected one', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      // wrong screen where Spa Heater1 expected, for every retry poll
      ...Array(5).fill(loadFixture('air-temp.html')),
    ];

    await expect(fetcher.fetch()).rejects.toThrow(/[Ee]xpected.*Spa Heater1/);
    expect(mockPoller.start).toHaveBeenCalled();
  });

  test('re-polls when the screen has not advanced after a keypress', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      loadFixture('spa-heater1.html'),
      loadFixture('spa-heater1.html'), // display lagging: still on Spa Heater1 after RIGHT
      loadFixture('pool-heater1.html'),
      loadFixture('spa-solar.html'),
      loadFixture('pool-solar.html'),
      loadFixture('default-menu.html'),
    ];

    const result = await fetcher.fetch();

    expect(result.poolHeater).toEqual({ enabled: false, setPoint: null });
    expect(result.poolSolar).toEqual({ enabled: true, setPoint: 89 });
  });

  test('attempts to exit the menu after a failed fetch', async () => {
    pollResponses = [
      loadFixture('settings-menu.html'),
      ...Array(3).fill(loadFixture('air-temp.html')), // Spa Heater1 never appears
      loadFixture('default-menu.html'), // recovery MENU press reaches Default Menu
    ];

    await expect(fetcher.fetch()).rejects.toThrow(/[Ee]xpected.*Spa Heater1/);

    const calls = mockSendCommand.mock.calls.map(c => c[0]);
    // MENU to enter settings, RIGHT toward Spa Heater1 (which never appears),
    // then recovery: MENU toward Default Menu, RIGHT to resume cycling display
    expect(calls).toEqual(['02', '01', '02', '01']);
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
