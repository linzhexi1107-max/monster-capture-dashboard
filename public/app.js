import {
  aggregateDailyByMonster,
  buildWeeklyMonsterSeries,
  buildStaticDashboardPayload,
  formatKbt,
  formatT,
} from './dashboard-logic.js';

const elements = {
  filterForm: document.querySelector('#filterForm'),
  resetFilters: document.querySelector('#resetFilters'),
  startDate: document.querySelector('#startDate'),
  endDate: document.querySelector('#endDate'),
  arenaId: document.querySelector('#arenaId'),
  monsterMultiSelect: document.querySelector('#monsterMultiSelect'),
  monsterTrigger: document.querySelector('#monsterTrigger'),
  monsterTriggerText: document.querySelector('#monsterTriggerText'),
  monsterMenu: document.querySelector('#monsterMenu'),
  monsterOptions: document.querySelector('#monsterOptions'),
  selectAllMonsters: document.querySelector('#selectAllMonsters'),
  clearMonsters: document.querySelector('#clearMonsters'),
  filterError: document.querySelector('#filterError'),
  notice: document.querySelector('#notice'),
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  lastUpdated: document.querySelector('#lastUpdated'),
  metricCost: document.querySelector('#metricCost'),
  metricRtp: document.querySelector('#metricRtp'),
  metricKillRate: document.querySelector('#metricKillRate'),
  yesterdayTop3Label: document.querySelector('#yesterdayTop3Label'),
  yesterdayTop3: document.querySelector('#yesterdayTop3'),
  trendChart: document.querySelector('#trendChart'),
  costRatioChart: document.querySelector('#costRatioChart'),
  rtpChart: document.querySelector('#rtpChart'),
  userKillChart: document.querySelector('#userKillChart'),
  monsterKillChart: document.querySelector('#monsterKillChart'),
  topMonsterChart: document.querySelector('#topMonsterChart'),
  topMonsterPeriod: document.querySelector('#topMonsterPeriod'),
  weeklyMonsterChart: document.querySelector('#weeklyMonsterChart'),
  tableBody: document.querySelector('#tableBody'),
  pagination: document.querySelector('#pagination'),
  pageInfo: document.querySelector('#pageInfo'),
  previousPage: document.querySelector('#previousPage'),
  nextPage: document.querySelector('#nextPage'),
};

const state = {
  rows: [],
  meta: null,
  page: 1,
  pageSize: 20,
  initialized: false,
  filtersInitialized: false,
  selectedMonsters: new Set(),
};

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
});
let staticSnapshotPromise;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : '—';
}

