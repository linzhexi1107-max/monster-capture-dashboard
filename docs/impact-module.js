/**
 * 免伤调整影响分析模块（独立挂载，不改动看板原有逻辑）
 * 数据: ./data/mianshang-impact.json
 * 由 slack-mianshang/export-dashboard-impact.js 每周生成。
 */
const IMPACT_DATA_URL = './data/mianshang-impact.json';
const IMPACT_STYLE_ID = 'impact-module-style';

const impactCss = `
.impact-panel {
  margin: 22px 0;
  padding: 26px 28px;
  border: 1px solid var(--line);
  border-left: 4px solid var(--series-3);
  border-radius: var(--radius-medium);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.impact-heading { align-items: center; }
.impact-scope { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.impact-scope-tag {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.impact-period {
  padding: 6px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.impact-conclusion {
  margin: 16px 0 18px;
  padding: 14px 16px;
  border-radius: var(--radius-small);
  background: var(--surface-muted);
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.8;
}
.impact-conclusion strong { color: var(--accent-strong); }
.impact-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.impact-stat {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-small);
  background: var(--surface-solid);
}
.impact-stat-label { display: block; color: var(--muted); font-size: 12px; }
.impact-stat-value {
  display: block;
  margin-top: 6px;
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.impact-stat.is-expected .impact-stat-value { color: var(--accent-strong); }
.impact-stat.is-unobserved .impact-stat-value { color: var(--yellow); }
.impact-stat.is-insufficient .impact-stat-value { color: var(--muted); }
.impact-history {
  margin-bottom: 18px;
  padding: 12px 14px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-small);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.9;
}
.impact-history-title { color: var(--foreground); font-weight: 600; }
.impact-history-item { margin-right: 16px; white-space: nowrap; }
.impact-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.impact-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.impact-filter {
  padding: 6px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: var(--surface-solid);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}
.impact-filter:hover { border-color: var(--accent); color: var(--accent-strong); }
.impact-filter.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-strong);
}
.impact-sort {
  padding: 6px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-small);
  background: var(--surface-solid);
  color: var(--foreground);
  font-size: 12px;
}
.impact-table-shell {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-small);
}
.impact-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.impact-table th, .impact-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  white-space: nowrap;
}
.impact-table th { background: var(--surface-muted); color: var(--muted); font-weight: 600; }
.impact-table tbody tr:last-child td { border-bottom: none; }
.impact-table tbody tr:hover { background: var(--surface-muted); }
.impact-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.impact-table .down { color: var(--accent-strong); }
.impact-table .up { color: var(--orange); }
.impact-table .muted { color: var(--muted); }
.impact-detail { display: block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
.impact-verdict {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  white-space: nowrap;
}
.impact-verdict.is-expected { background: var(--accent-soft); color: var(--accent-strong); }
.impact-verdict.is-unobserved { background: var(--orange-soft); color: var(--orange); }
.impact-verdict.is-insufficient { background: var(--surface-muted); color: var(--muted); }
.impact-method {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.9;
}
.impact-empty { padding: 18px; color: var(--muted); text-align: center; }
@media (max-width: 760px) {
  .impact-panel { padding: 18px; }
  .impact-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .impact-heading { align-items: flex-start; flex-direction: column; gap: 10px; }
}
@media (prefers-color-scheme: dark) {
  .impact-panel { background: rgba(24, 31, 28, 0.62); }
  .impact-stat, .impact-sort, .impact-filter { background: rgba(24, 31, 28, 0.62); }
  .impact-conclusion { background: rgba(24, 31, 28, 0.62); }
}
`;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtPct(value, digits = 2) {
  return Number.isFinite(value) ? (value * 100).toFixed(digits) + '%' : '—';
}

function fmtPp(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return (value > 0 ? '+' : '') + (value * 100).toFixed(digits) + 'pp';
}

function shortDate(value) {
  return String(value || '').slice(5).replace('-', '.');
}

function verdictLabel(type) {
  if (type === 'expected') return '符合预期';
  if (type === 'insufficient') return '数据不足';
  return '未观察到';
}

