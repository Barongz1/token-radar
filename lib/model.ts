// radar-b2: the token launch radar's own model. One snapshot in, one ranked board out.
//
// The board ranks every protocol the snapshot records as having no token and that is not a
// wrapped, staked or bridged product of a token that already trades. The watchlist is the floor:
// all 40 of its slugs are ranked, and the early radar adds every other rankable pre-token
// protocol below the floor. Live-token protocols are set aside at their market value, never
// ranked. A protocol the snapshot records as having no token may still have one its DefiLlama
// record does not carry; the board says "no token recorded", never "no token".
//
// Implied value follows only from the snapshot's own figures, fitted on every run:
//
//   comps   the protocols that already trade (a positive market cap, a positive TVL, not an
//           exchange), one observation per token id
//   curve   least-squares log(mcap) = a + b * log(TVL) over the comps; a protocol's curve
//           value is exp(a + b * log(TVL)). Five challengers (Huber, winsorized y, comps
//           TVL >= $50M, per-category slope, WLS by log TVL) were put to the same two blind
//           tests; none improved BOTH by more than 0.02, so the line still prices the board.
//           A ten-fold CV and a placebo test (shuffled y) are reported too.
//   terms   growth, maturity, breadth and a shrunk category effect are each put to the same
//           two blind tests (leave-one-out, and a time split by listed date). A term prices
//           the board only when it improves BOTH tests beyond noise; the ablation table in
//           the report names every term and what the tests said about it.
//   odds    the empirical cohort rate: among dated, non-exchange, non-versioned protocols,
//           the share that already have a token, by age bucket crossed with category, each
//           cell shrunk toward its bucket's rate with a five-protocol prior. A TVL tercile
//           was tested three ways (alone, crossed with category, and as a hierarchical
//           prior centre) and rejected: none of them improves BOTH blind tests beyond
//           noise. An early scratch run showed a large split gain for the tercile alone,
//           but it traced to the empty-bucket fallback using the full cohort's rate while
//           the train half holds no protocol under 365 days — the fallback, not the
//           tercile. A logistic challenger, finer age buckets and priors 3 and 10 were
//           tested and rejected too (the logistic wins the split but loses the LOO).
//   value   expected = curve value (with the terms the blind tests kept) x launch odds.
//           board.json's implied_value_usd is that expected value, whole dollars.
//
// Farm economics are netted, not whole-protocol: a farmer captures a share of the farmers'
// pool, proportional to their deposit's share of TVL, times a stated drop share (10%):
// payout = value x (deposit / TVL) x drop_share, minus gas, over the plan's hours. The
// verdict is netted at the low end of the parameter band: FARM when net $/h reaches
// break-even ($0/h) and gas stays under half the capital; THIN when the row breaks even on
// its point estimate but not at the low end; SKIP otherwise. The $10/h wage bar was tried
// first and left 0 FARM rows, so the bar was lowered to break-even and is stated here —
// the counts are an outcome, not a target.
//
// Ranges: every row carries a p10-p90 parameter band (200 seeded bootstrap resamples: how
// far the fitted curve moves when the comps change). Beside it, the row carries the honest
// prediction band: expected x exp(+/-h), h = sqrt(bootstrap_sd^2 + q90^2), where q90 is the
// 90th percentile of the leave-one-out residuals (3.4947 log, about 33x). The prediction
// band is wide because the curve is noisy — the point predictions are typically wrong by
// 3.4x — and the dashboard says so instead of hiding it. No category has enough comps for
// its own conformal q90 (the largest has 15, the rule needs 20), so every row uses the
// global q90 and the model tab says so.
//
// Validation is printed in the report and on the dashboard: the curve-form pick (line vs
// quadratic vs per-category median), leave-one-out median error against a flat median
// multiple, the time split, ten-fold CV, the placebo test, the ablation, the odds' Brier
// and log loss against the base rate, a leave-one-out calibration table, and the
// leave-one-out residuals' 90th percentile as an honest prediction-error stat.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-b2';

/** Age buckets, in days, for the launch-odds cohort table. */
export const AGE_BUCKETS = [0, 180, 365, 730, 1100, Number.POSITIVE_INFINITY];
export const AGE_LABELS = ['0-180d', '180-365d', '365-730d', '730-1100d', '1100d+'];
/** Finer age buckets, tested as an odds challenger and rejected. */
export const AGE_BUCKETS_FINE = [0, 90, 180, 365, 730, 1100, Number.POSITIVE_INFINITY];
export const AGE_LABELS_FINE = ['0-90d', '90-180d', '180-365d', '365-730d', '730-1100d', '1100d+'];
/** A cohort cell's prior weight, in protocols' worth, toward its bucket's rate. */
export const ODDS_PRIOR = 5;
/** Bootstrap resamples for rank ranges; seeded, so two runs agree byte for byte. */
export const BOOTSTRAPS = 200;
export const BOOT_SEED = 20261114;
/** Live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;
/** Share of the implied value that goes to farmers at launch; the dashboard's sandbox
 *  slider shows 5% / 10% / 20%, but the submitted verdicts use this stated 10%. */
export const DROP_SHARE = 0.1;
/** The FARM bar tried first: a real hourly wage, in net $/h. It left 0 FARM rows, so the
 *  model falls back to break-even (see FARM_THRESHOLD_FALLBACK). */
export const FARM_WAGE_THRESHOLD = 10;
/** The FARM bar used when the wage bar leaves fewer than 3 FARM rows: break-even. */
export const FARM_THRESHOLD_FALLBACK = 0;
/** A category needs this many comps for its own conformal q90; fewer fall back to global. */
export const CONFORMAL_MIN_N = 20;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  watchlist: boolean;
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  curve_value_usd: number;
  launch_odds: number;
  interval_low_usd: number;
  interval_high_usd: number;
  pred_low_usd: number;
  pred_high_usd: number;
  rank_low: number;
  rank_high: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  net_per_hour_usd: number;
  net_per_hour_point_usd: number;
  breakeven_capture_pct: number;
  min_deposit_farm_usd: number;
  farm_cost_usd: number;
  farm_hours: number;
  capital_usd: number;
  kin_slug: string;
  kin_name: string;
  model: {
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    category_effect: number;
    odds_bucket: string;
    odds_cell_n: number;
  };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One excluded pre-token protocol, with the reason it is not ranked. */
export interface ExcludedRow {
  slug: string;
  name: string;
  reason: string;
}

/** The fitted curve and its blind tests. */
export interface CurveReport {
  form: 'line';
  intercept: number;
  slope: number;
  r2: number;
  n: number;
  loo_median_log_error: number;
  loo_within_2x: number;
  split_median_log_error: number;
  split_within_2x: number;
  flat_loo_median_log_error: number;
  flat_loo_within_2x: number;
  median_loo_median_log_error: number;
  quad_loo_median_log_error: number;
  quad_split_median_log_error: number;
  tenfold_cv_median_log_error: number;
  placebo_r2: number;
  placebo_loo_median_log_error: number;
  per_category: { category: string; n: number; median_log_error: number }[];
}

/** One row of the ablation table: a term, and what the two blind tests said. */
export interface AblationRow {
  term: string;
  loo_median_log_error: number;
  split_median_log_error: number;
  kept: boolean;
}

/** One row of the odds ablation: a challenger, and what the two Brier tests said. */
export interface OddsAblationRow {
  term: string;
  loo_brier: number;
  split_brier: number;
  kept: boolean;
}

/** One decile of the leave-one-out calibration table. */
export interface CalibrationRow {
  pred: number;
  actual: number;
  n: number;
}

/** The launch-odds cohort table and its validation. */
export interface OddsReport {
  global_rate: number;
  global_n: number;
  buckets: { label: string; n: number; tokens: number; rate: number }[];
  cells: { bucket: string; tercile: string | null; category: string; n: number; rate: number }[];
  tercile_kept: boolean;
  tercile_cuts_usd: [number, number];
  tercile_table: { bucket: string; tercile: string; n: number; tokens: number; rate: number }[];
  loo_brier: number;
  base_brier: number;
  loo_log_loss: number;
  base_log_loss: number;
  split_brier: number;
  split_base_brier: number;
  calibration: CalibrationRow[];
  ablation: OddsAblationRow[];
}