function formatRate(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(digits)}%` : '—';
}

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function setLoading(isLoading) {
  elements.filterForm.classList.toggle('is-loading', isLoading);
  if (isLoading && !state.initialized) {
    elements.statusText.textContent = '正在读取数据';
  }
}

function showError(message) {
  elements.filterError.textContent = message;
  elements.filterError.hidden = false;
}

function clearError() {
  elements.filterError.hidden = true;
  elements.filterError.textContent = '';
}

function setNotice(message) {
  if (!message) {
    elements.notice.hidden = true;
    elements.notice.textContent = '';
    return;
  }
  elements.notice.textContent = message;
  elements.notice.hidden = false;
}

function setStatus(meta) {
  elements.statusDot.classList.remove('is-live', 'is-error');
  if (meta.source === 'live') {
    elements.statusDot.classList.add('is-live');
    elements.statusText.textContent = '真实数据';
  } else {
    elements.statusText.textContent = '演示数据';
  }
  elements.lastUpdated.textContent =
    meta.updatedAtShanghai || (meta.maxDate ? `数据截至 ${meta.maxDate}` : '等待首次更新');
  setNotice(meta.warning);
}

function htmlOption(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function populateSelect(select, values, allLabel) {
  const previousValue = select.value;
  select.innerHTML =
    `<option value="">${escapeHtml(allLabel)}</option>` +
    values.map((value) => htmlOption(value, value)).join('');
  if (values.includes(previousValue)) {
    select.value = previousValue;
  }
}

function renderMonsterOptions(values) {
  elements.monsterOptions.innerHTML = values
    .map((name, index) => {
      const checked = state.selectedMonsters.has(name);
      return `
        <div class="multi-select-option" role="option" aria-selected="${checked}">
          <input
            id="monsterOption${index}"
            type="checkbox"
            value="${escapeHtml(name)}"
            ${checked ? 'checked' : ''}
          />
          <label for="monsterOption${index}">${escapeHtml(name)}</label>
        </div>
      `;
    })
    .join('');
  updateMonsterTrigger();
}

function updateMonsterTrigger() {
  const selected = [...state.selectedMonsters];
  if (!selected.length) {
    elements.monsterTriggerText.textContent = '全部怪物';
    elements.monsterTrigger.title = '全部怪物';
  } else if (selected.length === 1) {
    elements.monsterTriggerText.textContent = selected[0];
    elements.monsterTrigger.title = selected[0];
  } else {
    elements.monsterTriggerText.textContent = `已选 ${selected.length} 个怪物`;
    elements.monsterTrigger.title = selected.join('、');
  }
}

function setMonsterMenuOpen(open) {
  elements.monsterMenu.hidden = !open;
  elements.monsterTrigger.setAttribute('aria-expanded', String(open));
}

function syncMonsterSelection() {
  state.selectedMonsters = new Set(
    [...elements.monsterOptions.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => input.value),
  );
  for (const option of elements.monsterOptions.querySelectorAll('[role="option"]')) {
    const input = option.querySelector('input');
    option.setAttribute('aria-selected', String(input.checked));
  }
  updateMonsterTrigger();
}

function initializeFilters(meta) {
  populateSelect(elements.arenaId, meta.availableArenas, '全部场次');

  const urlParams = new URLSearchParams(window.location.search);
  const urlStart = urlParams.get('start_date');
  const urlEnd = urlParams.get('end_date');
  const sevenDayStart = meta.maxDate ? addDays(meta.maxDate, -6) : '';
  const defaultStart =
    sevenDayStart && meta.minDate && sevenDayStart < meta.minDate
      ? meta.minDate
      : sevenDayStart;
  elements.startDate.value =
    urlStart && meta.minDate && urlStart >= meta.minDate ? urlStart : defaultStart;
  elements.endDate.value =
    urlEnd && meta.maxDate && urlEnd <= meta.maxDate ? urlEnd : meta.maxDate || '';
  elements.startDate.min = meta.minDate || '';
  elements.startDate.max = meta.maxDate || '';
  elements.endDate.min = meta.minDate || '';
  elements.endDate.max = meta.maxDate || '';

  const urlArena = urlParams.get('arena_id');
  const urlMonsters = urlParams
    .getAll('monster_name')
    .flatMap((value) => value.split(','))
    .filter((name) => meta.availableMonsters.includes(name));
  if (meta.availableArenas.includes(urlArena)) elements.arenaId.value = urlArena;
  state.selectedMonsters = new Set(urlMonsters);
  renderMonsterOptions(meta.availableMonsters);
  state.filtersInitialized = true;
}

function currentParams() {
  const params = new URLSearchParams({
    start_date: elements.startDate.value,
    end_date: elements.endDate.value,
  });
  if (elements.arenaId.value) params.set('arena_id', elements.arenaId.value);
  for (const monsterName of state.selectedMonsters) {
    params.append('monster_name', monsterName);
  }
  return params;
}

function updateUrl(params) {
  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', nextUrl);
}

async function loadStaticSnapshot() {
  if (!staticSnapshotPromise) {
    staticSnapshotPromise = fetch('./data/dashboard-data.json', {
      headers: { Accept: 'application/json' },
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`数据文件加载失败（${response.status}）`);
      }
      return response.json();
    });
  }
  return staticSnapshotPromise;
}

async function loadDashboardPayload(params) {
  if (document.documentElement.dataset.dashboardMode === 'static') {
    const snapshot = await loadStaticSnapshot();
    return buildStaticDashboardPayload(snapshot, {
      startDate: params.get('start_date') || '',
      endDate: params.get('end_date') || '',
      arenaId: params.get('arena_id') || '',
      monsterNames: params.getAll('monster_name'),
    });
  }

  const response = await fetch(`/api/data?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `请求失败（${response.status}）`);
  }
  return payload;
}

async function fetchData() {
  clearError();
  setLoading(true);
  const params = currentParams();
  try {
    const payload = await loadDashboardPayload(params);

    state.meta = payload.meta;
    state.rows = payload.data || [];
    state.page = 1;
    state.initialized = true;
    if (!state.filtersInitialized) {
      initializeFilters(payload.meta);
      const initializedParams = currentParams();
      updateUrl(initializedParams);
      if (initializedParams.toString() !== params.toString()) {
        await fetchData();
        return;
      }
    }

    render(payload);
    updateUrl(params);
  } catch (error) {
    console.error('[dashboard]', error);
    elements.statusDot.classList.remove('is-live');
    elements.statusDot.classList.add('is-error');
    elements.statusText.textContent = '加载失败';
    showError(error.message || '数据加载失败。');
    renderEmptyState('数据加载失败，请稍后重试。');
  } finally {
    setLoading(false);
  }
}

function chartEmpty(container, message = '当前筛选范围暂无数据') {
  container.innerHTML = `<div class="chart-empty">${escapeHtml(message)}</div>`;
}