function conclusionText(summary, events) {
  const total = summary.events || 0;
  if (!total) return '本周期没有可关联的免伤调整样本。';
  const rate = summary.expected / total;
  const trend = rate >= 0.5 ? '多数样本符合预期方向'
    : rate === 0 ? '本周期未观察到符合预期方向的样本'
      : '仅少数样本符合预期方向';
  const hits = events.filter((e) => e.verdictType === 'expected')
    .map((e) => escapeHtml(e.monster) + '（' + shortDate(e.date) + '，' + escapeHtml(e.deltaText || '') + '）');
  const hitText = hits.length ? '符合预期的样本：' + hits.join('、') + '。' : '';
  return '共 <strong>' + total + '</strong> 条可关联调整记录：符合预期 <strong>' +
    summary.expected + '</strong> 条、未观察到符合预期的变化 <strong>' +
    summary.unobserved + '</strong> 条、数据不足 <strong>' + summary.insufficient +
    '</strong> 条。' + trend + '。' + hitText;
}

function renderHistory(history) {
  if (!history || history.length < 2) return '';
  const items = history.map((h) => {
    const per = h.events ? Math.round((h.expected / h.events) * 100) : 0;
    return '<span class="impact-history-item">' + shortDate(h.periodStart) + '–' +
      shortDate(h.periodEnd) + '：' + h.expected + '/' + h.events + ' 符合（' + per + '%）</span>';
  }).join('');
  return '<div class="impact-history"><span class="impact-history-title">跨周趋势</span><br>' + items + '</div>';
}

function changeClass(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.0001) return 'muted';
  return value < 0 ? 'down' : 'up';
}

function rowHtml(event) {
  return '<tr>' +
    '<td>' + shortDate(event.date) + '</td>' +
    '<td>' + escapeHtml(event.monster) + '</td>' +
    '<td><span class="impact-detail" title="' + escapeHtml(event.detail) + '">' + escapeHtml(event.detail) + '</span></td>' +
    '<td class="num">' + escapeHtml(event.deltaText) + '</td>' +
    '<td class="num">' + fmtPct(event.beforeKill) + '</td>' +
    '<td class="num">' + fmtPct(event.afterKill) + '</td>' +
    '<td class="num ' + changeClass(event.netChange) + '">' + fmtPp(event.netChange) + '</td>' +
    '<td class="num ' + changeClass(event.rtpChange) + '">' + fmtPp(event.rtpChange) + '</td>' +
    '<td><span class="impact-verdict is-' + escapeHtml(event.verdictType) + '">' +
      escapeHtml(event.verdict || verdictLabel(event.verdictType)) + '</span></td>' +
    '</tr>';
}

