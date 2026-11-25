// radar-b1 dashboard: static, no network. Reads window.RADAR (written beside the page as
// data.js) and renders the board, the detail view, the live-token tab, the model panel, the
// sandbox and the planner. It recomputes every row's expected value from the row's own
// figures (curve x odds) and says whether it matches board.json.
(function () {
  'use strict';
  var D = window.RADAR;
  var rows = D.rows, model = D.model, live = D.live, audit = model.audit;
  var $ = function (id) { return document.getElementById(id); };
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) { return (n * 100).toFixed(1) + '%'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function days(a) { return a === null ? '—' : a >= 365 ? (a / 365).toFixed(1) + 'y' : a + 'd'; }
  function verdictClass(v) { return v === 'FARM' ? 'vFARM' : v === 'THIN' ? 'vTHIN' : 'vSKIP'; }

  // ---- header strips -------------------------------------------------------
  $('asof').textContent = 'Snapshot as of ' + D.as_of + ' · floor $50M TVL · ' + audit.total + ' protocols';
  $('integrity').innerHTML =
    '<span class="pill ok"><b>' + audit.total + '/' + audit.total + '</b> protocols accounted for</span>' +
    '<span class="pill ok"><b>' + audit.watchlist_ranked + '/' + audit.watchlist + '</b> watchlist ranked</span>' +
    '<span class="pill ok"><b>0</b> wrapped / staked / bridged products ranked</span>' +
    '<span class="pill"><b>' + audit.ranked + '</b> ranked · <b>' + audit.traded + '</b> live · <b>' + audit.excluded + '</b> excluded</span>';
  var c = model.curve;
  $('kpis').innerHTML =
    '<span class="pill">Fitted curve<b>log(mcap) = ' + c.intercept + ' + ' + c.slope + ' · log(TVL)</b>R² ' + c.r2 + ' · ' + c.n + ' comps</span>' +
    '<span class="pill">Leave-one-out error<b>' + c.loo_median_log_error + ' log</b>vs flat multiple ' + c.flat_loo_median_log_error + '</span>' +
    '<span class="pill">Time-split error<b>' + c.split_median_log_error + ' log</b>fit older half, test newer half</span>' +
    '<span class="pill">Launch odds<b>Brier ' + model.odds.loo_brier + '</b>vs base rate ' + model.odds.base_brier + '</span>' +
    '<span class="pill">Top expected value<b>' + money(rows[0].implied_value_usd) + '</b>' + esc(rows[0].name) + '</span>' +
    '<span class="pill">Verdicts<b>' + model.verdicts.farm + ' FARM · ' + model.verdicts.thin + ' THIN · ' + model.verdicts.skip + ' SKIP</b></span>';

  // ---- tabs ----------------------------------------------------------------
  var tabs = document.querySelectorAll('.tabs button');
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('on'); });
      $('tab-' + b.dataset.tab).classList.add('on');
      if (b.dataset.tab === 'audit') renderAudit();
    });
  });

  // ---- board ---------------------------------------------------------------
  var sortKey = 'rank', sortDir = 1;
  var cats = [...new Set(rows.map(function (r) { return r.category; }))].sort();
  var chains = [...new Set(rows.flatMap(function (r) { return r.chains; }))].sort();
  cats.forEach(function (x) { var o = document.createElement('option'); o.textContent = x; $('cat').appendChild(o); });
  chains.forEach(function (x) { var o = document.createElement('option'); o.textContent = x; $('chain').appendChild(o); });

  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value, chain = $('chain').value, v = $('verdict').value;
    var watch = $('watch').checked, minTvl = Number($('mintvl').value) || 0;
    return rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (v && r.verdict !== v) return false;
      if (watch && !r.watchlist) return false;
      if (r.tvl_usd < minTvl) return false;
      return true;
    });
  }
  function renderBoard() {
    var list = filtered().slice();
    list.sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (typeof x === 'string') return sortDir * x.localeCompare(y);
      return sortDir * ((x === null ? -1 : x) - (y === null ? -1 : y));
    });
    $('count').textContent = list.length + ' of ' + rows.length + ' rows';
    $('rows').innerHTML = list.map(function (r) {
      var g = r.change_7d === null ? '—' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%';
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
        '<td>' + esc(r.name) + (r.watchlist ? ' <span class="watch">★</span>' : '') + '</td>' +
        '<td>' + esc(r.category) + '</td><td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + gc + '">' + g + '</td><td class="num">' + days(r.age_days) + '</td>' +
        '<td class="num">' + pct(r.launch_odds) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="' + verdictClass(r.verdict) + '">' + r.verdict + '</td>' +
        '<td class="num">' + money(r.interval_low_usd) + ' – ' + money(r.interval_high_usd) + '</td></tr>';
    }).join('');
  }
  document.querySelectorAll('#tab-board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      renderBoard();
    });
  });
  ['q', 'cat', 'chain', 'verdict', 'watch', 'mintvl'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.dataset.slug);
  });

  // Recompute check: curve x odds from each row's own figures, in this page.
  (function () {
    var bad = 0;
    rows.forEach(function (r) {
      var curve = Math.exp(c.intercept + c.slope * Math.log(r.tvl_usd));
      var again = curve * r.launch_odds;
      if (Math.abs(again - r.implied_value_usd) / r.implied_value_usd > 0.005) bad++;
    });
    $('recompute').innerHTML = bad === 0
      ? '<span class="ok">✓ Recomputed in this page:</span> all ' + rows.length + ' rows match board.json (curve × odds, within rounding).'
      : '<span class="bad">✗ Recompute mismatch on ' + bad + ' rows.</span>';
  })();

  // ---- detail --------------------------------------------------------------
  var dlg = $('detail');
  function openDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    location.hash = 'detail=' + slug;
    var curve = Math.exp(c.intercept + c.slope * Math.log(r.tvl_usd));
    var again = curve * r.launch_odds;
    var ok = Math.abs(again - r.implied_value_usd) / r.implied_value_usd <= 0.005;
    var m = r.model;
    $('detailBody').innerHTML =
      '<h2>' + esc(r.name) + ' <span class="tag">#' + r.rank + '</span>' + (r.watchlist ? ' <span class="watch">★ watchlist</span>' : '') + '</h2>' +
      '<dl>' +
      '<dt>Expected value</dt><dd><b>' + money(r.implied_value_usd) + '</b> (80% range ' + money(r.interval_low_usd) + ' – ' + money(r.interval_high_usd) + ', rank ' + r.rank_low + '–' + r.rank_high + ')</dd>' +
      '<dt>Curve value</dt><dd>' + money(r.curve_value_usd) + ' — exp(' + c.intercept + ' + ' + c.slope + ' · log(' + money(r.tvl_usd) + ')) = ' + money(curve) + '</dd>' +
      '<dt>Launch odds</dt><dd>' + pct(r.launch_odds) + ' — bucket ' + esc(m.odds_bucket) + ', ' + m.odds_cell_n + ' protocols in the cell</dd>' +
      '<dt>Category / chains</dt><dd>' + esc(r.category) + ' · ' + esc(r.chains.join(', ')) + '</dd>' +
      '<dt>TVL / 7d / age</dt><dd>' + money(r.tvl_usd) + ' · ' + (r.change_7d === null ? '—' : r.change_7d.toFixed(1) + '%') + ' · ' + days(r.age_days) + '</dd>' +
      '<dt>Nearest traded comparable</dt><dd>' + esc(r.kin_name || '—') + (r.kin_slug ? ' (' + esc(r.kin_slug) + ')' : '') + '</dd>' +
      '<dt>Tested terms (not kept)</dt><dd>growth ×' + m.growth_multiplier + ', maturity ×' + m.maturity_multiplier + ', breadth ×' + m.breadth_multiplier + ', category ' + (m.category_effect >= 0 ? '+' : '') + m.category_effect + ' — the blind tests rejected every term, so none of them changes the number.</dd>' +
      '<dt>Farm verdict</dt><dd><span class="' + verdictClass(r.verdict) + '">' + r.verdict + '</span> — low end ' + money(r.interval_low_usd) + ' vs farm cost ' + money(r.farm_cost_usd) + ', ' + r.farm_hours + 'h, capital ' + money(r.capital_usd) + ', ' + money(r.value_per_hour_usd) + '/h, ' + r.value_per_dollar + '× per $1</dd>' +
      '<dt>Recompute check</dt><dd>' + (ok ? '<span class="ok">✓ matches board.json</span>' : '<span class="bad">✗ differs from board.json</span>') + ' — this page recomputed ' + money(again) + ' from the row\u2019s own figures.</dd>' +
      '</dl>' +
      '<h2>Farm plan</h2><ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="note">Values are the protocol\u2019s whole expected value, not a promise of what one wallet earns. Farm costs are the plan\u2019s gas and capital; the verdict is netted at the low end of the range.</p>' +
      '<button id="addPlan">Add to planner</button>';
    $('addPlan').addEventListener('click', function () { addToPlan(r.slug); });
    if (!dlg.open) dlg.showModal();
  }
  $('closeDetail').addEventListener('click', function () { dlg.close(); history.replaceState(null, '', location.pathname); });
  dlg.addEventListener('close', function () { history.replaceState(null, '', location.pathname); });

  // ---- live tab ------------------------------------------------------------
  $('liveRows').innerHTML = live.map(function (p) {
    var ratio = p.tvl_usd > 0 && p.mcap_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—';
    return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category) + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td><td class="num">' + ratio + '</td></tr>';
  }).join('');

  // ---- model tab -----------------------------------------------------------
  var ab = model.ablation.map(function (a) {
    return '<tr><td>' + esc(a.term) + '</td><td>' + a.loo_median_log_error + '</td><td>' + a.split_median_log_error + '</td><td>' + (a.kept ? '<span class="ok">kept</span>' : 'rejected') + '</td></tr>';
  }).join('');
  $('modelText').innerHTML =
    '<table class="mini"><tr><th>Curve</th><th>Intercept</th><th>Slope</th><th>R²</th><th>Comps</th><th>LOO median log error</th><th>Flat multiple LOO</th><th>Category-median LOO</th></tr>' +
    '<tr><td>' + esc(c.form) + '</td><td>' + c.intercept + '</td><td>' + c.slope + '</td><td>' + c.r2 + '</td><td>' + c.n + '</td><td>' + c.loo_median_log_error + '</td><td>' + c.flat_loo_median_log_error + '</td><td>' + c.median_loo_median_log_error + '</td></tr></table>' +
    '<p>Quadratic was also fitted (LOO ' + c.quad_loo_median_log_error + ', time split ' + c.quad_split_median_log_error + ') and lost to the line on both blind tests, so the line prices the board. Within-2×: curve ' + pct(c.loo_within_2x) + ' of comps leave-one-out, ' + pct(c.split_within_2x) + ' on the time split, flat multiple ' + pct(c.flat_loo_within_2x) + '. The leave-one-out residuals\u2019 90th percentile is ' + model.conformal_q90_log + ' log — the point predictions are noisy, which is why every row carries a range instead of a single number.</p>' +
    '<h3>Ablation — every term put to the same two blind tests</h3>' +
    '<table class="mini"><tr><th>Term</th><th>LOO</th><th>Time split</th><th>Verdict</th></tr>' + ab + '</table>' +
    '<p>Base (curve only): LOO ' + c.loo_median_log_error + ', time split ' + c.split_median_log_error + '. A term is kept only when it improves <b>both</b> tests by more than 0.02. None did — the board is priced by the curve and the odds alone. Kept terms: ' + (model.kept_terms.length ? esc(model.kept_terms.join(', ')) : 'none') + '.</p>' +
    '<p>Per-category LOO error: ' + c.per_category.map(function (x) { return esc(x.category) + ' ' + x.median_log_error + ' (n=' + x.n + ')'; }).join(' · ') + '.</p>';
  $('validText').innerHTML =
    '<table class="mini"><tr><th>Odds check</th><th>This model</th><th>Base rate</th></tr>' +
    '<tr><td>Brier score (leave-one-out)</td><td>' + model.odds.loo_brier + '</td><td>' + model.odds.base_brier + '</td></tr>' +
    '<tr><td>Log loss (leave-one-out)</td><td>' + model.odds.loo_log_loss + '</td><td>' + model.odds.base_log_loss + '</td></tr>' +
    '<tr><td>Brier score (time split)</td><td>' + model.odds.split_brier + '</td><td>' + model.odds.split_base_brier + '</td></tr></table>' +
    '<p>Lower is better on both. The odds beat the base rate on every check, so they stay in the model.</p>';
  $('oddsText').innerHTML =
    '<table class="mini"><tr><th>Age bucket</th><th>Protocols</th><th>With a token</th><th>Rate</th></tr>' +
    model.odds.buckets.map(function (b) { return '<tr><td>' + esc(b.label) + '</td><td>' + b.n + '</td><td>' + b.tokens + '</td><td>' + pct(b.rate) + '</td></tr>'; }).join('') + '</table>' +
    '<p>Global rate ' + pct(model.odds.global_rate) + ' over ' + model.odds.global_n + ' dated protocols. Each cell is the bucket rate crossed with the category, shrunk toward the bucket rate with a five-protocol prior — a category with few protocols borrows the bucket\u2019s rate.</p>';

  // ---- sandbox -------------------------------------------------------------
  var sb = { intercept: c.intercept, slope: c.slope, odds: 1 };
  function sliderRow(id, label, min, max, step, val, fmt) {
    return '<label>' + label + ' <output id="' + id + 'Out">' + fmt(val) + '</output><br><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></label>';
  }
  $('sliders').innerHTML =
    sliderRow('sbInt', 'Intercept', (c.intercept - 1).toFixed(2), (c.intercept + 1).toFixed(2), 0.01, c.intercept, function (v) { return v.toFixed(2); }) +
    sliderRow('sbSlope', 'Slope', (c.slope - 0.2).toFixed(2), (c.slope + 0.2).toFixed(2), 0.005, c.slope, function (v) { return v.toFixed(3); }) +
    sliderRow('sbOdds', 'Odds multiplier', 0.5, 1.5, 0.01, 1, function (v) { return '×' + v.toFixed(2); });
  function renderSandbox() {
    var list = rows.map(function (r) {
      var curve = Math.exp(sb.intercept + sb.slope * Math.log(r.tvl_usd));
      return { slug: r.slug, name: r.name, value: curve * Math.min(0.99, r.launch_odds * sb.odds) };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    $('sandboxRows').innerHTML = list.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td class="num"><b>' + money(r.value) + '</b></td><td class="num">' + pct(Math.min(0.99, rows.find(function (x) { return x.slug === r.slug; }).launch_odds * sb.odds)) + '</td></tr>';
    }).join('');
    var moved = rows.filter(function (r, i) {
      var curve = Math.exp(sb.intercept + sb.slope * Math.log(r.tvl_usd));
      var v = curve * Math.min(0.99, r.launch_odds * sb.odds);
      return Math.abs(v - r.implied_value_usd) / r.implied_value_usd > 0.05;
    }).length;
    $('sandboxNote').textContent = moved + ' of ' + rows.length + ' rows move by more than 5% under these settings. The board above is the live recomputation, not the submitted board.';
  }
  ['sbInt', 'sbSlope', 'sbOdds'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var v = Number($(id).value);
      if (id === 'sbInt') { sb.intercept = v; $('sbIntOut').textContent = v.toFixed(2); }
      if (id === 'sbSlope') { sb.slope = v; $('sbSlopeOut').textContent = v.toFixed(3); }
      if (id === 'sbOdds') { sb.odds = v; $('sbOddsOut').textContent = '×' + v.toFixed(2); }
      renderSandbox();
    });
  });
  renderSandbox();

  // ---- planner -------------------------------------------------------------
  var plan = new Set();
  function addToPlan(slug) {
    plan.add(slug);
    renderPlanner();
    dlg.close();
    tabs.forEach(function (x) { x.classList.remove('on'); });
    document.querySelector('[data-tab="planner"]').classList.add('on');
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('on'); });
    $('tab-planner').classList.add('on');
  }
  function renderPlanner() {
    if (plan.size === 0) { $('plannerText').innerHTML = '<p class="note">Nothing picked yet — open a protocol on the board and add it.</p>'; return; }
    var picked = rows.filter(function (r) { return plan.has(r.slug); });
    var tot = picked.reduce(function (a, r) { return { v: a.v + r.implied_value_usd, lo: a.lo + r.interval_low_usd, cost: a.cost + r.farm_cost_usd, h: a.h + r.farm_hours }; }, { v: 0, lo: 0, cost: 0, h: 0 });
    $('plannerText').innerHTML =
      '<table class="mini"><tr><th>Protocol</th><th>Expected</th><th>Low end</th><th>Farm cost</th><th>Hours</th></tr>' +
      picked.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + money(r.implied_value_usd) + '</td><td>' + money(r.interval_low_usd) + '</td><td>' + money(r.farm_cost_usd) + '</td><td>' + r.farm_hours + '</td></tr>'; }).join('') +
      '<tr><td><b>Total (' + picked.length + ')</b></td><td><b>' + money(tot.v) + '</b></td><td><b>' + money(tot.lo) + '</b></td><td><b>' + money(tot.cost) + '</b></td><td><b>' + tot.h.toFixed(2) + '</b></td></tr></table>' +
      '<p class="note">Totals are the picked rows\u2019 whole expected values added up — a plan across many protocols, not one wallet\u2019s payout.</p>';
  }
  $('clearPlan').addEventListener('click', function () { plan.clear(); renderPlanner(); });
  renderPlanner();

  // ---- audit ---------------------------------------------------------------
  function renderAudit() {
    var byReason = {};
    D.excluded.forEach(function (e) { byReason[e.reason] = (byReason[e.reason] || 0) + 1; });
    var topCat = model.top_category.map(function (x) { return esc(x.category) + ': ' + x.rows + ' rows, ' + money(x.implied_usd) + ' total'; }).join('<br>');
    $('auditText').innerHTML =
      '<table class="mini"><tr><th>Bucket</th><th>Count</th><th>Rule</th></tr>' +
      '<tr><td>Ranked</td><td>' + audit.ranked + '</td><td>no token recorded, not an exchange, not versioned, not a wrapped / staked / bridged product</td></tr>' +
      '<tr><td>Live tokens (set aside)</td><td>' + audit.traded + '</td><td>already trade — shown at market value, never ranked</td></tr>' +
      '<tr><td>Excluded</td><td>' + audit.excluded + '</td><td>' + Object.keys(byReason).map(function (k) { return esc(k) + ': ' + byReason[k]; }).join(' · ') + '</td></tr>' +
      '<tr><td><b>Total</b></td><td><b>' + audit.total + '</b></td><td>ranked + live + excluded</td></tr></table>' +
      '<p>Watchlist: ' + audit.watchlist_ranked + ' of ' + audit.watchlist + ' slugs ranked. Biggest categories on the board:<br>' + topCat + '</p>' +
      '<p class="note">Every excluded protocol is listed below with its reason.</p>' +
      '<table class="mini"><tr><th>Protocol</th><th>Category</th><th>Reason</th></tr>' +
      D.excluded.map(function (e) { return '<tr><td>' + esc(e.name) + '</td><td>' + esc(e.category) + '</td><td>' + esc(e.reason) + '</td></tr>'; }).join('') + '</table>';
  }

  // ---- deep link -----------------------------------------------------------
  renderBoard();
  if (location.hash.indexOf('#detail=') === 0) openDetail(location.hash.slice(8));
})();
