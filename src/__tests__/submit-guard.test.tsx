import { act, renderHook } from '@testing-library/react-native';

import { useSubmitGuard } from '@/lib/use-submit-guard';

describe('useSubmitGuard (duplicate submission protection)', () => {
  it('ignores a second call while the first is still running, then allows it again', async () => {
    const { result } = await renderHook(() => useSubmitGuard());
    let release!: () => void;
    const action = jest.fn(() => new Promise<string>((res) => { release = () => res('done'); }));

    let first!: Promise<string | undefined>;
    let second: string | undefined = 'untouched';
    await act(async () => {
      first = result.current.run(action);
      second = await result.current.run(action); // same tick, e.g. a double tap
    });
    expect(second).toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      release();
      await first;
    });
    expect(result.current.busy).toBe(false);

    await act(async () => {
      const again = result.current.run(async () => 'ok');
      await again;
    });
  });

  it('releases the guard when the action throws', async () => {
    const { result } = await renderHook(() => useSubmitGuard());
    await act(async () => {
      await expect(result.current.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    });
    expect(result.current.busy).toBe(false);
    let value: string | undefined;
    await act(async () => {
      value = await result.current.run(async () => 'next');
    });
    expect(value).toBe('next');
  });
});
