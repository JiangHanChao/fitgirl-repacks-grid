import { escapeHtml, formatDateTime, formatDate } from '../utils.js';

const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const progressbar = document.getElementById('progressbar');
const badge = document.getElementById('badge');
const btnUpdate = document.getElementById('btnUpdate');
const btnSync = document.getElementById('btnSync');
const statsEl = document.getElementById('stats');
const syncInfoEl = document.getElementById('syncInfo');
const monthNavEl = document.getElementById('monthNav');
const hiddenModal = document.getElementById('hiddenModal');
const hiddenCount = document.getElementById('hiddenCount');
const btnUnhideAll = document.getElementById('btnUnhideAll');

let progressTimer = null;
let monthNavCallbacks = { onSelectMonth: null, onSelectYear: null };

export function setProgress(text, type = 'info') {
  clearTimeout(progressTimer);
  progressbar.hidden = false;
  progressbar.textContent = text;
  progressbar.className = 'progressbar ' + type;
  if (type === 'success' || type === 'info') {
    progressTimer = setTimeout(() => { progressbar.hidden = true; }, 5000);
  }
}

export function setBadge(text) {
  if (!text) { badge.hidden = true; return; }
  badge.hidden = false;
  badge.textContent = text;
}

export function setBusy(busy, mode = '') {
  btnUpdate.disabled = busy;
  btnSync.disabled = busy;
  if (busy) {
    if (mode === 'checking') btnUpdate.textContent = '⏳ 同步中…';
    if (mode === 'syncing') btnSync.textContent = '⏳ 同步中…';
  } else {
    btnUpdate.textContent = '🔄 同步最新';
    btnSync.textContent = '📥 同步历史';
    setBadge(null);
  }
}

export function updateStatusBar(data, options = {}) {
  if (options.favoriteMode) {
    statsEl.innerHTML = `⭐ 收藏夹 · <strong>${options.favoriteCount}</strong> 个`;
    syncInfoEl.textContent = '点悬浮面板可取消收藏';
    return;
  }

  const visible = data.games.filter(g => !g.hidden).length;
  const hidden = data.games.filter(g => g.hidden).length;
  statsEl.innerHTML =
    `共 <strong>${visible}</strong> 款` +
    (hidden ? `（隐藏 ${hidden}）` : '') +
    ` · 最后更新：<strong>${formatDateTime(data.lastUpdate)}</strong>`;
  syncInfoEl.textContent = data.oldestSyncedDate
    ? `历史同步至：${formatDate(data.oldestSyncedDate)}`
    : '历史尚未同步';
}

export function renderMonthNav({ years, displayYear, months, activeMonth, onSelectMonth, onSelectYear }) {
  monthNavCallbacks.onSelectMonth = onSelectMonth;
  monthNavCallbacks.onSelectYear = onSelectYear;

  if (!years.length) {
    monthNavEl.innerHTML = '';
    return;
  }

  const yearOptions = years.map(y =>
    `<option value="${y}" ${y === displayYear ? 'selected' : ''}>${y}</option>`
  ).join('');

  const monthButtons = months.map(({ month, ym, hasGames }) => {
    const active = ym === activeMonth ? ' active' : '';
    const disabled = hasGames ? '' : ' disabled';
    return `<button class="month-pill${active}" data-month="${ym}"${disabled}>${month}月</button>`;
  }).join('');

  monthNavEl.innerHTML = `
    <select class="month-year-select" id="monthYearSelect">${yearOptions}</select>
    ${monthButtons}
  `;

  document.getElementById('monthYearSelect').onchange = (e) => {
    if (monthNavCallbacks.onSelectYear) monthNavCallbacks.onSelectYear(e.target.value);
  };

  monthNavEl.querySelectorAll('.month-pill:not([disabled])').forEach(btn => {
    btn.onclick = () => {
      if (monthNavCallbacks.onSelectMonth) monthNavCallbacks.onSelectMonth(btn.dataset.month);
    };
  });
}

export function setActiveMonth(ym) {
  monthNavEl.querySelectorAll('.month-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.month === ym);
  });
}

export function showBindOverlay(onBind) {
  overlayContent.innerHTML = `
    <h2>🎮 FitGirl 游戏网格</h2>
    <p>首次使用，请绑定数据文件。<br>
    如果已有 games.json，在“打开”对话框中选择它；<br>
    如果还没有，在打开对话框中直接点“取消”，会引导你新建。</p>
    <button class="btn-lg" id="btnBind">📂 绑定 games.json</button>
  `;
  overlay.hidden = false;
  document.getElementById('btnBind').addEventListener('click', onBind);
}

export function showContinueOverlay(handle, { onContinue, onChange }) {
  overlayContent.innerHTML = `
    <h2>🎮 继续使用</h2>
    <p>上次使用的数据文件：</p>
    <div class="file-info">${escapeHtml(handle.name)}</div>
    <div class="actions">
      <button class="btn-lg" id="btnContinue">✅ 继续使用</button>
      <button class="btn-secondary" id="btnChange">📂 更换文件</button>
    </div>
  `;
  overlay.hidden = false;
  document.getElementById('btnContinue').addEventListener('click', onContinue);
  document.getElementById('btnChange').addEventListener('click', onChange);
}

export function showLoadingOverlay(text) {
  overlayContent.innerHTML = `
    <h2>${escapeHtml(text)}</h2>
    <p style="margin-bottom:0;">请稍候…</p>
  `;
  overlay.hidden = false;
}

export function showUnsupportedOverlay() {
  overlayContent.innerHTML = `
    <h2>⚠️ 浏览器不支持</h2>
    <p>本页面使用 File System Access API 直接读写本地 games.json。<br>
    请使用 Chrome 86+ 或 Edge 86+ 打开。</p>
  `;
  overlay.hidden = false;
}

export function hideOverlay() { overlay.hidden = true; }

export function showHiddenModal(data, onUnhideAll) {
  const count = data.games.filter(g => g.hidden).length;
  hiddenCount.textContent = `当前隐藏：${count} 个游戏`;
  btnUnhideAll.disabled = count === 0;
  btnUnhideAll.onclick = onUnhideAll;
  hiddenModal.hidden = false;
}

export function hideHiddenModal() { hiddenModal.hidden = true; }

export function bindHiddenModalClose() {
  const btnClose = document.getElementById('btnCloseHidden');
  btnClose.addEventListener('click', () => { hiddenModal.hidden = true; });
  hiddenModal.addEventListener('click', (e) => {
    if (e.target === hiddenModal) hiddenModal.hidden = true;
  });
}