function chartLegendHtml(series, extraItems = []) {
  return `
    <div class="chart-series-legend" aria-label="图例">
      ${series
        .map(
          (item, index) => `
            <button
              class="chart-series-legend-item chart-legend-toggle"
              type="button"
              data-legend-series="${escapeHtml(seriesDomId(item, index))}"
              aria-pressed="true"
            >
              <i class="series-swatch series-swatch-${index % 6}" aria-hidden="true"></i>
              <span>${escapeHtml(item.name)}</span>
            </button>
          `,
        )
        .join('')}
      ${extraItems
        .map(
          (item) =>
            item.seriesId
              ? `
                <button
                  class="chart-series-legend-item chart-legend-toggle"
                  type="button"
                  data-legend-series="${escapeHtml(item.seriesId)}"
                  aria-pressed="true"
                >
                  <i class="${item.swatchClass}" aria-hidden="true"></i>
                  <span>${escapeHtml(item.label)}</span>
                </button>
              `
              : `
                <span class="chart-series-legend-item">
                  <i class="${item.swatchClass}" aria-hidden="true"></i>
                  <span>${escapeHtml(item.label)}</span>
                </span>
              `,
        )
        .join('')}
    </div>
  `;
}

function seriesDomId(item, index) {
  return String(item.configId || item.id || item.name || `series-${index}`);
}

function chartDataLabel(x, y, text, anchor = 'end') {
  return `<text class="chart-data-label" x="${x}" y="${Math.max(12, y - 7)}" text-anchor="${anchor}">${escapeHtml(text)}</text>`;
}

function bindChartInteractions(container) {
  let tooltip = container.querySelector('.chart-hover-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-hover-tooltip';
    tooltip.hidden = true;
    container.append(tooltip);
  }
  if (container.dataset.interactionsBound === 'true') return;
  container.dataset.interactionsBound = 'true';

  container.addEventListener('pointerover', (event) => {
    const hit = event.target.closest('.chart-hit-point');
    if (!hit || !container.contains(hit)) return;
    const seriesId = hit.dataset.seriesId;
    container.classList.add('has-active-series');
    for (const group of container.querySelectorAll('[data-series-group]')) {
      group.classList.toggle(
        'is-active',
        group.dataset.seriesGroup === seriesId,
      );
    }
    tooltip = container.querySelector('.chart-hover-tooltip');
    tooltip.innerHTML = `
      <strong>${escapeHtml(hit.dataset.seriesName)}</strong>
      <span>${escapeHtml(hit.dataset.date)}</span>
      <span>${escapeHtml(hit.dataset.metric)}：${escapeHtml(hit.dataset.value)}</span>
    `;
    tooltip.hidden = false;
  });

  container.addEventListener('pointerleave', () => {
    container.classList.remove('has-active-series');
    for (const group of container.querySelectorAll('[data-series-group]')) {
      group.classList.remove('is-active');
    }
    const currentTooltip = container.querySelector('.chart-hover-tooltip');
    if (currentTooltip) currentTooltip.hidden = true;
  });

  container.addEventListener('click', (event) => {
    const button = event.target.closest('.chart-legend-toggle');
    if (!button || !container.contains(button)) return;
    const visible = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(visible));
    button.classList.toggle('is-off', !visible);
    for (const group of container.querySelectorAll('[data-series-group]')) {
      if (group.dataset.seriesGroup === button.dataset.legendSeries) {
        group.classList.toggle('is-series-hidden', !visible);
      }
    }
  });
}

function paddedDomain(values, minimumSpan = 0.02) {
  const finiteValues = values
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (!finiteValues.length) return [0, 1];

  let minimum = Math.min(...finiteValues);
  let maximum = Math.max(...finiteValues);
  if (maximum - minimum < minimumSpan) {
    const center = (maximum + minimum) / 2;
    minimum = center - minimumSpan / 2;
    maximum = center + minimumSpan / 2;
  }
  const padding = (maximum - minimum) * 0.16;
  return [
    Math.max(0, minimum - padding),
    maximum + padding,
  ];
}

function xPositions(dates, left, plotWidth) {
  return new Map(
    dates.map((date, index) => [
      date,
      left + (dates.length === 1 ? plotWidth / 2 : (plotWidth * index) / (dates.length - 1)),
    ]),
  );
}

function xAxisLabels(dates, positions, width, bottom) {
  const maxLabels = width < 420 ? 4 : width < 680 ? 5 : 7;
  const step = Math.max(1, Math.ceil(dates.length / maxLabels));
  const visibleIndexes = new Set();
  for (let index = 0; index < dates.length; index += step) {
    visibleIndexes.add(index);
  }
  visibleIndexes.add(dates.length - 1);
  return dates
    .map((date, index) =>
      visibleIndexes.has(index)
        ? `<text class="chart-axis-label" x="${positions.get(date)}" y="${bottom}" text-anchor="middle">${escapeHtml(date.slice(5))}</text>`
        : '',
    )
    .join('');
}

