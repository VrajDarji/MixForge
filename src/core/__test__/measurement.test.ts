import { measurement, Measurement } from '../measurement';

describe('measurement()', () => {
  it('builds a Measurement with all four fields set exactly as passed', () => {
    const m: Measurement<number> = measurement(120, 0.83, 'BpmDetectorV1', '1.0.0');
    expect(m.value).toBe(120);
    expect(m.confidence).toBe(0.83);
    expect(m.detector).toBe('BpmDetectorV1');
    expect(m.version).toBe('1.0.0');
  });

  it('preserves non-numeric value types generically', () => {
    const m: Measurement<string> = measurement('G Minor', 0.6, 'KeyDetectorV2', '2.1.0');
    expect(m.value).toBe('G Minor');
  });
});
