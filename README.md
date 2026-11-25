[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/barongz1/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/barongz1/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Launch Radar — radar-b1

A ranked board of every pre-token protocol in the sealed 14 Nov 2026 snapshot, scored by the
expected value of a token it has not launched yet. Snapshot figures only; nothing live, nothing
priced from outside.

## The model (radar-b1)

- **Candidate set.** Every protocol the snapshot records with no token, except exchanges,
  versioned pools of another protocol, and wrapped / staked / bridged products of a token that
  already trades (Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC
  categories; a name with a whole word wrapped, staked or staking; an exchange's name at the
  start). The watchlist is the floor: all 40 of its slugs are ranked, and the radar adds every
  other rankable pre-token protocol below the floor. Live-token protocols are set aside at their
  market value, never ranked.
- **Curve.** Least-squares `log(mcap) = 7.7881 + 0.4721 · log(TVL)`, fitted on every run over
  the 119 traded comps (one observation per token id), R² 0.1434. A protocol's curve value is
  `exp(7.7881 + 0.4721 · log(TVL))`.
- **Launch odds.** The empirical cohort rate from the snapshot itself: among dated,
  non-exchange, non-versioned protocols, the share that already have a token, by age bucket
  crossed with category, each cell shrunk toward its bucket's rate with a five-protocol prior.
  Global rate 50.6% over 494 dated protocols. Brier 0.2072 vs base rate 0.2500 (leave-one-out);
  log loss 0.6031 vs 0.6931.
- **Expected value.** `implied_value_usd = curve value × launch odds`, whole dollars.
- **Blind tests.** Leave-one-out median log error 1.2122 vs a flat median multiple's 1.5966
  and per-category medians' 1.7163; time split (fit the older half by listed date, test the
  newer) 1.0244. A quadratic curve was fitted too and lost on both tests, so the line prices
  the board. Growth, maturity, breadth and a shrunk category effect were each put to the same
  two blind tests; none improved both by more than 0.02, so none prices the board — the
  ablation table on the dashboard names every term and what the tests said.
- **Ranges.** Every row carries a p10–p90 range for its expected value and its rank, from 200
  seeded bootstrap resamples of the comps. The farm verdict (FARM / THIN / SKIP) is netted at
  the low end: FARM when it clears $5M and gas stays under half the capital, THIN when it
  clears $1M, SKIP otherwise.
- **Audit.** 198 ranked + 416 live + 144 excluded = 758. 40/40 watchlist ranked. 0 wrapped /
  staked / bridged products ranked.

Top of the board: #1 Polymarket International $17,878,967 · #2 Veda $13,715,776 ·
#3 Sentora Curator $12,935,057.

## The page

`dashboard/` is a static page (no network, dark theme) with a sortable, filterable board,
a detail view for every protocol (hash deep-link `#detail=<slug>`) showing the full model
breakdown and a costed farm plan, a live-token tab, the integrity strip, a model-and-validation
panel, a sandbox that recomputes the board live from sliders, and a portfolio planner. The
page recomputes each row's expected value from its own figures in the browser and confirms
it matches `board.json`.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

Node 22, standard library only. Two runs write identical bytes. The program writes
`board.json`, `data.js` (beside the page, so the dossier's text budget stays for the page's
own source), `dashboard/`, `screenshots/` and `dossier.json` last, via the kit's vendored
`vendor/makefun-board.ts`.

## Disclaimer

Implied values are this entry's own claim, fitted from one sealed snapshot dated
14 Nov 2026. They are a ranking signal, not a price, a promise, or investment advice. A
protocol the snapshot records with no token may still have one its DefiLlama record does not
carry; the board says "no token recorded", never "no token".