function renderMonsterSeriesChart(container, series, valueKey, axisLabel) {
  const visibleSeries = series.filter((item) => item.points.length);
  if (!visibleSeries.length) {
    chartEmpty(container);
    return;
  }

  const dates = [...new Set(visibleSeries.flatMap((item) =>
    item.points.map((point) => point.date),
  ))].sort();
  const values = visibleSeries.flatMap((item) =>
    item.points.map((point) => point[valueKey]),
  );
  const width = Math.max(container.clientWidth, 280);
  const height = 258;
  const padding = { top: 28, right: 46, bottom: 38, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const positions = xPositions(dates, padding.left, plotWidth);
  const domain = paddedDomain(values);
  const yAt = (value) =>
    padding.top + plotHeight -
    ((value - domain[0]) / (domain[1] - domain[0])) * plotHeight;
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return {
      value: domain[1] - (domain[1] - domain[0]) * ratio,
      y: padding.top + plotHeight * ratio,
    };
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <text class="chart-axis-caption" x="${padding.left}" y="14">${escapeHtml(axisLabel)} · ${visibleSeries.length} 个怪物独立曲线</text>
      ${ticks
        .map(
          (tick) => `
            <line class="chart-grid-line" x1="${padding.left}" y1="${tick.y}" x2="${width - padding.right}" y2="${tick.y}"></line>
            <text class="chart-axis-label" x="${padding.left - 9}" y="${tick.y + 3}" text-anchor="end">${escapeHtml(formatRate(tick.value, 1))}</text>
          `,
        )
        .join('')}
      ${visibleSeries
        .map((item, seriesIndex) => {
          const seriesId = seriesDomId(item, seriesIndex);
          const path = item.points
            .map(
              (point, pointIndex) =>
                `${pointIndex === 0 ? 'M' : 'L'} ${positions.get(point.date).toFixed(1)} ${yAt(point[valueKey]).toFixed(1)}`,
            )
            .join(' ');
          const labelPoints =
            visibleSeries.length === 1 && item.points.length <= 7
              ? item.points
              : [item.points.at(-1)];
          return `
            <g class="chart-series-group" data-series-group="${escapeHtml(seriesId)}">
              <path class="chart-line monster-series series-tone-${seriesIndex % 6}" d="${path}"></path>
              ${item.points
                .map(
                  (point) => `
                    <circle class="chart-point chart-point-series series-tone-${seriesIndex % 6}" cx="${positions.get(point.date)}" cy="${yAt(point[valueKey])}" r="2.8"></circle>
                    <circle
                      class="chart-hit-point"
                      cx="${positions.get(point.date)}"
                      cy="${yAt(point[valueKey])}"
                      r="8"
                      data-series-id="${escapeHtml(seriesId)}"
                      data-series-name="${escapeHtml(item.name)}"
                      data-date="${escapeHtml(point.date)}"
                      data-metric="${escapeHtml(axisLabel)}"
                      data-value="${escapeHtml(formatRate(point[valueKey]))}"
                    ></circle>
                  `,
                )
                .join('')}
              ${labelPoints
                .map((point) =>
                  chartDataLabel(
                    positions.get(point.date),
                    yAt(point[valueKey]),
                    formatRate(point[valueKey]),
                  ),
                )
                .join('')}
            </g>
          `;
        })
        .join('')}
      ${xAxisLabels(dates, positions, width, height - 12)}
    </svg>
    ${chartLegendHtml(visibleSeries)}
  `;
  bindChartInteractions(container);
}

function renderDualAxisChart(container, data) {
  const series = data.series.filter((item) => item.points.length);
  const dailyTotals = data.dailyTotals;
  if (!series.length || !dailyTotals.length) {
    chartEmpty(container);
    return;
  }

  const dates = [...new Set([
    ...series.flatMap((item) => item.points.map((point) => point.date)),
    ...dailyTotals.map((point) => point.date),
  ])].sort();
  const width = Math.max(container.clientWidth, 300);
  const height = 292;
  const padding = { top: 30, right: 76, bottom: 38, left: 62 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const positions = xPositions(dates, padding.left, plotWidth);
  const primaryDomain = paddedDomain(
    series.flatMap((item) => item.points.map((point) => point.config_cost)),
  );
  const secondaryDomain = paddedDomain(
    dailyTotals.map((point) => point.daily_config_cost),
    0.04,
  );
  const primaryY = (value) =>
    padding.top + plotHeight -
    ((value - primaryDomain[0]) /
      (primaryDomain[1] - primaryDomain[0])) *
      plotHeight;
  const secondaryY = (value) =>
    padding.top + plotHeight -
    ((value - secondaryDomain[0]) /
      (secondaryDomain[1] - secondaryDomain[0])) *
      plotHeight;
  const totalPath = dailyTotals
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${positions.get(point.date).toFixed(1)} ${secondaryY(point.daily_config_cost).toFixed(1)}`,
    )
    .join(' ');
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return {
      primaryValue:
        primaryDomain[1] - (primaryDomain[1] - primaryDomain[0]) * ratio,
      secondaryValue:
        secondaryDomain[1] -
        (secondaryDomain[1] - secondaryDomain[0]) * ratio,
      y: padding.top + plotHeight * ratio,
    };
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <text class="chart-axis-caption axis-primary" x="${padding.left}" y="14">怪物消耗价值（config_cost）· ${series.length} 条曲线</text>
      <text class="chart-axis-caption axis-secondary" x="${width - padding.right}" y="14" text-anchor="end">当日总消耗价值 · T</text>
      ${ticks
        .map(
          (tick) => `
            <line class="chart-grid-line" x1="${padding.left}" y1="${tick.y}" x2="${width - padding.right}" y2="${tick.y}"></line>
            <text class="chart-axis-label" x="${padding.left - 9}" y="${tick.y + 3}" text-anchor="end">${escapeHtml(formatKbt(tick.primaryValue))}</text>
            <text class="chart-axis-label" x="${width - padding.right + 9}" y="${tick.y + 3}" text-anchor="start">${escapeHtml(formatT(tick.secondaryValue))}</text>
          `,
        )
        .join('')}
      <g class="chart-series-group" data-series-group="daily-total">
        <path class="chart-line daily-total-line" d="${totalPath}"></path>
        ${dailyTotals
          .map(
            (point) => `
              <circle class="chart-point chart-point-secondary" cx="${positions.get(point.date)}" cy="${secondaryY(point.daily_config_cost)}" r="3"></circle>
              <circle
                class="chart-hit-point"
                cx="${positions.get(point.date)}"
                cy="${secondaryY(point.daily_config_cost)}"
                r="8"
                data-series-id="daily-total"
                data-series-name="当日总消耗价值"
                data-date="${escapeHtml(point.date)}"
                data-metric="当日总消耗价值"
                data-value="${escapeHtml(formatT(point.daily_config_cost))}"
              ></circle>
            `,
          )
          .join('')}
        ${chartDataLabel(
          positions.get(dailyTotals.at(-1).date),
          secondaryY(dailyTotals.at(-1).daily_config_cost),
          formatT(dailyTotals.at(-1).daily_config_cost),
        )}
      </g>
      ${series
        .map((item, seriesIndex) => {
          const seriesId = seriesDomId(item, seriesIndex);
          const path = item.points
            .map(
              (point, pointIndex) =>
                `${pointIndex === 0 ? 'M' : 'L'} ${positions.get(point.date).toFixed(1)} ${primaryY(point.config_cost).toFixed(1)}`,
            )
            .join(' ');
          const labelPoints =
            series.length === 1 && item.points.length <= 7
              ? item.points
              : [item.points.at(-1)];
          return `
            <g class="chart-series-group" data-series-group="${escapeHtml(seriesId)}">
              <path class="chart-line monster-series series-tone-${seriesIndex % 6}" d="${path}"></path>
              ${item.points
                .map(
                  (point) => `
                    <circle class="chart-point chart-point-series series-tone-${seriesIndex % 6}" cx="${positions.get(point.date)}" cy="${primaryY(point.config_cost)}" r="2.8"></circle>
                    <circle
                      class="chart-hit-point"
                      cx="${positions.get(point.date)}"
                      cy="${primaryY(point.config_cost)}"
                      r="8"
                      data-series-id="${escapeHtml(seriesId)}"
                      data-series-name="${escapeHtml(item.name)}"
                      data-date="${escapeHtml(point.date)}"
                      data-metric="怪物消耗价值"
                      data-value="${escapeHtml(formatKbt(point.config_cost))}"
                    ></circle>
                  `,
                )
                .join('')}
              ${labelPoints
                .map((point) =>
                  chartDataLabel(
                    positions.get(point.date),
                    primaryY(point.config_cost),
                    formatKbt(point.config_cost),
                  ),
                )
                .join('')}
            </g>
          `;
        })
        .join('')}
      ${xAxisLabels(dates, positions, width, height - 12)}
    </svg>
    ${chartLegendHtml(series, [
      {
        swatchClass: 'series-swatch series-swatch-daily-total',
        label: '当日总消耗价值',
        seriesId: 'daily-total',
      },
    ])}
  `;
  bindChartInteractions(container);
}

function renderTopMonsterChart(monsters, period, selectedNames) {
  if (!monsters?.length) {
    elements.topMonsterPeriod.textContent = '—';
    chartEmpty(elements.topMonsterChart, '最近 7 日暂无排行数据');
    return;
  }

  elements.topMonsterPeriod.textContent =
    period?.start && period?.end ? `${period.start} — ${period.end}` : '近 7 日';
  const width = Math.max(elements.topMonsterChart.clientWidth, 300);
  const rowHeight = 31;
  const height = monsters.length * rowHeight + 8;
  const labelWidth = Math.min(112, width * 0.3);
  const valueWidth = 58;
  const barMax = Math.max(40, width - labelWidth - valueWidth - 4);
  const maximum = Math.max(
    ...monsters.map((monster) => Number(monster.config_cost_ratio) || 0),
    0.0001,
  );

  elements.topMonsterChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${monsters
        .map((monster, index) => {
          const y = index * rowHeight + 4;
          const ratio = Number(monster.config_cost_ratio) || 0;
          const barWidth = Math.max(3, (ratio / maximum) * barMax);
          const selected = selectedNames.has(monster.monster_name);
          return `
            <text class="top-rank-number" x="0" y="${y + 15}">${String(index + 1).padStart(2, '0')}</text>
            <text class="top-rank-name" x="24" y="${y + 15}">${escapeHtml(monster.monster_name)}</text>
            <rect class="top-rank-track" x="${labelWidth}" y="${y + 6}" width="${barMax}" height="11" rx="5.5"></rect>
            <rect class="top-rank-bar ${selected ? 'is-selected' : ''}" x="${labelWidth}" y="${y + 6}" width="${barWidth}" height="11" rx="5.5">
              <title>${escapeHtml(monster.monster_name)} · 近 7 日怪物消耗占比 ${escapeHtml(formatRate(ratio))} · 怪物消耗价值 ${escapeHtml(formatKbt(monster.config_cost))}</title>
            </rect>
            <text class="top-rank-value" x="${width}" y="${y + 15}" text-anchor="end">${escapeHtml(formatRate(ratio))}</text>
          `;
        })
        .join('')}
    </svg>
    <div class="chart-series-legend chart-series-legend-note" aria-label="图例">
      <span class="chart-series-legend-item"><i class="series-swatch series-swatch-bar" aria-hidden="true"></i><span>条形长度：怪物消耗占比</span></span>
      <span class="chart-series-legend-item"><i class="series-swatch series-swatch-selected" aria-hidden="true"></i><span>当前筛选怪物</span></span>
    </div>
  `;
}

