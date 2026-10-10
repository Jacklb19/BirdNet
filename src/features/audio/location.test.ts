import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_OPTIONS, watchApproximateLocation } from './location';

/** Constants of `GeolocationPositionError`, which jsdom does not provide. */
const POSITION_ERROR = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as const;

interface FakeDevice {
  report: PositionCallback;
  fail: (code: number) => void;
  clearWatch: ReturnType<typeof vi.fn>;
  options: () => PositionOptions | undefined;
}

function stubGeolocation(watchId: number): FakeDevice {
  const watch: { success?: PositionCallback; failure?: PositionErrorCallback | null; options?: PositionOptions } = {};
  const clearWatch = vi.fn();
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: (success: PositionCallback, failure?: PositionErrorCallback | null, options?: PositionOptions) => {
        Object.assign(watch, { success, failure, options });
        return watchId;
      },
      clearWatch,
    },
  });
  return {
    report: (position) => { watch.success?.(position); },
    fail: (code) => { watch.failure?.({ code, ...POSITION_ERROR } as unknown as GeolocationPositionError); },
    clearWatch,
    options: () => watch.options,
  };
}

const position = (latitude: number, longitude: number): GeolocationPosition => (
  { coords: { latitude, longitude } } as GeolocationPosition
);

describe('watchApproximateLocation', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('requests GPS fixes, reports only the ~10 m cell and stops the watch', () => {
    const device = stubGeolocation(7);
    const onChange = vi.fn();
    const stop = watchApproximateLocation(onChange);
    expect(device.options()).toBe(LOCATION_OPTIONS);
    expect(LOCATION_OPTIONS.enableHighAccuracy).toBe(true);

    device.report(position(4.6512345, -74.0834567));
    expect(onChange).toHaveBeenLastCalledWith({ latitude: 4.6512, longitude: -74.0835 });

    stop();
    expect(device.clearWatch).toHaveBeenCalledWith(7);
  });

  it('keeps the last cell on a timeout and clears it when the position is denied or invalid', () => {
    const device = stubGeolocation(1);
    const onChange = vi.fn();
    watchApproximateLocation(onChange);
    device.report(position(4.65, -74.08));
    device.fail(POSITION_ERROR.TIMEOUT);
    expect(onChange).toHaveBeenCalledTimes(1);
    device.fail(POSITION_ERROR.PERMISSION_DENIED);
    expect(onChange).toHaveBeenLastCalledWith(null);
    device.report(position(Number.NaN, 0));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('does nothing where geolocation is unavailable', () => {
    vi.stubGlobal('navigator', {});
    const onChange = vi.fn();
    expect(() => { watchApproximateLocation(onChange)(); }).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });
});