function renderPanel(payload) {
  const meta = payload.meta || {};
  const summary = payload.summary || {};
  const events = payload.events || [];

  const section = document.createElement('section');
  section.className = 'impact-panel';
  section.id = 'impactPanel';
  section.setAttribute('aria-labelledby', 'impactTitle');
  section.innerHTML =
    '<div class="panel-heading impact-heading">' +
      '<div>' +
        '<p class="section-kicker">IMMUNE ADJUSTMENT IMPACT</p>' +
        '<h2 id="impactTitle">免伤调整影响分析</h2>' +
      '</div>' +
      '<div class="impact-scope">' +
        (meta.platform ? '<span class="impact-scope-tag">' + escapeHtml([meta.platform, meta.games].filter(Boolean).join(' · ')) + '</span>' : '') +
        '<span class="impact-period">' + escapeHtml(meta.periodStart) + ' ~ ' + escapeHtml(meta.periodEnd) + '</span>' +
      '</div>' +
    '</div>' +
    '<p class="impact-conclusion" id="impactConclusion">' + conclusionText(summary, events) + '</p>' +
    '<div class="impact-summary">' +
      '<div class="impact-stat"><span class="impact-stat-label">可关联调整事件</span><span class="impact-stat-value">' + (summary.events || 0) + '</span></div>' +
      '<div class="impact-stat is-expected"><span class="impact-stat-label">符合预期</span><span class="impact-stat-value">' + (summary.expected || 0) + '</span></div>' +
      '<div class="impact-stat is-unobserved"><span class="impact-stat-label">未观察到符合预期变化</span><span class="impact-stat-value">' + (summary.unobserved || 0) + '</span></div>' +
      '<div class="impact-stat is-insufficient"><span class="impact-stat-label">数据不足</span><span class="impact-stat-value">' + (summary.insufficient || 0) + '</span></div>' +
    '</div>' +
    renderHistory(payload.history) +
    '<div class="impact-controls">' +
      '<div class="impact-filters" role="group" aria-label="按判定筛选">' +
        '<button class="impact-filter is-active" type="button" data-impact-filter="all">全部 ' + (summary.events || 0) + '</button>' +
        '<button class="impact-filter" type="button" data-impact-filter="expected">符合预期 ' + (summary.expected || 0) + '</button>' +
        '<button class="impact-filter" type="button" data-impact-filter="unobserved">未观察到 ' + (summary.unobserved || 0) + '</button>' +
        '<button class="impact-filter" type="button" data-impact-filter="insufficient">数据不足 ' + (summary.insufficient || 0) + '</button>' +
      '</div>' +
      '<select class="impact-sort" aria-label="排序方式">' +
        '<option value="date">按日期</option>' +
        '<option value="net">按净变化绝对值</option>' +
        '<option value="delta">按免伤调整幅度</option>' +
        '<option value="monster">按怪物</option>' +
      '</select>' +
    '</div>' +
    '<div class="impact-table-shell">' +
      '<table class="impact-table">' +
        '<thead><tr>' +
          '<th scope="col">调整日期</th><th scope="col">怪物</th><th scope="col">调整详情</th>' +
          '<th scope="col" class="num">免伤净调整</th><th scope="col" class="num">前3日击杀率</th>' +
          '<th scope="col" class="num">后3日击杀率</th><th scope="col" class="num">剔除大盘净变化</th>' +
          '<th scope="col" class="num">RTP变化</th><th scope="col">判定</th>' +
        '</tr></thead>' +
        '<tbody id="impactTableBody"></tbody>' +
      '</table>' +
    '</div>' +
    '<p class="impact-method"><strong>方法：</strong>' + escapeHtml(meta.method) +
      '<br><strong>注意：</strong>' + escapeHtml(meta.caveat) +
      '<br><strong>数据来源：</strong>' + escapeHtml(meta.source) +
      ' · 生成时间 ' + escapeHtml(String(meta.generatedAt || '').slice(0, 16).replace('T', ' ')) + '</p>';

  const anchor = document.querySelector('#metricDefinitions') || document.querySelector('.charts-grid');
  if (anchor) anchor.parentNode.insertBefore(section, anchor);
  else document.querySelector('.app-main')?.appendChild(section);

  const tbody = section.querySelector('#impactTableBody');
  let activeFilter = 'all';
  let sortBy = 'date';

  function draw() {
    const list = events.filter((e) => activeFilter === 'all' || e.verdictType === activeFilter);
    const sorted = list.slice().sort((a, b) => {
      if (sortBy === 'net') {
        const av = Math.abs(a.netChange ?? 0), bv = Math.abs(b.netChange ?? 0);
        return bv - av;
      }
      if (sortBy === 'delta') return Math.abs(Number(b.delta) || 0) - Math.abs(Number(a.delta) || 0);
      if (sortBy === 'monster') return String(a.monster).localeCompare(String(b.monster), 'zh');
      return String(b.date).localeCompare(String(a.date)) || String(a.monster).localeCompare(String(b.monster), 'zh');
    });
    tbody.innerHTML = sorted.length ? sorted.map(rowHtml).join('')
      : '<tr><td class="impact-empty" colspan="9">当前筛选下暂无样本</td></tr>';
  }

  section.querySelectorAll('[data-impact-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.impactFilter;
      section.querySelectorAll('[data-impact-filter]').forEach((b) => b.classList.toggle('is-active', b === button));
      draw();
    });
  });
  section.querySelector('.impact-sort').addEventListener('change', (event) => {
    sortBy = event.target.value;
    draw();
  });
  draw();
}

if (!document.getElementById(IMPACT_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = IMPACT_STYLE_ID;
  style.textContent = impactCss;
  document.head.appendChild(style);
}

fetch(IMPACT_DATA_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error('影响分析数据加载失败（' + response.status + '）');
    return response.json();
  })
  .then(renderPanel)
  .catch((error) => {
    console.warn('[impact-module]', error.message);
  });