function renderWeeklyMonsterChart(container, rows) {
  const allSeries = buildWeeklyMonsterSeries(rows);
  if (!allSeries.length) {
    chartEmpty(container);
    return;
  }

  const selectedSeries = state.selectedMonsters.size
    ? allSeries.filter((series) => state.selectedMonsters.has(series.name))
    : allSeries;
  const displaySeries = selectedSeries.length ? selectedSeries : allSeries;
  const dates = [...new Set(displaySeries.flatMap((series) =>
    series.points.map((point) => point.date),
  ))].sort();
  const width = Math.max(container.clientWidth, 300);
  const height = 270;
  const padding = { top: 28, right: 46, bottom: 38, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const positions = xPositions(dates, padding.left, plotWidth);
  const values = displaySeries.flatMap((series) => [
    ...series.points.map((point) => point.value),
    ...(displaySeries.length === 1 ? [series.average] : []),
  ]);
  const domain = paddedDomain(values, 0.03);
  const yAt = (value) =>
    padding.top + plotHeight -
    ((value - domain[0]) / (domain[1] - domain[0])) * plotHeight;
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return {
      value: domain[1] - (domain[1] - domain[0]) * ratio,
      y: padding.top + plotHeight * ratio,
    };
  });
  const belowCount = displaySeries.reduce(
    (sum, series) => sum + series.points.filter((point) => point.belowAverage).length,
    0,
  );

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <text class="chart-axis-caption" x="${padding.left}" y="14">怪物击杀率${displaySeries.length > 1 ? ` · ${displaySeries.length} 个 ID` : ''}</text>
      <text class="chart-axis-label weekly-warning-label" x="${width - padding.right}" y="14" text-anchor="end">${belowCount} 个低点</text>
      ${ticks
        .map(
          (tick) => `
            <line class="chart-grid-line" x1="${padding.left}" y1="${tick.y}" x2="${width - padding.right}" y2="${tick.y}"></line>
            <text class="chart-axis-label" x="${padding.left - 9}" y="${tick.y + 3}" text-anchor="end">${escapeHtml(formatRate(tick.value, 1))}</text>
          `,
        )
        .join('')}
      ${displaySeries
        .map((series, seriesIndex) => {
          const seriesId = seriesDomId(series, seriesIndex);
          const path = series.points
            .map(
              (point, pointIndex) =>
                `${pointIndex === 0 ? 'M' : 'L'} ${positions.get(point.date).toFixed(1)} ${yAt(point.value).toFixed(1)}`,
            )
            .join(' ');
          const averageLine =
            displaySeries.length === 1
              ? `<line class="chart-average-line" x1="${padding.left}" y1="${yAt(series.average)}" x2="${width - padding.right}" y2="${yAt(series.average)}"></line>
                 <text class="chart-average-label" x="${width - padding.right}" y="${yAt(series.average) - 6}" text-anchor="end">均值 ${escapeHtml(formatRate(series.average))}</text>`
              : '';
          const labelPoints =
            displaySeries.length === 1 && series.points.length <= 7
              ? series.points
              : [series.points.at(-1)];
          return `
            <g class="chart-series-group" data-series-group="${escapeHtml(seriesId)}">
              ${averageLine}
              <path class="chart-line weekly-series ${displaySeries.length === 1 ? 'weekly-series-single' : ''} series-tone-${seriesIndex % 6}" d="${path}"></path>
              ${series.points
                .map(
                  (point) => `
                    <circle class="chart-point ${point.belowAverage ? 'is-below-average' : ''}" cx="${positions.get(point.date)}" cy="${yAt(point.value)}" r="${point.belowAverage ? 4.2 : 2.8}"></circle>
                    <circle
                      class="chart-hit-point"
                      cx="${positions.get(point.date)}"
                      cy="${yAt(point.value)}"
                      r="8"
                      data-series-id="${escapeHtml(seriesId)}"
                      data-series-name="${escapeHtml(series.name)}"
                      data-date="${escapeHtml(point.date)}"
                      data-metric="怪物击杀率"
                      data-value="${escapeHtml(formatRate(point.value))}"
                    ></circle>
                  `,
                )
                .join('')}
              ${labelPoints
                .map((point) =>
                  chartDataLabel(
                    positions.get(point.date),
                    yAt(point.value),
                    formatRate(point.value),
                  ),
                )
                .join('')}
            </g>
          `;
        })
        .join('')}
      ${xAxisLabels(dates, positions, width, height - 12)}
    </svg>
    ${chartLegendHtml(displaySeries, [
      {
        swatchClass: 'series-swatch series-swatch-alert',
        label: '低于自身近 7 日均值',
      },
      {
        swatchClass: 'series-swatch series-swatch-average',
        label: '近 7 日均值参考线',
      },
    ])}
  `;
  bindChartInteractions(container);
}

function renderCharts(rows, meta) {
  const dailyByMonster = aggregateDailyByMonster(rows);
  renderDualAxisChart(elements.trendChart, dailyByMonster);
  renderMonsterSeriesChart(
    elements.costRatioChart,
    dailyByMonster.series,
    'config_cost_ratio',
    '怪物消耗占比',
  );
  renderMonsterSeriesChart(elements.rtpChart, dailyByMonster.series, 'rtp', 'RTP');
  renderMonsterSeriesChart(
    elements.userKillChart,
    dailyByMonster.series,
    'user_kill_rate',
    '用户击杀率',
  );
  renderMonsterSeriesChart(
    elements.monsterKillChart,
    dailyByMonster.series,
    'monster_kill_rate',
    '怪物击杀率',
  );
  renderTopMonsterChart(
    meta.recentTopMonsters,
    meta.recentTopPeriod,
    state.selectedMonsters,
  );
  renderWeeklyMonsterChart(elements.weeklyMonsterChart, rows);
}

function renderMetrics(rows, meta) {
  const totalCost = rows.reduce(
    (sum, row) => sum + (Number(row.config_cost) || 0),
    0,
  );
  const weightedRtpNumerator = rows.reduce(
    (sum, row) =>
      sum + (Number(row.config_cost) || 0) * (Number(row.rtp) || 0),
    0,
  );
  const attackUsers = rows.reduce(
    (sum, row) => sum + (Number(row.attack_user_count) || 0),
    0,
  );
  const killedUsers = rows.reduce(
    (sum, row) => sum + (Number(row.killed_user_count) || 0),
    0,
  );
  elements.metricCost.textContent = formatKbt(totalCost);
  elements.metricCost.title = formatNumber(totalCost);
  elements.metricRtp.textContent = totalCost
    ? formatRate(weightedRtpNumerator / totalCost)
    : '—';
  elements.metricKillRate.textContent = attackUsers
    ? formatRate(killedUsers / attackUsers)
    : '—';

  const topDate = meta.yesterdayTopDate;
  elements.yesterdayTop3Label.textContent = topDate
    ? `昨日 ${topDate.slice(5)} 消耗 TOP3`
    : '昨日消耗 TOP3';
  const topMonsters = meta.yesterdayTopMonsters || [];
  elements.yesterdayTop3.innerHTML = topMonsters.length
    ? topMonsters
        .map(
          (monster, index) => `
            <li class="top3-row">
              <span class="top3-rank">${index + 1}</span>
              <span class="top3-name" title="${escapeHtml(monster.monster_name)}">${escapeHtml(monster.monster_name)}</span>
              <span class="top3-share">${escapeHtml(formatRate(monster.config_cost_ratio))}</span>
              <span class="top3-value">${escapeHtml(formatT(monster.config_cost))}</span>
            </li>
          `,
        )
        .join('')
    : '<li class="top3-empty">昨日暂无数据</li>';
}

function metricCell(value) {
  return `<span title="${escapeHtml(formatNumber(value))}">${escapeHtml(formatKbt(value))}</span>`;
}

function tableRowsHtml(rows) {
  return rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.stat_date)}</td>
          <td><span class="arena-badge">${escapeHtml(row.arena_id)}</span></td>
          <td class="numeric-cell"><span class="rank-badge ${row.config_rank <= 3 ? 'is-top' : ''}">${escapeHtml(row.config_rank)}</span></td>
          <td>${escapeHtml(row.monster_name)}</td>
          <td class="numeric-cell">${metricCell(row.config_cost)}</td>
          <td class="numeric-cell">${metricCell(row.daily_total_cost)}</td>
          <td class="numeric-cell">${escapeHtml(formatRate(row.config_cost_ratio))}</td>
          <td class="numeric-cell">${escapeHtml(formatRate(row.rtp))}</td>
          <td class="numeric-cell">${metricCell(row.attack_user_count)}</td>
          <td class="numeric-cell">${metricCell(row.killed_user_count)}</td>
          <td class="numeric-cell rate-value">${escapeHtml(formatRate(row.user_kill_rate))}</td>
          <td class="numeric-cell">${metricCell(row.attack_monster_count)}</td>
          <td class="numeric-cell">${metricCell(row.killed_monster_count)}</td>
          <td class="numeric-cell rate-value">${escapeHtml(formatRate(row.monster_kill_rate))}</td>
        </tr>
      `,
    )
    .join('');
}

