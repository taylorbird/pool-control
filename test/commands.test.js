const { createCommandQueue } = require('../src/commands');

describe('command queue', () => {
  let queue;
  let mockSendCommand;

  beforeEach(() => {
    mockSendCommand = jest.fn().mockResolvedValue();
    queue = createCommandQueue(mockSendCommand, { commandDelay: 0 });
  });

  test('executes a command', async () => {
    const result = await queue.execute('filter', '08');
    expect(result).toEqual({ success: true, command: 'filter' });
    expect(mockSendCommand).toHaveBeenCalledWith('08');
  });

  test('rejects concurrent commands', async () => {
    mockSendCommand.mockImplementation(() => new Promise(r => setTimeout(r, 50)));
    const p1 = queue.execute('filter', '08');
    const p2 = queue.execute('lights', '09');

    const result1 = await p1;
    const result2 = await p2;

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Command in progress');
  });

  test('allows next command after previous completes', async () => {
    mockSendCommand.mockResolvedValue();
    const result1 = await queue.execute('filter', '08');
    expect(result1.success).toBe(true);

    const result2 = await queue.execute('lights', '09');
    expect(result2.success).toBe(true);
    expect(mockSendCommand).toHaveBeenCalledTimes(2);
  });

  test('returns error when sendCommand throws', async () => {
    mockSendCommand.mockRejectedValue(new Error('Gateway unavailable'));
    const result = await queue.execute('filter', '08');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Gateway unavailable');
  });
});
