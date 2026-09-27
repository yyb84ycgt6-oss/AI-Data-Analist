import { describe, expect, it } from 'vitest';
import { computeSession, qFromQuote, validateInputs, type MiningInputs } from '@/lib/mining-economics';

const base: MiningInputs = {
  hashrate: 30, revenuePerUnitHour: 0.002, hours: 24,
  donationFraction: 0.01, rejectFraction: 0.02, poolFeeFraction: 0.01,
  payoutFeesCad: 0.05, miningWatts: 320, idleWatts: 70, tariffCadPerKwh: 0.1,
};

describe('computeSession', () => {
  it('matches a hand-computed session', () => {
    const r = computeSession(base);
    const keep = 0.99 * 0.98 * 0.99;
    expect(r.grossRevenue).toBeCloseTo(1.44, 10);            // 30 × 0.002 × 24
    expect(r.netRevenue).toBeCloseTo(1.44 * keep, 10);
    expect(r.energyKwh).toBeCloseTo(6, 10);                  // (320 − 70) × 24 / 1000
    expect(r.energyCost).toBeCloseTo(0.6, 10);
    expect(r.profit).toBeCloseTo(1.44 * keep - 0.05 - 0.6, 10);
    expect(r.profitPerHour).toBeCloseTo(r.profit / 24, 10);
    expect(r.profitPer30Days).toBeCloseTo(r.profit * 30, 10);
    expect(r.breakEvenTariff).toBeCloseTo((1.44 * keep - 0.05) / 6, 10);
    expect(r.breakEvenQ).toBeCloseTo(0.65 / (30 * 24 * keep), 12);
  });

  it('profit is exactly zero at the break-even tariff and break-even q', () => {
    const r = computeSession(base);
    expect(computeSession({ ...base, tariffCadPerKwh: r.breakEvenTariff! }).profit).toBeCloseTo(0, 10);
    expect(computeSession({ ...base, revenuePerUnitHour: r.breakEvenQ! }).profit).toBeCloseTo(0, 10);
  });

  it('reports a loss when the tariff is above break-even', () => {
    const r = computeSession({ ...base, tariffCadPerKwh: 0.3 });
    expect(r.profit).toBeLessThan(0);
    expect(0.3).toBeGreaterThan(r.breakEvenTariff!);
  });

  it('returns null break-even tariff when no energy is attributable', () => {
    const r = computeSession({ ...base, miningWatts: 100, idleWatts: 100 });
    expect(r.energyKwh).toBe(0);
    expect(r.breakEvenTariff).toBeNull();
  });

  it('returns null break-even q when there is no payable work', () => {
    expect(computeSession({ ...base, hashrate: 0 }).breakEvenQ).toBeNull();
  });

  it('throws on invalid inputs', () => {
    expect(() => computeSession({ ...base, poolFeeFraction: 1 })).toThrow(/Pool fee/);
  });
});

describe('validateInputs', () => {
  it('accepts valid inputs', () => {
    expect(validateInputs(base)).toEqual([]);
  });

  it.each([
    [{ hashrate: -1 }, /Hashrate/],
    [{ tariffCadPerKwh: NaN }, /Tariff/],
    [{ hours: 0 }, /hours/],
    [{ donationFraction: 1 }, /Donation/],
    [{ rejectFraction: -0.1 }, /Reject/],
    [{ idleWatts: 400 }, /Idle wall power cannot exceed/],
  ] as [Partial<MiningInputs>, RegExp][])('rejects %o', (patch, message) => {
    expect(validateInputs({ ...base, ...patch }).join(' ')).toMatch(message);
  });
});

describe('qFromQuote', () => {
  it('converts a daily quote into CAD per unit-hour', () => {
    expect(qFromQuote(1.44, 30)).toBeCloseTo(0.002, 12);
    expect(qFromQuote(0.06, 30, 1)).toBeCloseTo(0.002, 12);
  });

  it('round-trips: with no losses, G equals the quoted revenue', () => {
    const q = qFromQuote(2.5, 45);
    const r = computeSession({ ...base, hashrate: 45, revenuePerUnitHour: q, donationFraction: 0, rejectFraction: 0, poolFeeFraction: 0 });
    expect(r.grossRevenue).toBeCloseTo(2.5, 10);
    expect(r.netRevenue).toBeCloseTo(2.5, 10);
  });

  it('rejects a zero-hashrate quote', () => {
    expect(() => qFromQuote(1, 0)).toThrow();
  });
});