function renderTable(rows) {
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = rows.slice(start, start + state.pageSize);
  elements.tableBody.innerHTML = pageRows.length
    ? tableRowsHtml(pageRows)
    : `
      <tr class="empty-row">
        <td colspan="14">当前筛选范围暂无数据</td>
      </tr>
    `;

  elements.pagination.hidden = rows.length <= state.pageSize;
  if (!elements.pagination.hidden) {
    elements.pageInfo.textContent = `第 ${state.page} / ${pageCount} 页 · 每页 ${state.pageSize} 条`;
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= pageCount;
  }
}

function renderEmptyState(message) {
  elements.metricCost.textContent = '—';
  elements.metricRtp.textContent = '—';
  elements.metricKillRate.textContent = '—';
  elements.yesterdayTop3Label.textContent = '昨日消耗 TOP3';
  elements.yesterdayTop3.innerHTML = `<li class="top3-empty">${escapeHtml(message)}</li>`;
  chartEmpty(elements.trendChart, message);
  chartEmpty(elements.costRatioChart, message);
  chartEmpty(elements.rtpChart, message);
  chartEmpty(elements.userKillChart, message);
  chartEmpty(elements.monsterKillChart, message);
  chartEmpty(elements.topMonsterChart, message);
  elements.topMonsterPeriod.textContent = '—';
  chartEmpty(elements.weeklyMonsterChart, message);
  elements.tableBody.innerHTML = `<tr class="empty-row"><td colspan="14">${escapeHtml(message)}</td></tr>`;
  elements.pagination.hidden = true;
}