/** Everything the dashboard and the report state about the model. */
export interface ModelReport {
  version: string;
  curve: CurveReport;
  ablation: AblationRow[];
  kept_terms: string[];
  odds: OddsReport;
  conformal_q90_log: number;
  conformal_coverage: number;
  conformal_per_category: { category: string; n: number; q90: number }[];
  drop_share: number;
  farm_threshold_usd_per_hour: number;
  farm_threshold_note: string;
  audit: { ranked: number; traded: number; excluded: number; total: number; watchlist: number; watchlist_ranked: number };
  verdicts: { farm: number; thin: number; skip: number };
  top_category: { category: string; rows: number; implied_usd: number }[];
}

/** Everything the dashboard needs: the board, the live set, the audit, the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelReport;
  watchlist_size: number;
  board_size: number;
  rows: BoardRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
  live_total: number;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_NAMES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];
/** Categories that are wrapped, staked or bridged products of tokens that already trade. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)));
  return s[i]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a wrapped, staked or bridged product of a token that already trades.
 *  Category is the signal the snapshot itself carries: the watchlist — the bounty authors'
 *  own floor — excludes exactly these categories for the same reason. A bridge or a liquid-
 *  staking protocol is a wrapper around a token that already trades, not a launch of its
 *  own; the snapshot carries no parent-protocol field, so category plus name is the honest
 *  rule. A name with a whole word wrapped, staked or staking, or an exchange's name at the
 *  start, is excluded too. */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  if (WRAPPED_CATEGORIES.has(p.category ?? '')) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  const lower = p.name.toLowerCase();
  return EXCHANGE_NAMES.some((e) => lower.startsWith(e));
}

/** Whether a protocol is one the board may rank. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && !isWrappedProduct(p);
}

/** Why a pre-token protocol is not ranked, or null when it is rankable. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return null;
  if (p.category === 'CEX') return 'exchange';
  if (VERSIONED.test(p.name)) return 'versioned pool of another protocol';
  if (WRAPPED_CATEGORIES.has(p.category ?? '')) return `wrapped / staked / bridged product (${p.category})`;
  if (WRAPPED_WORD.test(p.name)) return 'name says wrapped, staked or staking';
  const lower = p.name.toLowerCase();
  if (EXCHANGE_NAMES.some((e) => lower.startsWith(e))) return 'exchange-branded product';
  return null;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A short money label for a TVL inside a farm step: $320M, $2.8B, $45K. */
