// radar-b2: a token launch radar entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// scores every pre-token protocol with the model in lib/model.ts, writes the ranked board
// to /output/board.json, and copies this repository's dashboard/ and screenshots/ to
// /output. Last, it writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library. The dashboard's data goes beside the page as data.js, so the
// dossier's text budget stays for the page's own source.
//
// Deterministic: the same snapshot always writes the same bytes (no clock, no randomness
// outside the seeded bootstrap, keys in insertion order). Two runs must agree byte for byte.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ model: radar.model, rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > 4) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3 or 4, the board, a detail view, a filtered view and the model tab\n`);
  process.exit(1);
}
// The dossier shows the page's source whole only while it fits the text cap; fail here,
// before the dossier is written, rather than handing in a cut-off page.
const dashBytes = dashFiles.reduce((sum, name) => sum + statSync(join(here, 'dashboard', name)).size, 0);
if (dashBytes > TEXT_MAX_BYTES) {
  process.stderr.write(`token radar: dashboard/ is ${dashBytes} bytes, over the ${TEXT_MAX_BYTES}-byte text cap the dossier shows whole\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const top = board.slice(0, 3).map((r) => `#${r.rank} ${r.name} $${r.implied_value_usd.toLocaleString('en-US')}`).join(', ');
const m = radar.model;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, watchlist ${m.audit.watchlist_ranked}/${m.audit.watchlist} ranked, ${board.length} rows scored (${m.audit.excluded} excluded, ${m.audit.traded} live set aside)\n` +
    `token radar: curve log(mcap) = ${m.curve.intercept} + ${m.curve.slope} * log(TVL), R² ${m.curve.r2}, LOO ${m.curve.loo_median_log_error} vs flat ${m.curve.flat_loo_median_log_error}, split ${m.curve.split_median_log_error}, ten-fold ${m.curve.tenfold_cv_median_log_error}, placebo R² ${m.curve.placebo_r2} (LOO ${m.curve.placebo_loo_median_log_error}); kept terms: ${m.kept_terms.length > 0 ? m.kept_terms.join(', ') : 'none (curve + odds only)'}\n` +
    `token radar: odds LOO Brier ${m.odds.loo_brier} vs base ${m.odds.base_brier}, split ${m.odds.split_brier} vs base ${m.odds.split_base_brier}, log-loss ${m.odds.loo_log_loss} vs base ${m.odds.base_log_loss}; TVL tercile ${m.odds.tercile_kept ? 'kept' : 'rejected'}; conformal q90 ${m.conformal_q90_log} log (coverage ${m.conformal_coverage})\n` +
    `token radar: farm verdicts netted at ${m.drop_share * 100}% drop share: ${m.verdicts.farm} FARM / ${m.verdicts.thin} THIN / ${m.verdicts.skip} SKIP; FARM bar $${m.farm_threshold_usd_per_hour}/h net at the low end\n` +
    `token radar: top of the board: ${top}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