function render(payload) {
  setStatus(payload.meta);
  renderMetrics(state.rows, payload.meta);
  renderCharts(state.rows, payload.meta);
  renderTable(state.rows);
}

function redrawCharts() {
  if (!state.initialized) return;
  renderCharts(state.rows, state.meta);
}

elements.monsterTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  setMonsterMenuOpen(elements.monsterMenu.hidden);
});

elements.monsterMenu.addEventListener('click', (event) => {
  event.stopPropagation();
});

elements.monsterOptions.addEventListener('change', syncMonsterSelection);

elements.selectAllMonsters.addEventListener('click', () => {
  for (const input of elements.monsterOptions.querySelectorAll('input[type="checkbox"]')) {
    input.checked = true;
  }
  syncMonsterSelection();
});

elements.clearMonsters.addEventListener('click', () => {
  for (const input of elements.monsterOptions.querySelectorAll('input[type="checkbox"]')) {
    input.checked = false;
  }
  syncMonsterSelection();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setMonsterMenuOpen(false);
    elements.monsterTrigger.focus();
  }
});

elements.filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  setMonsterMenuOpen(false);
  if (!elements.startDate.value || !elements.endDate.value) {
    showError('请选择完整的开始日期和结束日期。');
    return;
  }
  if (elements.startDate.value > elements.endDate.value) {
    showError('开始日期不能晚于结束日期。');
    return;
  }
  fetchData();
});

elements.resetFilters.addEventListener('click', () => {
  clearError();
  if (!state.meta) return;
  elements.startDate.value = state.meta.maxDate
    ? addDays(state.meta.maxDate, -6)
    : '';
  elements.endDate.value = state.meta.maxDate || '';
  elements.arenaId.value = '';
  state.selectedMonsters = new Set();
  renderMonsterOptions(state.meta.availableMonsters);
  fetchData();
});

elements.previousPage.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    renderTable(state.rows);
  }
});

elements.nextPage.addEventListener('click', () => {
  const pageCount = Math.ceil(state.rows.length / state.pageSize);
  if (state.page < pageCount) {
    state.page += 1;
    renderTable(state.rows);
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(redrawCharts, 120);
});

fetchData();
