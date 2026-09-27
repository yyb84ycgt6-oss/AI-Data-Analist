// mining-economics.ts
// Session economics for a supervised mining run, using only measured inputs.
// Nothing here forecasts earnings: every number is derived from values the
// operator measured (hashrate, wall power) or looked up with a source (q, tariff).
//
//   G      = H × q × t                      gross theoretical session revenue
//   R      = G × (1 − d) × (1 − s) × (1 − p) revenue after donation, rejects, pool fee
//   E      = (Wmining − Widle) × t / 1000   attributable energy, kWh
//   profit = R − F − E × c

export interface MiningInputs {
  hashrate: number;             // H  — measured average raw hashrate, algorithm's unit
  revenuePerUnitHour: number;   // q  — CAD per hashrate-unit per hour
  hours: number;                // t
  donationFraction: number;     // d  — e.g. 0.01 for XMRig's default 1% donation
  rejectFraction: number;       // s  — rejected/stale share of work
  poolFeeFraction: number;      // p
  payoutFeesCad: number;        // F  — payout/conversion charges allocated to this session
  miningWatts: number;          // average wall power while mining
  idleWatts: number;            // wall power the machine would draw anyway
  tariffCadPerKwh: number;      // c
}

export interface MiningResult {
  grossRevenue: number;           // G
  netRevenue: number;             // R
  energyKwh: number;              // E
  energyCost: number;             // E × c
  profit: number;                 // R − F − E × c
  profitPerHour: number;
  profitPer30Days: number;        // straight-line extrapolation of this session, not a forecast
  breakEvenTariff: number | null; // c at which profit = 0; null when E = 0
  breakEvenQ: number | null;      // q at which profit = 0; null when no payable work
}

export const XMRIG_DEFAULT_DONATION = 0.01;

export function validateInputs(i: MiningInputs): string[] {
  const errors: string[] = [];
  const nonNegative: [keyof MiningInputs, string][] = [
    ['hashrate', 'Hashrate'],
    ['revenuePerUnitHour', 'Revenue per unit-hour (q)'],
    ['payoutFeesCad', 'Payout fees (F)'],
    ['miningWatts', 'Mining wall power'],
    ['idleWatts', 'Idle wall power'],
    ['tariffCadPerKwh', 'Tariff (c)'],
  ];
  for (const [key, label] of nonNegative) {
    if (!Number.isFinite(i[key]) || i[key] < 0) errors.push(`${label} must be a number ≥ 0.`);
  }
  if (!Number.isFinite(i.hours) || i.hours <= 0) errors.push('Session hours must be greater than 0.');
  const fractions: [keyof MiningInputs, string][] = [
    ['donationFraction', 'Donation fraction (d)'],
    ['rejectFraction', 'Reject/stale fraction (s)'],
    ['poolFeeFraction', 'Pool fee fraction (p)'],
  ];
  for (const [key, label] of fractions) {
    if (!Number.isFinite(i[key]) || i[key] < 0 || i[key] >= 1) errors.push(`${label} must be in [0, 1).`);
  }
  if (Number.isFinite(i.miningWatts) && Number.isFinite(i.idleWatts) && i.idleWatts > i.miningWatts) {
    errors.push('Idle wall power cannot exceed mining wall power.');
  }
  return errors;
}

export function computeSession(i: MiningInputs): MiningResult {
  const errors = validateInputs(i);
  if (errors.length > 0) throw new Error(errors.join(' '));

  const keep = (1 - i.donationFraction) * (1 - i.rejectFraction) * (1 - i.poolFeeFraction);
  const grossRevenue = i.hashrate * i.revenuePerUnitHour * i.hours;
  const netRevenue = grossRevenue * keep;
  const energyKwh = ((i.miningWatts - i.idleWatts) * i.hours) / 1000;
  const energyCost = energyKwh * i.tariffCadPerKwh;
  const profit = netRevenue - i.payoutFeesCad - energyCost;
  const profitPerHour = profit / i.hours;

  const payableUnitHours = i.hashrate * i.hours * keep;

  return {
    grossRevenue,
    netRevenue,
    energyKwh,
    energyCost,
    profit,
    profitPerHour,
    profitPer30Days: profitPerHour * 24 * 30,
    breakEvenTariff: energyKwh > 0 ? (netRevenue - i.payoutFeesCad) / energyKwh : null,
    breakEvenQ: payableUnitHours > 0 ? (i.payoutFeesCad + energyCost) / payableUnitHours : null,
  };
}

// Converts a calculator/pool quote ("X CAD per day at Y hashrate") into q.
export function qFromQuote(revenueCad: number, quotedHashrate: number, quotedHours = 24): number {
  if (!(quotedHashrate > 0) || !(quotedHours > 0) || !(revenueCad >= 0)) {
    throw new Error('Quote needs revenue ≥ 0, hashrate > 0 and hours > 0.');
  }
  return revenueCad / (quotedHashrate * quotedHours);
}
