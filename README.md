# Token Launch Radar — radar-b2

[![Token Launch Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/barongz1/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/barongz1/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Every pre-token protocol in the 14 Nov 2026 snapshot, ranked by the expected value of a
token it has not launched yet. Snapshot figures only; nothing live, nothing priced from
outside. Node 22, standard library only, no network. Deterministic: two runs write
identical bytes.

## What changed from radar-b1 (v1)

- **Netted farm economics.** A verdict is no longer the protocol's whole value per hour.
  A farmer captures `value × (deposit / TVL) × drop share`, minus gas, over the plan's
  hours. Drop share is 10% for the submitted verdicts; the dashboard's sandbox slider
  shows 5% / 10% / 20%. Net $/h can be negative and is never floored at zero.
- **FARM bar, stated honestly.** The $10/h wage bar left 0 FARM rows, so the FARM line
  is break-even $0/h net at the low end of the parameter band. Verdicts: **10 FARM /
  6 THIN / 182 SKIP**. THIN means the row breaks even on its point estimate but not at
  the low end. The counts are an outcome, not a target.
- **Honest prediction band.** Every row now carries, beside its bootstrap parameter
  band, a prediction band: `expected × exp(±h)`, `h = √(bootstrap_sd² + q90²)`. The
  leave-one-out q90 is 3.4947 log (about 33×), so the band is wide — the point
  predictions are typically wrong by 3.4×. The dashboard says so instead of hiding it.
- **Self-check panel.** The model tab computes six checks live from data.js (watchlist
  40/40, ranks 1..198 exactly once, implied value non-increasing, 0 wrapped ranked,
  every farm step 20–600 chars, recompute matches).
- **Odds calibration table.** Leave-one-out deciles of predicted rate vs actual launch
  share, plus the full odds-challenger table.
- **Personalised farm steps.** Two of the seven steps use the row's own figures: the
  first action names the position size, the protocol's TVL and chain, and the nearest
  traded comparable by size; the hold step names what a halved TVL does to the curve
  value (about −28%).
- **Ten-fold CV and a placebo test** for the curve, and a fourth screenshot (the Model &
  validation tab).

## The model

- **Curve:** `log(mcap) = 7.7881 + 0.4721 · log(TVL)`, R² 0.1434, 119 comps. LOO median
  log error 1.2122 vs flat multiple 1.5966 and per-category medians 1.7163; time split
  1.0244; ten-fold CV 1.1627. Placebo (shuffled y): R² 0.0006, LOO 1.357 — the fit
  collapses, as a real fit should. Quadratic: LOO 1.2482, split 1.0073 — loses to the
  line on both tests.
- **Terms:** growth, maturity, breadth and category were each put to both blind tests;
  none improved both by more than 0.02, so none is priced in. Five curve challengers
  (Huber IRLS, winsorized y, comps TVL ≥ $50M, per-category slope, WLS by log TVL)
  were tested the same way; none passed either. The ablation table on the dashboard
  shows every one.
- **Odds:** empirical cohort rate, age bucket × category, each cell shrunk toward its
  bucket's rate with a five-protocol prior. Global rate 0.5013 over 383 dated
  protocols. LOO Brier 0.2072 vs base rate 0.2500; log loss 0.6031 vs 0.6931; time-split
  Brier 0.3123 vs base 0.3523. A TVL tercile was tested three ways (alone: LOO 0.2029,
  split 0.3118; crossed with category: 0.2011 / 0.3085; hierarchical centre: 0.1919 /
  0.3143) and rejected — the best split gain was 0.0038, within noise, and the
  hierarchical one wins the LOO but loses the split. An early scratch run showed a
  much larger split gain for the tercile alone (0.2487), but it traced to the
  empty-bucket fallback using the full cohort's rate while the train half holds no
  protocol under 365 days — the fallback, not the tercile. The logistic challenger
  wins the split (0.2397) but loses the LOO (0.2186), so it stays out too.
- **Board:** 198 rows. #1 Polymarket International $17,878,967 · #2 Veda $13,715,776 ·
  #3 Sentora Curator $12,935,057 · #4 Steakhouse Financial $12,927,074 · #5 Lofty
  $12,249,457. Audit: 198 ranked + 416 live + 144 excluded = 758/758, watchlist 40/40,
  0 wrapped / staked / bridged products ranked.
- **Farm economics (10% drop share):** net $/h at the low end, median −$2.48, max
  $0.77 (#70 Manifest Trade). FARM rows: #26 marginfi Lending, #63 Lulo, #70 Manifest
  Trade, #90 Adrastea Validator, #99 Hylo Protocol, #112 Perena Vaults, #114 Byreal,
  #135 Tessera V, #161 GoonFi, #165 BULK.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Reads the sealed snapshot, writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` (last, via the vendored make.fun library). Run it
twice and diff the outputs: they must be byte-identical.

## Disclaimer

Expected values are a ranking signal, not a price: the point predictions are
typically wrong by 3.4× and the 90th-percentile error is about 33×. Net $/h is one
farmer's share of a hypothetical drop at a stated 10% share — airdrops are never
guaranteed, and no verdict is a promise of what one wallet earns.