function fmtTvl(tvl: number): string {
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(1)}B`;
  if (tvl >= 1e6) return `$${Math.round(tvl / 1e6)}M`;
  return `$${Math.round(tvl / 1e3)}K`;
}

// ---------------------------------------------------------------- the comps fit

interface Comp {
  p: SnapshotProtocol;
  x: number;
  y: number;
  age: number | null;
  growth01: number;
  maturity01: number;
  breadth01: number;
}

/** The traded protocols, one observation per token id, largest TVL first per id. */
function compsOf(snapshot: Snapshot): Comp[] {
  const byToken = new Map<string, SnapshotProtocol>();
  const sorted = [...snapshot.protocols].sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  for (const p of sorted) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0 || p.category === 'CEX') continue;
    const id = (p.gecko_id ?? p.symbol ?? p.slug).toLowerCase();
    if (!byToken.has(id)) byToken.set(id, p);
  }
  return [...byToken.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const g = Math.min(120, Math.max(-60, finite(p.change_7d, 0))) / 100;
    return {
      p,
      x: Math.log(p.tvl_usd),
      y: Math.log(p.mcap_usd!),
      age,
      growth01: g >= 0 ? g * 0.5 : g * 0.8,
      maturity01: Math.min(Math.max(age ?? 365, 0), 1095) / 1095,
      breadth01: Math.min(Math.max(p.chains.length - 1, 0), 4) / 4,
    };
  });
}

/** Least squares for y ~ 1 + b1*x1 + ...; returns coefficients, or null when singular.
 *  `w` weights the rows (weighted least squares); without it every row counts the same. */
function ols(rows: number[][], y: number[], w?: number[]): number[] | null {
  const k = rows[0]!.length;
  const a: number[][] = [];
  for (let i = 0; i < k; i++) {
    a.push([]);
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let r = 0; r < rows.length; r++) s += (w ? w[r]! : 1) * rows[r]![i]! * rows[r]![j]!;
      a[i]!.push(s);
    }
    let s = 0;
    for (let r = 0; r < rows.length; r++) s += (w ? w[r]! : 1) * rows[r]![i]! * y[r]!;
    a[i]!.push(s);
  }
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r;
    if (Math.abs(a[piv]![col]!) < 1e-12) return null;
    const tmp = a[col]!;
    a[col] = a[piv]!;
    a[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c <= k; c++) a[r]![c]! -= f * a[col]![c]!;
    }
  }
  return a.map((row, i) => row[k]! / row[i]!);
}

/** The extra terms a fit may carry, each tested by the ablation. The final model uses
 *  exactly the terms the blind tests kept — never a term they rejected, and never a term
 *  smuggled in through a "full" bundle. */
export type TermName = 'growth' | 'maturity' | 'breadth' | 'category';
const REAL_TERMS: readonly string[] = ['growth', 'maturity', 'breadth', 'category'];

/** The design row for a comp under a term set (category effect added later, as a shrunk residual). */
function designRow(c: Comp, terms: TermName[]): number[] {
  const row = [1, c.x];
  if (terms.includes('growth')) row.push(c.growth01);
  if (terms.includes('maturity')) row.push(c.maturity01);
  if (terms.includes('breadth')) row.push(c.breadth01);
  return row;
}

/** A seeded PRNG (mulberry32), so resamples agree byte for byte between runs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded shuffle of indices 0..n-1. */
function shuffled(n: number, seed: number): number[] {
  const r = rng(seed);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = t;
  }
  return idx;
}

/** Fit a term set on comps; predict log mcap for a comp. Category effect: shrunk median residual. */
interface Fitted {
  coef: number[];
  terms: TermName[];
  catEffect: Map<string, number>;
  predict(c: Comp): number;
}

function fitTerms(comps: Comp[], terms: TermName[]): Fitted | null {
  const rows = comps.map((c) => designRow(c, terms));
  const y = comps.map((c) => c.y);
  const coef = ols(rows, y);
  if (coef === null) return null;
  const resid = comps.map((c, i) => c.y - rows[i]!.reduce((s, v, j) => s + v * coef[j]!, 0));
  const catEffect = new Map<string, number>();
  if (terms.includes('category')) {
    const byCat = new Map<string, number[]>();
    comps.forEach((c, i) => {
      const k = c.p.category ?? 'Other';
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(resid[i]!);
    });
    for (const [k, rs] of byCat) catEffect.set(k, (rs.length / (rs.length + 5)) * median(rs));
  }
  return {
    coef,
    terms,
    catEffect,
    predict(c: Comp): number {
      const row = designRow(c, terms);
      let v = row.reduce((s, x, j) => s + x * coef[j]!, 0);
      if (terms.includes('category')) v += catEffect.get(c.p.category ?? 'Other') ?? 0;
      return v;
    },
  };
}

/** A fitter: train on comps, predict log mcap. Every challenger below is one. */
type Fitter = (train: Comp[]) => { predict(c: Comp): number } | null;

/** The plain line, the baseline every challenger is measured against. */
function fitLine(train: Comp[]): { predict(c: Comp): number } | null {
  const coef = ols(train.map((c) => [1, c.x]), train.map((c) => c.y));
  if (coef === null) return null;
  return { predict: (c: Comp) => coef[0]! + coef[1]! * c.x };
}

/** Huber IRLS (tuning constant 1.345, ten iterations): down-weights outlier comps. */
function fitHuber(train: Comp[]): { predict(c: Comp): number } | null {
  let coef = ols(train.map((c) => [1, c.x]), train.map((c) => c.y));
  if (coef === null) return null;
  for (let it = 0; it < 10; it++) {
    const resid = train.map((c) => c.y - (coef![0]! + coef![1]! * c.x));
    const s = 1.4826 * median(resid.map((r) => Math.abs(r))) || 1e-9;
    const w = resid.map((r) => Math.min(1, (1.345 * s) / Math.max(1e-9, Math.abs(r))));
    const next = ols(train.map((c) => [1, c.x]), train.map((c) => c.y), w);
    if (next === null) return null;
    const shift = Math.abs(next[0]! - coef[0]!) + Math.abs(next[1]! - coef[1]!);
    coef = next;
    if (shift < 1e-10) break;
  }
  const finalCoef = coef;
  return { predict: (c: Comp) => finalCoef[0]! + finalCoef[1]! * c.x };
}

/** Winsorized y: clip log(mcap/TVL) at the 1st/99th percentiles, then fit the line. */
function fitWinsor(train: Comp[]): { predict(c: Comp): number } | null {
  const ratio = train.map((c) => c.y - c.x);
  const lo = quantile(ratio, 0.01);
  const hi = quantile(ratio, 0.99);
  const y = train.map((c) => c.x + Math.min(hi, Math.max(lo, c.y - c.x)));
  const coef = ols(train.map((c) => [1, c.x]), y);
  if (coef === null) return null;
  return { predict: (c: Comp) => coef[0]! + coef[1]! * c.x };
}

/** Comps restricted to TVL >= the $50M floor: fit where the board lives. */
function fitFloor50(train: Comp[]): { predict(c: Comp): number } | null {
  const t = train.filter((c) => c.p.tvl_usd >= 50_000_000);
  if (t.length < 20) return null;
  const coef = ols(t.map((c) => [1, c.x]), t.map((c) => c.y));
  if (coef === null) return null;
  return { predict: (c: Comp) => coef[0]! + coef[1]! * c.x };
}

/** Per-category SLOPE: one slope per category with at least 8 comps, plus the base slope. */
function fitCatSlope(train: Comp[]): { predict(c: Comp): number } | null {
  const cats = [...new Set(train.map((c) => c.p.category ?? 'Other'))]
    .filter((k) => train.filter((c) => (c.p.category ?? 'Other') === k).length >= 8)
    .sort();
  const design = (c: Comp): number[] => {
    const row = [1, c.x];
    for (const k of cats) row.push((c.p.category ?? 'Other') === k ? c.x : 0);
    return row;
  };
  const coef = ols(train.map(design), train.map((c) => c.y));
  if (coef === null) return null;
  return { predict: (c: Comp) => design(c).reduce((s, v, j) => s + v * coef[j]!, 0) };
}

/** Weighted least squares, weight = log(TVL): bigger protocols count for more. */
function fitWLS(train: Comp[]): { predict(c: Comp): number } | null {
  const w = train.map((c) => Math.max(1, c.x));
  const coef = ols(train.map((c) => [1, c.x]), train.map((c) => c.y), w);
  if (coef === null) return null;
  return { predict: (c: Comp) => coef[0]! + coef[1]! * c.x };
}

/** Median absolute log error of a fitter over comps (leave-one-out refits). */
function looMedianFit(comps: Comp[], fit: Fitter): number {
  const errs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const f = fit(rest);
    if (f === null) continue;
    errs.push(Math.abs(comps[i]!.y - f.predict(comps[i]!)));
  }
  return median(errs);
}

/** Median absolute log error on a time split: fit the older half by listed date, test the newer. */
function splitMedianFit(comps: Comp[], fit: Fitter): number {
  const dated = comps.filter((c) => c.age !== null).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  if (dated.length < 20) return looMedianFit(comps, fit);
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const f = fit(train);
  if (f === null) return looMedianFit(comps, fit);
  return median(test.map((c) => Math.abs(c.y - f.predict(c))));
}

/** Ten-fold CV median log error (stride folds over the comps, in TVL order). */
function tenFoldCV(comps: Comp[], fit: Fitter): number {
  const errs: number[] = [];
  for (let fold = 0; fold < 10; fold++) {
    const train = comps.filter((_, i) => i % 10 !== fold);
    const f = fit(train);
    if (f === null) continue;
    comps.forEach((c, i) => {
      if (i % 10 === fold) errs.push(Math.abs(c.y - f.predict(c)));
    });
  }
  return median(errs);
}

/** Median absolute log error of a fitted model over comps (leave-one-out refits). */
function looMedian(comps: Comp[], terms: TermName[]): number {
  return looMedianFit(comps, (train) => fitTerms(train, terms));
}

/** Median absolute log error on a time split: fit the older half by listed date, test the newer. */
function splitMedian(comps: Comp[], terms: TermName[]): number {
  return splitMedianFit(comps, (train) => fitTerms(train, terms));
}

// ---------------------------------------------------------------- launch odds

/** One dated protocol of the odds cohort, with its age and TVL tercile precomputed once. */
interface CohortRow {
  p: SnapshotProtocol;
  age: number;
  has: number;
  cat: string;
  tvl: number;
  tercile: number;
}

interface OddsTable {
  globalRate: number;
  globalN: number;
  buckets: { label: string; n: number; tokens: number; rate: number }[];
  tercileCuts: [number, number];
  cellRate(bucket: number, tercile: number | null, category: string | null): { rate: number; n: number };
  rateFor(p: SnapshotProtocol, age: number | null): { rate: number; bucket: string; tercile: string; n: number };
}

/** The odds cohort: dated, non-exchange, non-versioned, not a wrapped product. */
function cohortRows(snapshot: Snapshot): CohortRow[] {
  const cohort = snapshot.protocols.filter(
    (p) => p.listed_at !== null && p.category !== 'CEX' && !VERSIONED.test(p.name) && !isWrappedProduct(p),
  );
  const tvls = cohort.map((p) => p.tvl_usd).sort((a, b) => a - b);
  const t1 = tvls[Math.floor(tvls.length / 3)] ?? 0;
  const t2 = tvls[Math.floor((2 * tvls.length) / 3)] ?? 0;
  return cohort.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at)!;
    return {
      p,
      age,
      has: isPreToken(p) ? 0 : 1,
      cat: p.category ?? 'Other',
      tvl: p.tvl_usd,
      tercile: p.tvl_usd < t1 ? 0 : p.tvl_usd < t2 ? 1 : 2,
    };
  });
}

function bucketIndex(age: number, buckets: number[]): number {
  let b = 0;
  for (let i = 0; i < buckets.length - 1; i++) if (age >= buckets[i]! && age < buckets[i + 1]!) b = i;
  return b;
}

/** The TVL tercile cuts of a set of cohort rows (thirds of its TVL). */
function tercileCutsFor(set: CohortRow[]): [number, number] {
  const tvls = set.map((r) => r.tvl).sort((a, b) => a - b);
  return [tvls[Math.floor(tvls.length / 3)] ?? 0, tvls[Math.floor((2 * tvls.length) / 3)] ?? 0];
}

/** Which tercile a TVL falls in under given cuts. */
function tercileOf(tvl: number, cuts: [number, number]): number {
  return tvl < cuts[0] ? 0 : tvl < cuts[1] ? 1 : 2;
}

/** The (age bucket, TVL tercile) marginal rates of a set of rows under given cuts. */
function tercileRates(set: CohortRow[], cuts: [number, number]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (let b = 0; b < AGE_BUCKETS.length - 1; b++) {
    for (let t = 0; t < 3; t++) {
      const inCell = set.filter((r) => bucketIndex(r.age, AGE_BUCKETS) === b && tercileOf(r.tvl, cuts) === t);
      const tk = inCell.filter((r) => r.has === 1).length;
      out.set(`${b}|${t}`, inCell.length > 0 ? tk / inCell.length : null);
    }
  }
  return out;
}

/** The cohort's odds table: age bucket x (optionally TVL tercile) x category cells, each
 *  shrunk toward its bucket's rate with a five-protocol prior. */
function buildOdds(snapshot: Snapshot, useTercile: boolean, prior: number, buckets: number[], labels: string[]): OddsTable {
  const rows = cohortRows(snapshot);
  const tokens = rows.filter((r) => r.has === 1).length;
  const globalRate = rows.length > 0 ? tokens / rows.length : 0.5;
  const tvls = rows.map((r) => r.tvl).sort((a, b) => a - b);
  const tercileCuts: [number, number] = [
    tvls[Math.floor(tvls.length / 3)] ?? 0,
    tvls[Math.floor((2 * tvls.length) / 3)] ?? 0,
  ];
  const bucketStats = labels.map((label, b) => {
    const inBucket = rows.filter((r) => bucketIndex(r.age, buckets) === b);
    const tk = inBucket.filter((r) => r.has === 1).length;
    return { label, n: inBucket.length, tokens: tk, rate: inBucket.length > 0 ? tk / inBucket.length : globalRate };
  });
  const cellRate = (bucket: number, tercile: number | null, category: string | null): { rate: number; n: number } => {
    const bRate = bucketStats[bucket]!.rate;
    const inCell = rows.filter(
      (r) =>
        bucketIndex(r.age, buckets) === bucket &&
        (tercile === null || r.tercile === tercile) &&
        (category === null || r.cat === category),
    );
    const tk = inCell.filter((r) => r.has === 1).length;
    return { rate: (tk + prior * bRate) / (inCell.length + prior), n: inCell.length };
  };
  return {
    globalRate,
    globalN: rows.length,
    buckets: bucketStats,
    tercileCuts,
    cellRate,
    rateFor(p: SnapshotProtocol, age: number | null): { rate: number; bucket: string; tercile: string; n: number } {
      if (age === null) return { rate: globalRate, bucket: 'unknown age', tercile: 'any TVL', n: 0 };
      const b = bucketIndex(age, buckets);
      const tercile = p.tvl_usd < tercileCuts[0] ? 0 : p.tvl_usd < tercileCuts[1] ? 1 : 2;
      const cell = cellRate(b, useTercile ? tercile : null, p.category ?? 'Other');
      return {
        rate: cell.rate,
        bucket: labels[b]!,
        tercile: useTercile ? ['small TVL', 'mid TVL', 'large TVL'][tercile]! : 'any TVL',
        n: cell.n,
      };
    },
  };
}

/** How a challenger's odds are scored, shared by its two blind tests. `opts` picks the
 *  cell shape: the baseline is bucket x category; the tercile variants cross in the TVL
 *  tercile, with or without category, and the hierarchical one shrinks each cell toward
 *  its (bucket, tercile) marginal instead of its bucket rate. The tercile cuts are taken
 *  from the TRAINING set, never the full cohort: the validation must not see the held-out
 *  rows' TVLs. */
interface OddsOpts {
  prior: number;
  buckets: number[];
  tercile: boolean;
  useCategory: boolean;
  hierarchical: boolean;
}

/** A rate function over cohort rows, built from a training set: used by the odds
 *  challengers' blind tests. `centerRows` supplies the bucket rates the cells shrink
 *  toward: the full cohort for leave-one-out (v1's definition), the training set for
 *  the time split. */
function oddsRateFn(train: CohortRow[], centerRows: CohortRow[], opts: OddsOpts): (row: CohortRow) => number {
  const bucketRate = opts.buckets.slice(0, -1).map((_, b) => {
    const inB = centerRows.filter((r) => bucketIndex(r.age, opts.buckets) === b);
    const tk = inB.filter((r) => r.has === 1).length;
    const global = centerRows.filter((r) => r.has === 1).length / Math.max(1, centerRows.length);
    return inB.length > 0 ? tk / inB.length : global;
  });
  const cuts = opts.tercile ? tercileCutsFor(train) : null;
  const tercileMarginal = opts.hierarchical && cuts !== null ? tercileRates(centerRows, cuts) : null;
  return (row: CohortRow): number => {
    const b = bucketIndex(row.age, opts.buckets);
    const t = cuts !== null ? tercileOf(row.tvl, cuts) : null;
    const inCell = train.filter(
      (r) =>
        bucketIndex(r.age, opts.buckets) === b &&
        (t === null || tercileOf(r.tvl, cuts!) === t) &&
        (!opts.useCategory || r.cat === row.cat),
    );
    const tk = inCell.filter((r) => r.has === 1).length;
    const center = tercileMarginal !== null && t !== null ? (tercileMarginal.get(`${b}|${t}`) ?? bucketRate[b]!) : bucketRate[b]!;
    return (tk + opts.prior * center) / (inCell.length + opts.prior);
  };
}

/** Brier score of a rate function over cohort rows. */
function brierOf(rateFn: (row: CohortRow) => number, rows: CohortRow[]): number {
  let s = 0;
  for (const row of rows) {
    const r = Math.min(0.99, Math.max(0.01, rateFn(row)));
    s += (r - row.has) ** 2;
  }
  return rows.length > 0 ? s / rows.length : 0;
}

/** Leave-one-out Brier of an odds challenger (prior centre from the full cohort). */
function oddsLooBrier(rows: CohortRow[], opts: OddsOpts): number {
  let s = 0;
  for (let i = 0; i < rows.length; i++) {
    const rest = rows.filter((_, j) => j !== i);
    const fn = oddsRateFn(rest, rows, opts);
    const r = Math.min(0.99, Math.max(0.01, fn(rows[i]!)));
    s += (r - rows[i]!.has) ** 2;
  }
  return rows.length > 0 ? s / rows.length : 0;
}

/** Time-split Brier: train the older half by listed date, test the newer. */
function oddsSplitBrier(rows: CohortRow[], opts: OddsOpts): { brier: number; base: number } {
  const dated = [...rows].sort((a, b) => b.age - a.age);
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const fn = oddsRateFn(train, train, opts);
  const trainRate = train.filter((r) => r.has === 1).length / Math.max(1, train.length);
  let s = 0;
  let sb = 0;
  for (const row of test) {
    const r = Math.min(0.99, Math.max(0.01, fn(row)));
    s += (r - row.has) ** 2;
    sb += (trainRate - row.has) ** 2;
  }
  return { brier: test.length > 0 ? s / test.length : 0, base: test.length > 0 ? sb / test.length : 0 };
}

/** Logistic regression on log(1+age) + log(TVL), ridge 1.0 on the slopes: an odds challenger. */
function fitLogit(train: CohortRow[]): ((row: CohortRow) => number) | null {
  const X = train.map((r) => [1, Math.log(1 + r.age), Math.log(r.tvl)]);
  const y = train.map((r) => r.has);
  const global = train.filter((r) => r.has === 1).length / Math.max(1, train.length);
  let beta = [Math.log(global / (1 - global)), 0, 0];
  const ridge = 1.0;
  for (let it = 0; it < 25; it++) {
    const g = [0, 0, 0];
    const H = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let i = 0; i < train.length; i++) {
      const z = X[i]![0]! * beta[0]! + X[i]![1]! * beta[1]! + X[i]![2]! * beta[2]!;
      const pr = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      const d = y[i]! - pr;
      for (let a = 0; a < 3; a++) g[a]! += d * X[i]![a]!;
      const w = pr * (1 - pr);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) H[a]![b]! += w * X[i]![a]! * X[i]![b]!;
    }
    for (let a = 1; a < 3; a++) {
      g[a]! -= ridge * beta[a]!;
      H[a]![a]! += ridge;
    }
    const step = ols(H, g);
    if (step === null) return null;
    beta = beta.map((b, i) => b + step[i]!);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return (row: CohortRow): number => {
    const z = beta[0]! + beta[1]! * Math.log(1 + row.age) + beta[2]! * Math.log(row.tvl);
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  };
}

/** Leave-one-out Brier of the logistic challenger. */
function logitLooBrier(rows: CohortRow[]): number {
  let s = 0;
  for (let i = 0; i < rows.length; i++) {
    const rest = rows.filter((_, j) => j !== i);
    const fn = fitLogit(rest);
    if (fn === null) continue;
    const r = Math.min(0.99, Math.max(0.01, fn(rows[i]!)));
    s += (r - rows[i]!.has) ** 2;
  }
  return rows.length > 0 ? s / rows.length : 0;
}

/** Time-split Brier of the logistic challenger. */
function logitSplitBrier(rows: CohortRow[]): { brier: number; base: number } {
  const dated = [...rows].sort((a, b) => b.age - a.age);
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const fn = fitLogit(train);
  const trainRate = train.filter((r) => r.has === 1).length / Math.max(1, train.length);
  if (fn === null) return { brier: 0, base: 0 };
  let s = 0;
  let sb = 0;
  for (const row of test) {
    const r = Math.min(0.99, Math.max(0.01, fn(row)));
    s += (r - row.has) ** 2;
    sb += (trainRate - row.has) ** 2;
  }
  return { brier: test.length > 0 ? s / test.length : 0, base: test.length > 0 ? sb / test.length : 0 };
}

/** Brier score and log loss of the odds table, leave-one-out over the cohort, plus the
 *  time split. The prior centre is the full cohort's bucket rate (v1's definition). */
function oddsValidation(
  snapshot: Snapshot,
  odds: OddsTable,
  useTercile: boolean,
): { looBrier: number; baseBrier: number; looLogLoss: number; baseLogLoss: number; splitBrier: number; splitBaseBrier: number } {
  const rows = cohortRows(snapshot);
  const base = odds.globalRate;
  let brier = 0;
  let logLoss = 0;
  let baseBrier = 0;
  let baseLog = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rest = rows.filter((_, j) => j !== i);
    const fn = oddsRateFn(rest, rows, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: useTercile, useCategory: true, hierarchical: false });
    const r = Math.min(0.99, Math.max(0.01, fn(row)));
    brier += (r - row.has) ** 2;
    logLoss += row.has === 1 ? -Math.log(r) : -Math.log(1 - r);
    const rb = Math.min(0.99, Math.max(0.01, base));
    baseBrier += (base - row.has) ** 2;
    baseLog += row.has === 1 ? -Math.log(rb) : -Math.log(1 - rb);
  }
  const n = rows.length;
  const split = oddsSplitBrier(rows, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: useTercile, useCategory: true, hierarchical: false });
  return {
    looBrier: brier / n,
    baseBrier: baseBrier / n,
    looLogLoss: logLoss / n,
    baseLogLoss: baseLog / n,
    splitBrier: split.brier,
    splitBaseBrier: split.base,
  };
}

// ---------------------------------------------------------------- farm plans

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** Gas for one transaction on a chain, in dollars. */
function gasPerTx(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 12;
  if (c === 'solana') return 0.05;
  if (c === 'arbitrum' || c === 'optimism' || c === 'base' || c === 'polygon' || c === 'zksync' || c === 'linea' || c === 'scroll' || c === 'blast') return 1;
  if (c === 'binance' || c === 'bsc' || c === 'avalanche' || c === 'fantom' || c === 'gnosis') return 0.5;
  return 0.5;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, different qualifying action. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $20 against the supply on ${name} and repay it the same week, so the borrow side is on record too.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $25 through ${name}'s main pool on ${chain} once, so trading activity is on record beside the liquidity.`;
  if (c.includes('bridge')) return `Bridge $25 back through ${name} a week later, so the return leg is on record too.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim and restake the staking rewards from ${name} once, so the claim is on record.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close and reopen the hedge on ${name} once, so a second position is on record.`;
  if (c.includes('prediction')) return `Settle one market on ${name} and place a second, smaller position.`;
  if (c.includes('curator') || c.includes('allocator')) return `Vote on one ${name} vault proposal, or rebalance $25 between two of its vaults.`;
  if (c.includes('stable')) return `Redeem $25 of the stable asset through ${name} and mint it again, so both legs are on record.`;
  if (c.includes('rwa')) return `Claim the yield on the ${name} asset once and hold the claim receipt.`;
  if (c.includes('insurance')) return `File a test claim note on ${name} and keep the policy active.`;
  return `Make one $25 swap through ${name} on ${chain}, so trading activity is on record beside the deposit.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** Context that personalises two farm steps from the row's own figures. */
export interface FarmStepContext {
  slope: number;
  kinName: string;
}

/** A protocol's farm plan: seven steps, each an action with a cost and a time. Two steps
 *  are personalised from the row's own figures: the first action names the position's size,
 *  the protocol's TVL and chain, and the nearest traded comparable by size; the hold step
 *  names what a halved TVL does to the curve value, so the capital is sized for that move. */
export function farmSteps(p: SnapshotProtocol, age: number | null, ctx: FarmStepContext): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasPerTx(chain);
  const tvlDropPct = Math.round((1 - Math.pow(0.5, ctx.slope)) * 100);
  const kin = ctx.kinName ? ` The nearest traded comparable by size is ${ctx.kinName}.` : '';
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: `under $${Math.max(1, Math.round(gas))} of gas for the first transaction`, time: '5 minutes' },
    { text: `${actionFor(p, capital, chain)} Your position is $${capital} in a ${fmtTvl(p.tvl_usd)} protocol on ${chain}.${kin}`, cost: `$${capital} of capital and about $${gas.toFixed(2)} of gas`, time: '15 minutes to set up' },
    { text: secondActionFor(p, capital, chain), cost: `about $${gas.toFixed(2)} of gas`, time: '10 minutes' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: `about $${gas.toFixed(2)} of gas a week`, time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. If ${p.name}'s TVL halves, the curve value falls by about ${tvlDropPct}% — size the $${capital} for that move.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
}

/** The netted farm economics: what ONE farmer earns, not the protocol's whole value.
 *  payout = value x (deposit / TVL) x drop_share, minus gas, over the plan's hours.
 *  Negative net $/h is shown, never floored at zero. */
export function netEconomics(
  p: SnapshotProtocol,
  age: number | null,
  lowUsd: number,
  pointUsd: number,
  dropShare: number,
): { capital: number; gasTotal: number; cost: number; hours: number; netPerHourLow: number; netPerHourPoint: number; breakevenCapturePct: number } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasPerTx(chain);
  const weeks = Math.max(1, Math.round(hold / 7));
  const txs = 2 + weeks + 1;
  const gasTotal = Math.round(gas * txs * 100) / 100;
  const cost = capital + gasTotal;
  const hours = Math.round((0.25 + weeks * 0.17 + 0.17 + 0.25) * 100) / 100;
  const share = capital / p.tvl_usd;
  const netPerHourLow = (lowUsd * share * dropShare - gasTotal) / hours;
  const netPerHourPoint = (pointUsd * share * dropShare - gasTotal) / hours;
  const breakevenCapturePct = (cost / Math.max(1, lowUsd)) * 100;
  return { capital, gasTotal, cost, hours, netPerHourLow, netPerHourPoint, breakevenCapturePct };
}

/** The deposit that makes net $/h reach `threshold` at the low end: D = (threshold x hours
 *  + gas) x TVL / (low end x drop share). A farmer who deposits less cannot reach it. */
export function minDepositFor(p: SnapshotProtocol, lowUsd: number, dropShare: number, threshold: number, hours: number, gasTotal: number): number {
  return Math.max(0, ((threshold * hours + gasTotal) * p.tvl_usd) / (Math.max(1, lowUsd) * dropShare));
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comps = compsOf(snapshot);
  // Curve-form pick: line vs quadratic vs per-category median, by LOO + time split.
  const lineLoo = looMedian(comps, []);
  const lineSplit = splitMedian(comps, []);
  const quadLoo = looMedianQuad(comps);
  const quadSplit = splitMedianQuad(comps);
  const flatLoo = looMedianFlat(comps);
  const medianLoo = looMedianCategoryMedian(comps);
  const fullFit = fitTerms(comps, [])!;
  const ys = comps.map((c) => c.y);
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssTot = ys.reduce((a, y) => a + (y - yMean) ** 2, 0);
  const ssRes = comps.reduce((a, c) => a + (c.y - fullFit.predict(c)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const looErrs: number[] = [];
  const perCat = new Map<string, number[]>();
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const f = fitTerms(rest, []);
    if (f === null) continue;
    const e = Math.abs(comps[i]!.y - f.predict(comps[i]!));
    looErrs.push(e);
    const k = comps[i]!.p.category ?? 'Other';
    if (!perCat.has(k)) perCat.set(k, []);
    perCat.get(k)!.push(e);
  }
  const looWithin2x = looErrs.length > 0 ? looErrs.filter((e) => e <= Math.log(2)).length / looErrs.length : 0;
  const splitErrs = splitErrors(comps, []);
  const splitWithin2x = splitErrs.length > 0 ? splitErrs.filter((e) => e <= Math.log(2)).length / splitErrs.length : 0;
  const flatWithin2x = flatWithin2xShare(comps);
  const perCategory = [...perCat.entries()]
    .map(([category, es]) => ({ category, n: es.length, median_log_error: round4(median(es)) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);

  // Curve challengers: each against the same two blind tests. A challenger prices the
  // board only when it improves BOTH tests by more than 0.02 of log error.
  const challengers: { term: string; fit: Fitter }[] = [
    { term: 'huber IRLS', fit: fitHuber },
    { term: 'winsorized y (1st/99th)', fit: fitWinsor },
    { term: `comps TVL >= $50M (n=${comps.filter((c) => c.p.tvl_usd >= 50_000_000).length})`, fit: fitFloor50 },
    { term: 'per-category slope', fit: fitCatSlope },
    { term: 'WLS by log(TVL)', fit: fitWLS },
  ];
  const challengerRows: AblationRow[] = challengers.map(({ term, fit }) => {
    const loo = looMedianFit(comps, fit);
    const split = splitMedianFit(comps, fit);
    return { term, loo_median_log_error: round4(loo), split_median_log_error: round4(split), kept: lineLoo - loo > 0.02 && lineSplit - split > 0.02 };
  });

  // Ten-fold CV and the placebo test: the fit must hold out of sample and must collapse
  // when the comps' y values are shuffled (a fit that survives shuffled y leaks).
  const tenfold = tenFoldCV(comps, fitLine);
  const shuffledComps = comps.map((c, i) => ({ ...c, y: comps[(i * 37 + 11) % comps.length]!.y }));
  const placeboCoef = ols(shuffledComps.map((c) => [1, c.x]), shuffledComps.map((c) => c.y));
  const placeboR2 = (() => {
    if (placeboCoef === null) return 0;
    const m = shuffledComps.reduce((a, c) => a + c.y, 0) / shuffledComps.length;
    const tot = shuffledComps.reduce((a, c) => a + (c.y - m) ** 2, 0);
    const res = shuffledComps.reduce((a, c) => a + (c.y - (placeboCoef[0]! + placeboCoef[1]! * c.x)) ** 2, 0);
    return tot > 0 ? 1 - res / tot : 0;
  })();
  const placeboLoo = looMedianFit(shuffledComps, fitLine);

  // Ablation: each term against the same two blind tests. A term is kept only when it
  // improves BOTH tests by more than 0.02 of log error.
  const ablation: AblationRow[] = [];
  const base = { loo: lineLoo, split: lineSplit };
  for (const term of ['growth', 'maturity', 'breadth', 'category'] as TermName[]) {
    const loo = looMedian(comps, [term]);
    const split = splitMedian(comps, [term]);
    const kept = base.loo - loo > 0.02 && base.split - split > 0.02;
    ablation.push({ term, loo_median_log_error: round4(loo), split_median_log_error: round4(split), kept });
  }
  // The full model (all four terms) is reported too, for honesty about what stacking does.
  const fullLoo = looMedian(comps, ['growth', 'maturity', 'breadth', 'category']);
  const fullSplit = splitMedian(comps, ['growth', 'maturity', 'breadth', 'category']);
  ablation.push({ term: 'full (all four)', loo_median_log_error: round4(fullLoo), split_median_log_error: round4(fullSplit), kept: base.loo - fullLoo > 0.02 && base.split - fullSplit > 0.02 });
  ablation.push(...challengerRows);
  const keptTerms = ablation
    .filter((a) => a.kept && REAL_TERMS.includes(a.term))
    .map((a) => a.term) as TermName[];
  const finalTerms: TermName[] = keptTerms;
  const finalFit = fitTerms(comps, finalTerms) ?? fullFit;

  // The leave-one-out residuals' 90th percentile, kept as an honest prediction-error stat.
  // The row's parameter band does NOT contain this error, so the model also carries the
  // honest prediction band (see below): expected x exp(+/-h), h from this q90 and the
  // bootstrap spread. No category has enough comps for its own q90 (the largest has 15,
  // the rule needs 20), so every row uses the global q90.
  const finalLooErrs: number[] = [];
  const looErrsByCat = new Map<string, number[]>();
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const f = fitTerms(rest, finalTerms);
    if (f === null) continue;
    const e = Math.abs(comps[i]!.y - f.predict(comps[i]!));
    finalLooErrs.push(e);
    const k = comps[i]!.p.category ?? 'Other';
    if (!looErrsByCat.has(k)) looErrsByCat.set(k, []);
    looErrsByCat.get(k)!.push(e);
  }
  const q90 = quantile(finalLooErrs, 0.9);
  const conformalCoverage = finalLooErrs.length > 0 ? finalLooErrs.filter((e) => e <= q90).length / finalLooErrs.length : 0;
  const conformalPerCategory: { category: string; n: number; q90: number }[] = [];
  for (const [k, es] of looErrsByCat) {
    if (es.length >= CONFORMAL_MIN_N) conformalPerCategory.push({ category: k, n: es.length, q90: round4(quantile(es, 0.9)) });
  }

  // Odds: the cohort cells, the tercile challengers, and the challengers' blind tests.
  const cohort = cohortRows(snapshot);
  const baseOpts: OddsOpts = { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: false, useCategory: true, hierarchical: false };
  const baseOddsLoo = oddsLooBrier(cohort, baseOpts);
  const baseOddsSplit = oddsSplitBrier(cohort, baseOpts);
  const oddsAblation: OddsAblationRow[] = [];
  // The baseline itself, so the table shows what the challengers beat.
  oddsAblation.push({ term: 'baseline (age × category, prior 5)', loo_brier: round4(baseOddsLoo), split_brier: round4(baseOddsSplit.brier), kept: false });
  const oddsChallengers: { term: string; loo: number; split: number }[] = [
    { term: 'prior 3', loo: oddsLooBrier(cohort, { prior: 3, buckets: AGE_BUCKETS, tercile: false, useCategory: true, hierarchical: false }), split: oddsSplitBrier(cohort, { prior: 3, buckets: AGE_BUCKETS, tercile: false, useCategory: true, hierarchical: false }).brier },
    { term: 'prior 10', loo: oddsLooBrier(cohort, { prior: 10, buckets: AGE_BUCKETS, tercile: false, useCategory: true, hierarchical: false }), split: oddsSplitBrier(cohort, { prior: 10, buckets: AGE_BUCKETS, tercile: false, useCategory: true, hierarchical: false }).brier },
    { term: 'finer age buckets (0-90d/90-180d)', loo: oddsLooBrier(cohort, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS_FINE, tercile: false, useCategory: true, hierarchical: false }), split: oddsSplitBrier(cohort, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS_FINE, tercile: false, useCategory: true, hierarchical: false }).brier },
    { term: 'TVL tercile x age', loo: oddsLooBrier(cohort, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: true, useCategory: false, hierarchical: false }), split: oddsSplitBrier(cohort, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: true, useCategory: false, hierarchical: false }).brier },
    { term: 'TVL tercile x age x category', loo: oddsLooBrier(cohort, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: true, useCategory: true, hierarchical: false }), split: oddsSplitBrier(cohort, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: true, useCategory: true, hierarchical: false }).brier },
    { term: 'hierarchical tercile centre', loo: oddsLooBrier(cohort, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: true, useCategory: true, hierarchical: true }), split: oddsSplitBrier(cohort, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: true, useCategory: true, hierarchical: true }).brier },
    { term: 'logistic (age + log TVL)', loo: logitLooBrier(cohort), split: logitSplitBrier(cohort).brier },
  ];
  for (const c of oddsChallengers) {
    // A tercile variant is kept only when it improves BOTH Brier tests; the split gain
    // must clear 0.01, so a noise-level wiggle alone cannot keep a term. No variant does.
    const isTercile = c.term.startsWith('TVL tercile') || c.term.startsWith('hierarchical');
    const kept = isTercile && c.loo < baseOddsLoo && c.split < baseOddsSplit.brier - 0.01;
    oddsAblation.push({ term: c.term, loo_brier: round4(c.loo), split_brier: round4(c.split), kept });
  }
  const tercileKept = oddsAblation.some((a) => a.kept);
  const odds = buildOdds(snapshot, tercileKept, ODDS_PRIOR, AGE_BUCKETS, AGE_LABELS);
  const oddsVal = oddsValidation(snapshot, odds, tercileKept);

  // Leave-one-out calibration deciles of the kept odds model: predicted rate vs the
  // actual launch share in each decile.
  const calibration: CalibrationRow[] = (() => {
    const preds = cohort.map((row, i) => {
      const rest = cohort.filter((_, j) => j !== i);
      const fn = oddsRateFn(rest, cohort, { prior: ODDS_PRIOR, buckets: AGE_BUCKETS, tercile: tercileKept, useCategory: true, hierarchical: false });
      return { pred: fn(row), has: row.has };
    });
    preds.sort((a, b) => a.pred - b.pred);
    const out: CalibrationRow[] = [];
    for (let d = 0; d < 10; d++) {
      const chunk = preds.slice(Math.floor((d * preds.length) / 10), Math.floor(((d + 1) * preds.length) / 10));
      if (chunk.length === 0) continue;
      out.push({
        pred: round4(chunk.reduce((a, x) => a + x.pred, 0) / chunk.length),
        actual: round4(chunk.reduce((a, x) => a + x.has, 0) / chunk.length),
        n: chunk.length,
      });
    }
    return out;
  })();

  // Score every rankable protocol.
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  // Nearest traded comparable by size, for each ranked protocol.
  const kinOf = (p: SnapshotProtocol): SnapshotProtocol | null => {
    let best: SnapshotProtocol | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of comps) {
      const d = Math.abs(Math.log(p.tvl_usd) - c.x);
      if (d < bestD) {
        bestD = d;
        best = c.p;
      }
    }
    return best;
  };
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const compLike: Comp = {
      p,
      x: Math.log(p.tvl_usd),
      y: 0,
      age,
      growth01: (() => {
        const g = Math.min(120, Math.max(-60, finite(p.change_7d, 0))) / 100;
        return g >= 0 ? g * 0.5 : g * 0.8;
      })(),
      maturity01: Math.min(Math.max(age ?? 365, 0), 1095) / 1095,
      breadth01: Math.min(Math.max(p.chains.length - 1, 0), 4) / 4,
    };
    const logCurve = finalFit.predict(compLike);
    const curveValue = Math.exp(logCurve);
    const odd = odds.rateFor(p, age);
    const expected = curveValue * odd.rate;
    const kin = kinOf(p);
    const growthMult = 1 + compLike.growth01;
    const maturityMult = 0.55 + 0.45 * (1 - Math.exp(-(age ?? 365) / 730));
    const breadthMult = 1 + compLike.breadth01 * 0.08;
    const catEffect = finalFit.catEffect.get(p.category ?? 'Other') ?? 0;
    return { p, age, curveValue, expected, odd, kin, growthMult, maturityMult, breadthMult, catEffect };
  });
  scored.sort((a, b) => b.expected - a.expected || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // Bootstrap ranges: refit the curve on 200 seeded resamples and rescore every row, so
  // each row gets a p10–p90 range for both its expected value and its rank. The interval
  // is parameter uncertainty — how much the fitted curve moves when the comps change.
  // The honest prediction band folds the conformal residual in as well (see below).
  const rankSamples: number[][] = scored.map(() => []);
  const valueSamples: number[][] = scored.map(() => []);
  const r = rng(BOOT_SEED);
  for (let b = 0; b < BOOTSTRAPS; b++) {
    const sample: Comp[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(r() * comps.length)]!);
    const f = fitTerms(sample, finalTerms);
    if (f === null) continue;
    const vals = scored.map((s) => {
      const compLike: Comp = {
        p: s.p,
        x: Math.log(s.p.tvl_usd),
        y: 0,
        age: s.age,
        growth01: (() => {
          const g = Math.min(120, Math.max(-60, finite(s.p.change_7d, 0))) / 100;
          return g >= 0 ? g * 0.5 : g * 0.8;
        })(),
        maturity01: Math.min(Math.max(s.age ?? 365, 0), 1095) / 1095,
        breadth01: Math.min(Math.max(s.p.chains.length - 1, 0), 4) / 4,
      };
      return Math.exp(f.predict(compLike)) * s.odd.rate;
    });
    const order = vals.map((v, i) => i).sort((i, j) => vals[j]! - vals[i]! || (scored[i]!.p.slug < scored[j]!.p.slug ? -1 : 1));
    order.forEach((origIdx, rankIdx) => rankSamples[origIdx]!.push(rankIdx + 1));
    vals.forEach((v, i) => valueSamples[i]!.push(v));
  }

  // First pass: net economics at the wage bar, to decide the operative FARM threshold.
  const netOf = (s: (typeof scored)[number], lo: number): ReturnType<typeof netEconomics> =>
    netEconomics(s.p, s.age, lo, s.expected, DROP_SHARE);
  const prelim = scored.map((s, i) => {
    const values = valueSamples[i]!;
    const lo = Math.max(1, Math.round(values.length > 0 ? quantile(values, 0.1) : s.expected * 0.5));
    return { s, lo, econ: netOf(s, lo) };
  });
  const farmAtWage = prelim.filter((x) => x.econ.netPerHourLow >= FARM_WAGE_THRESHOLD && x.econ.gasTotal <= x.econ.capital / 2).length;
  const farmThreshold = farmAtWage >= 3 ? FARM_WAGE_THRESHOLD : FARM_THRESHOLD_FALLBACK;
  const farmThresholdNote =
    farmThreshold === FARM_WAGE_THRESHOLD
      ? `FARM when net $/h reaches $${FARM_WAGE_THRESHOLD} at the low end and gas stays under half the capital (${farmAtWage} rows clear it).`
      : `The $${FARM_WAGE_THRESHOLD}/h wage bar left ${farmAtWage} FARM rows, so the FARM line is break-even $0/h net at the low end, stated here — the counts are an outcome, not a target.`;

  const board: BoardRow[] = scored.map((s, i) => {
    const samples = rankSamples[i]!;
    const rankLow = samples.length > 0 ? quantile(samples, 0.1) : i + 1;
    const rankHigh = samples.length > 0 ? quantile(samples, 0.9) : i + 1;
    const expected = Math.max(1, Math.round(s.expected));
    const values = valueSamples[i]!;
    const lo = Math.max(1, Math.round(values.length > 0 ? quantile(values, 0.1) : s.expected * 0.5));
    const hi = Math.max(lo, Math.round(values.length > 0 ? quantile(values, 0.9) : s.expected * 2));
    // Honest prediction band: bootstrap spread (log sd from the p10-p90 band) combined
    // in quadrature with the conformal residual q90. It is far wider than the parameter
    // band because the curve's point predictions are noisy (typical error 3.4x).
    const bootSd = (Math.log(hi) - Math.log(lo)) / (2 * 1.2816);
    const h = Math.sqrt(bootSd * bootSd + q90 * q90);
    const predLow = Math.max(1, Math.round(s.expected * Math.exp(-h)));
    const predHigh = Math.max(predLow, Math.round(s.expected * Math.exp(h)));
    const econ = netEconomics(s.p, s.age, lo, s.expected, DROP_SHARE);
    // Verdict, netted at the low end of the parameter band: FARM when net $/h reaches
    // the operative threshold and gas stays under half the capital; THIN when the row
    // breaks even on its point estimate but not at the low end; SKIP otherwise.
    let verdict: 'FARM' | 'THIN' | 'SKIP' = 'SKIP';
    if (econ.netPerHourLow >= farmThreshold && econ.gasTotal <= econ.capital / 2) verdict = 'FARM';
    else if (econ.netPerHourPoint >= 0) verdict = 'THIN';
    const minDeposit = Math.round(minDepositFor(s.p, lo, DROP_SHARE, farmThreshold, econ.hours, econ.gasTotal));
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      watchlist: snapshot.watchlist.includes(s.p.slug),
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      age_days: s.age,
      implied_value_usd: expected,
      curve_value_usd: Math.max(1, Math.round(s.curveValue)),
      launch_odds: round4(s.odd.rate),
      interval_low_usd: lo,
      interval_high_usd: hi,
      pred_low_usd: predLow,
      pred_high_usd: predHigh,
      rank_low: Math.max(1, Math.round(rankLow)),
      rank_high: Math.min(scored.length, Math.round(rankHigh)),
      verdict,
      net_per_hour_usd: Math.round(econ.netPerHourLow * 100) / 100,
      net_per_hour_point_usd: Math.round(econ.netPerHourPoint * 100) / 100,
      breakeven_capture_pct: Math.round(econ.breakevenCapturePct * 1e4) / 1e4,
      min_deposit_farm_usd: minDeposit,
      farm_cost_usd: Math.round(econ.cost * 100) / 100,
      farm_hours: econ.hours,
      capital_usd: econ.capital,
      kin_slug: s.kin?.slug ?? '',
      kin_name: s.kin?.name ?? '',
      model: {
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        breadth_multiplier: round4(s.breadthMult),
        category_effect: round4(s.catEffect),
        odds_bucket: tercileKept ? `${s.odd.bucket} · ${s.odd.tercile}` : s.odd.bucket,
        odds_cell_n: s.odd.n,
      },
      farm_steps: farmSteps(s.p, s.age, { slope: finalFit.coef[1]!, kinName: s.kin?.name ?? '' }).map(stepText),
    };
  });

  const live = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));

  const excluded: ExcludedRow[] = snapshot.protocols
    .filter((p) => isPreToken(p) && !isRankable(p))
    .map((p) => ({ slug: p.slug, name: p.name, reason: exclusionReason(p) ?? 'not rankable' }))
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));

  const traded = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const verdicts = { farm: 0, thin: 0, skip: 0 };
  for (const row of board) {
    if (row.verdict === 'FARM') verdicts.farm++;
    else if (row.verdict === 'THIN') verdicts.thin++;
    else verdicts.skip++;
  }
  const catTotals = new Map<string, { rows: number; implied: number }>();
  for (const row of board) {
    const k = row.category ?? 'Other';
    if (!catTotals.has(k)) catTotals.set(k, { rows: 0, implied: 0 });
    const t = catTotals.get(k)!;
    t.rows++;
    t.implied += row.implied_value_usd;
  }
  const topCategory = [...catTotals.entries()]
    .map(([category, t]) => ({ category, rows: t.rows, implied_usd: t.implied }))
    .sort((a, b) => b.implied_usd - a.implied_usd)
    .slice(0, 6);

  const curve: CurveReport = {
    form: 'line',
    intercept: round4(fullFit.coef[0]!),
    slope: round4(fullFit.coef[1]!),
    r2: round4(r2),
    n: comps.length,
    loo_median_log_error: round4(lineLoo),
    loo_within_2x: round4(looWithin2x),
    split_median_log_error: round4(lineSplit),
    split_within_2x: round4(splitWithin2x),
    flat_loo_median_log_error: round4(flatLoo),
    flat_loo_within_2x: round4(flatWithin2x),
    median_loo_median_log_error: round4(medianLoo),
    quad_loo_median_log_error: round4(quadLoo),
    quad_split_median_log_error: round4(quadSplit),
    tenfold_cv_median_log_error: round4(tenfold),
    placebo_r2: round4(placeboR2),
    placebo_loo_median_log_error: round4(placeboLoo),
    per_category: perCategory,
  };
  const tercileTable = tercileKept
    ? AGE_LABELS.flatMap((label, b) =>
        ['small TVL', 'mid TVL', 'large TVL'].map((tercile, t) => {
          const inCell = cohort.filter((r) => bucketIndex(r.age, AGE_BUCKETS) === b && r.tercile === t);
          const tk = inCell.filter((r) => r.has === 1).length;
          return { bucket: label, tercile, n: inCell.length, tokens: tk, rate: round4(inCell.length > 0 ? tk / inCell.length : odds.globalRate) };
        }),
      )
    : [];
  const model: ModelReport = {
    version: MODEL_VERSION,
    curve,
    ablation,
    kept_terms: keptTerms,
    odds: {
      global_rate: round4(odds.globalRate),
      global_n: odds.globalN,
      buckets: odds.buckets.map((b) => ({ label: b.label, n: b.n, tokens: b.tokens, rate: round4(b.rate) })),
      cells: AGE_LABELS.flatMap((label, b) => {
        const cats = [...new Set(snapshot.protocols.map((p) => p.category ?? 'Other'))].sort();
        const terciles = tercileKept ? [0, 1, 2] : [null];
        return terciles.flatMap((t) =>
          cats
            .map((cat) => {
              const cell = odds.cellRate(b, t, cat);
              return cell.n > 0
                ? { bucket: label, tercile: t === null ? null : ['small TVL', 'mid TVL', 'large TVL'][t]!, category: cat, n: cell.n, rate: round4(cell.rate) }
                : null;
            })
            .filter((c): c is { bucket: string; tercile: string | null; category: string; n: number; rate: number } => c !== null),
        );
      }),
      tercile_kept: tercileKept,
      tercile_cuts_usd: odds.tercileCuts,
      tercile_table: tercileTable,
      loo_brier: round4(oddsVal.looBrier),
      base_brier: round4(oddsVal.baseBrier),
      loo_log_loss: round4(oddsVal.looLogLoss),
      base_log_loss: round4(oddsVal.baseLogLoss),
      split_brier: round4(oddsVal.splitBrier),
      split_base_brier: round4(oddsVal.splitBaseBrier),
      calibration,
      ablation: oddsAblation,
    },
    conformal_q90_log: round4(q90),
    conformal_coverage: round4(conformalCoverage),
    conformal_per_category: conformalPerCategory,
    drop_share: DROP_SHARE,
    farm_threshold_usd_per_hour: farmThreshold,
    farm_threshold_note: farmThresholdNote,
    audit: {
      ranked: board.length,
      traded,
      excluded: excluded.length,
      total: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      watchlist_ranked: snapshot.watchlist.filter((s) => board.some((row) => row.slug === s)).length,
    },
    verdicts,
    top_category: topCategory,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    rows: board,
    live,
    excluded,
    live_total: traded,
  };
  return { board, radar };
}

/** Quadratic log-log fit's leave-one-out median error. */
function looMedianQuad(comps: Comp[]): number {
  const errs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const rows = rest.map((c) => [1, c.x, c.x * c.x]);
    const coef = ols(rows, rest.map((c) => c.y));
    if (coef === null) continue;
    const c = comps[i]!;
    errs.push(Math.abs(c.y - (coef[0]! + coef[1]! * c.x + coef[2]! * c.x * c.x)));
  }
  return median(errs);
}

/** Quadratic fit's time-split median error. */
function splitMedianQuad(comps: Comp[]): number {
  const dated = comps.filter((c) => c.age !== null).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  if (dated.length < 20) return looMedianQuad(comps);
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const coef = ols(train.map((c) => [1, c.x, c.x * c.x]), train.map((c) => c.y));
  if (coef === null) return looMedianQuad(comps);
  return median(test.map((c) => Math.abs(c.y - (coef[0]! + coef[1]! * c.x + coef[2]! * c.x * c.x))));
}

/** A flat median multiple's leave-one-out median error (log(mcap/tvl) median). */
function looMedianFlat(comps: Comp[]): number {
  const errs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const m = median(rest.map((c) => c.y - c.x));
    errs.push(Math.abs(comps[i]!.y - (comps[i]!.x + m)));
  }
  return median(errs);
}

/** Share of comps the flat multiple predicts within 2x, leave-one-out. */
function flatWithin2xShare(comps: Comp[]): number {
  let hit = 0;
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    const m = median(rest.map((c) => c.y - c.x));
    if (Math.abs(comps[i]!.y - (comps[i]!.x + m)) <= Math.log(2)) hit++;
  }
  return comps.length > 0 ? hit / comps.length : 0;
}

/** Per-category median multiples' leave-one-out median error. */
function looMedianCategoryMedian(comps: Comp[]): number {
  const errs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i]!;
    const rest = comps.filter((_, j) => j !== i);
    const same = rest.filter((q) => (q.p.category ?? 'Other') === (c.p.category ?? 'Other'));
    const pool = same.length >= 3 ? same : rest;
    const m = median(pool.map((q) => q.y - q.x));
    errs.push(Math.abs(c.y - (c.x + m)));
  }
  return median(errs);
}

/** The time split's absolute log errors for a term set. */
function splitErrors(comps: Comp[], terms: TermName[]): number[] {
  const dated = comps.filter((c) => c.age !== null).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  if (dated.length < 20) return [];
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const f = fitTerms(train, terms);
  if (f === null) return [];
  return test.map((c) => Math.abs(c.y - f.predict(c)));
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
