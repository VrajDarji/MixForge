import { calibrate } from '../lib';
import { measurement } from '../../core';

describe('calibrate()', () => {
  it('passes the raw value through unchanged at confidence 1.0', () => {
    const m = measurement(0.8, 1.0, 'test', '1.0.0');
    expect(calibrate(m, (v) => v)).toBeCloseTo(0.8);
  });

  it('fully replaces the raw value with neutral at confidence 0.0', () => {
    const m = measurement(0.8, 0.0, 'test', '1.0.0');
    expect(calibrate(m, (v) => v)).toBeCloseTo(0.5);
  });

  it('lerps proportionally at partial confidence', () => {
    const m = measurement(1.0, 0.5, 'test', '1.0.0');
    // neutral(0.5) + 0.5 * (1.0 - 0.5) = 0.75
    expect(calibrate(m, (v) => v)).toBeCloseTo(0.75);
  });

  it('respects a custom neutral point', () => {
    const m = measurement(0, 0.0, 'test', '1.0.0');
    expect(calibrate(m, (v) => v, 0.2)).toBeCloseTo(0.2);
  });

  it('lerps boolean-derived signals via toScalar', () => {
    const m = measurement(false, 0.1, 'test', '1.0.0');
    // neutral(0.5) + 0.1 * (0 - 0.5) = 0.45
    expect(calibrate(m, (v) => (v ? 1 : 0))).toBeCloseTo(0.45);
  });
});
