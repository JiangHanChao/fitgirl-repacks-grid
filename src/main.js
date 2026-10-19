import { CONFIG } from './config.js';
import { Store, normalizeState, emptyState } from './state.js';
import * as storage from './storage.js';
import { translate } from './api.js';
import { createMediaManager } from './media.js';
import { createUpdater } from './updater.js';
import { createGrid } from './ui/grid.js';
import { createHover } from './ui/hover.js';
import * as chrome from './ui/chrome.js';

const container = document.getElementById('grid');
const loadMoreContainer = document.getElementById('loadMoreContainer');
const panel = document.getElementById('hoverPanel');
const searchInput = document.getElementById('searchInput');
const btnUpdate = document.getElementById('btnUpdate');
const btnSync = document.getElementById('btnSync');
const btnFavorite = document.getElementById('btnFavorite');
const btnHidden = document.getElementById('btnHidden');
const btnClearFav = document.getElementById('btnClearFav');
const btnExitFav = document.getElementById('btnExitFav');
const btnScrollTop = document.getElementById('btnScrollTop');
const monthNavEl = document.getElementById('monthNav');

const store = new Store();
let grid = null;
let hover = null;
let updater = null;
let mediaManager = null;

let currentRenderLimit = CONFIG.RENDER_LIMIT;
let currentStartMonth = null;
let visibleMonth = null;
let userSelectedYear = null;
let favoriteMode = false;

// ========== 月份相关 ==========

function getLatestMonth() {
  if (!store.data) return null;
  const games = store.data.games.filter(g => !g.hidden);
  if (!games.length) return null;
  return (games[0].date || '').slice(0, 7);
}

function getAvailableYears() {
  if (!store.data) return [];
  const years = new Set();
  store.data.games.forEach(g => {
    if (g.hidden) return;
    if (g.date) years.add(g.date.slice(0, 4));
  });
  return Array.from(years).sort().reverse();
}

function hasGamesInMonth(ym) {
  if (!store.data) return false;
  return store.data.games.some(g => !g.hidden && (g.date || '').startsWith(ym));
}

function filterByMonth(games, startMonth) {
  if (!startMonth) return games;
  return games.filter(g => (g.date || '').slice(0, 7) <= startMonth);
}

function renderMonthNav() {
  if (!store.data) return;
  if (favoriteMode) {
    monthNavEl.innerHTML = '';
    return;
  }
  const years = getAvailableYears();
  const displayYear = userSelectedYear
    || (visibleMonth ? visibleMonth.slice(0, 4) : null)
    || years[0]
    || String(new Date().getFullYear());

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const mStr = String(m).padStart(2, '0');
    const ym = `${displayYear}-${mStr}`;
    months.push({ month: m, ym, hasGames: hasGamesInMonth(ym) });
  }

  chrome.renderMonthNav({
    years,
    displayYear,
    months,
    activeMonth: visibleMonth,
    onSelectMonth,
    onSelectYear
  });
}

function onSelectMonth(ym) {
  if (favoriteMode) return;
  const latestMonth = getLatestMonth();
  const targetStart = (ym === latestMonth) ? null : ym;

  if (targetStart === currentStartMonth) {
    window.scrollTo(0, 0);
    return;
  }

  if (searchInput.value) {
    searchInput.value = '';
  }

  currentStartMonth = targetStart;
  currentRenderLimit = CONFIG.RENDER_LIMIT;
  userSelectedYear = null;
  visibleMonth = ym;

  renderAll();
  renderMonthNav();
  window.scrollTo(0, 0);
}

function onSelectYear(year) {
  userSelectedYear = year;
  renderMonthNav();
}

function onVisibleMonthChange(ym) {
  if (ym === visibleMonth) return;
  visibleMonth = ym;
  userSelectedYear = null;

  if (favoriteMode) return;

  const currentYear = ym.slice(0, 4);
  const select = document.getElementById('monthYearSelect');
  if (select && select.value === currentYear) {
    chrome.setActiveMonth(ym);
  } else {
    renderMonthNav();
  }
}

function ensureValidStartMonth() {
  if (!currentStartMonth) return;
  if (hasGamesInMonth(currentStartMonth)) return;

  const earlierMonths = new Set();
  store.data.games.forEach(g => {
    if (g.hidden) return;
    const m = (g.date || '').slice(0, 7);
    if (m && m < currentStartMonth) earlierMonths.add(m);
  });

  if (earlierMonths.size) {
    const sorted = Array.from(earlierMonths).sort().reverse();
    currentStartMonth = sorted[0];
  } else {
    currentStartMonth = null;
  }
}

// ========== 收藏相关 ==========

function updateFavoriteButton() {
  if (!store.data) return;
  const count = store.data.games.filter(g => g.favorite && !g.hidden).length;
  btnFavorite.textContent = `⭐ 收藏夹 (${count})`;

  if (favoriteMode) {
    btnFavorite.disabled = false;
    btnFavorite.title = '';
  } else if (count === 0) {
    btnFavorite.disabled = true;
    btnFavorite.title = '先收藏几个游戏吧';
  } else {
    btnFavorite.disabled = false;
    btnFavorite.title = '';
  }
}

function enterFavoriteMode() {
  favoriteMode = true;
  searchInput.value = '';
  searchInput.disabled = true;
  searchInput.placeholder = '收藏模式下不支持搜索';

  btnUpdate.hidden = true;
  btnSync.hidden = true;
  btnFavorite.hidden = true;
  btnHidden.hidden = true;
  btnClearFav.hidden = false;
  btnExitFav.hidden = false;

  monthNavEl.style.display = 'none';

  renderAll();
  window.scrollTo(0, 0);
}

function exitFavoriteMode() {
  favoriteMode = false;
  visibleMonth = null;
  userSelectedYear = null;

  searchInput.disabled = false;
  searchInput.placeholder = '搜索游戏标题、标签…';

  btnUpdate.hidden = false;
  btnSync.hidden = false;
  btnFavorite.hidden = false;
  btnHidden.hidden = false;
  btnClearFav.hidden = true;
  btnExitFav.hidden = true;

  monthNavEl.style.display = '';

  renderAll();
  renderMonthNav();
  window.scrollTo(0, 0);
}

async function toggleFavorite(link) {
  if (!store.data) return;
  const game = store.data.games.find(g => g.link === link);
  if (!game) return;

  const wasFav = game.favorite;

  await store.updateSilent((data) => {
    const g = data.games.find(x => x.link === link);
    if (!g) return;
    if (g.favorite) {
      g.favorite = false;
    } else {
      g.favorite = true;
      g.hidden = false;
    }
  });

  const updated = store.data.games.find(x => x.link === link);
  grid.updateCardFavorite(link, updated.favorite);
  hover.updateFavoriteState(link, updated.favorite);
  updateFavoriteButton();

  if (favoriteMode && wasFav && !updated.favorite) {
    const remaining = store.data.games.filter(g => g.favorite && !g.hidden).length;
    if (remaining === 0) {
      exitFavoriteMode();
    } else {
      renderAll();
    }
  }
}

// ========== 数据 / 渲染 ==========

function computeDisplay(data) {
  if (favoriteMode) {
    const favs = data.games.filter(g => g.favorite && !g.hidden);
    return { games: favs, total: favs.length, hasMore: false, tooMany: false };
  }

  const q = searchInput.value.trim().toLowerCase();
  let visible = data.games.filter(g => !g.hidden);

  if (q) {
    const matched = visible.filter(g => {
      const hay = [g.title, g.titleZh, ...(g.tags || []), g.size, g.date]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });

    if (matched.length > CONFIG.RENDER_LIMIT) {
      return { games: [], total: matched.length, hasMore: false, tooMany: true };
    }
    return { games: matched, total: matched.length, hasMore: false, tooMany: false };
  }

  visible = filterByMonth(visible, currentStartMonth);
  return {
    games: visible.slice(0, currentRenderLimit),
    total: visible.length,
    hasMore: visible.length > currentRenderLimit,
    tooMany: false
  };
}

function renderAll() {
  if (!store.data) return;
  const display = computeDisplay(store.data);

  const statusOpts = favoriteMode
    ? { favoriteMode: true, favoriteCount: display.total }
    : {};

  if (display.tooMany) {
    container.innerHTML = `
      <div class="empty">
        找到 ${display.total} 个结果<br>
        请添加更具体的关键词
      </div>
    `;
    loadMoreContainer.innerHTML = '';
    chrome.updateStatusBar(store.data, statusOpts);
    return;
  }

  grid.render(display.games);
  updateLoadMore(display.total, display.hasMore);
  chrome.updateStatusBar(store.data, statusOpts);
}

function updateLoadMore(total, hasMore) {
  if (!hasMore) {
    loadMoreContainer.innerHTML = '';
    return;
  }
  const remaining = total - currentRenderLimit;
  loadMoreContainer.innerHTML = `
    <button class="btn-load-more" id="btnLoadMore">
      加载更多（还剩 ${remaining} 个）
    </button>
  `;
  document.getElementById('btnLoadMore').addEventListener('click', loadMore);
}

function loadMore() {
  if (!store.data) return;
  if (favoriteMode) return;
  if (searchInput.value.trim()) return;

  const oldLimit = currentRenderLimit;
  currentRenderLimit += CONFIG.RENDER_LIMIT;

  let visible = store.data.games.filter(g => !g.hidden);
  visible = filterByMonth(visible, currentStartMonth);
  const newGames = visible.slice(oldLimit, currentRenderLimit);

  if (!newGames.length) {
    currentRenderLimit = oldLimit;
    return;
  }

  grid.append(newGames);
  updateLoadMore(visible.length, visible.length > currentRenderLimit);
}

// ========== 初始化 ==========

function initModules() {
  mediaManager = createMediaManager({ store });

  grid = createGrid({
    container,
    mediaManager,
    onVisibleMonthChange
  });

  hover = createHover({
    panel,
    store,
    mediaManager,
    getGameByIndex: grid.getGameByIndex,
    translate,
    onToggleFavorite: toggleFavorite,
    onHideGame: async (link) => {
      await store.update((data) => {
        const g = data.games.find(x => x.link === link);
        if (g) {
          g.hidden = true;
          g.favorite = false;
        }
      });
    }
  });

  hover.attach(container, grid.retryCover);

  updater = createUpdater({ store, chrome });

  document.addEventListener('card-title-updated', (e) => {
    const { link, titleZh } = e.detail;
    grid.updateCardTitle(link, titleZh);
  });

  store.subscribe(() => {
    hover.hide();
    ensureValidStartMonth();
    renderMonthNav();
    renderAll();
    updateFavoriteButton();
  });

  let searchTimer = null;
  let isComposing = false;

  function triggerSearch() {
    if (!store.data) return;
    if (favoriteMode) return;
    renderAll();
  }

  searchInput.addEventListener('compositionstart', () => { isComposing = true; });
  searchInput.addEventListener('compositionend', () => { isComposing = false; });

  searchInput.addEventListener('input', () => {
    if (isComposing) return;
    if (!store.data) return;
    if (favoriteMode) return;
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) {
      searchTimer = null;
      triggerSearch();
      return;
    }
    searchTimer = setTimeout(() => {
      searchTimer = null;
      triggerSearch();
    }, 150);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.isComposing) return;
    if (favoriteMode) return;
    e.preventDefault();
    clearTimeout(searchTimer);
    searchTimer = null;
    triggerSearch();
  });

  btnUpdate.addEventListener('click', () => {
    if (!store.data) return;
    updater.checkForUpdates({ silent: false });
  });

  btnSync.addEventListener('click', () => {
    if (!store.data) return;
    updater.syncMoreHistory();
  });

  btnFavorite.addEventListener('click', () => {
    if (!store.data) return;
    const count = store.data.games.filter(g => g.favorite && !g.hidden).length;
    if (count === 0) return;
    enterFavoriteMode();
  });

  btnExitFav.addEventListener('click', exitFavoriteMode);

  btnClearFav.addEventListener('click', async () => {
    if (!store.data) return;
    const count = store.data.games.filter(g => g.favorite).length;
    if (count === 0) return;
    if (!confirm(`确定清空全部 ${count} 个收藏吗？此操作不可撤销。`)) return;

    exitFavoriteMode();
    await store.update((data) => {
      data.games.forEach(g => { if (g.favorite) g.favorite = false; });
    });
    chrome.setProgress('✅ 已清空全部收藏', 'success');
  });

  btnHidden.addEventListener('click', () => {
    if (!store.data) return;
    chrome.showHiddenModal(store.data, async () => {
      await store.update((data) => {
        data.games.forEach(g => { if (g.hidden) g.hidden = false; });
      });
      chrome.hideHiddenModal();
      chrome.setProgress('✅ 已恢复全部隐藏', 'success');
    });
  });

  chrome.bindHiddenModalClose();

  window.addEventListener('scroll', () => {
    if (window.scrollY > CONFIG.SCROLL_TOP_THRESHOLD) {
      btnScrollTop.hidden = false;
    } else {
      btnScrollTop.hidden = true;
    }
  }, { passive: true });

  btnScrollTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function shouldAutoCheck() {
  if (!store.data.lastCheck) return true;
  const hours = (Date.now() - new Date(store.data.lastCheck).getTime()) / 3600000;
  return hours > CONFIG.AUTO_CHECK_HOURS;
}

async function enterApp(handle, loadedState) {
  currentRenderLimit = CONFIG.RENDER_LIMIT;
  currentStartMonth = null;
  visibleMonth = null;
  userSelectedYear = null;
  favoriteMode = false;

  await store.attach(handle, loadedState);
  chrome.hideOverlay();
  updateFavoriteButton();

  if (!store.data.games.length) {
    setTimeout(() => updater.checkForUpdates({ silent: true }), 300);
    return;
  }
  if (shouldAutoCheck()) {
    setTimeout(() => updater.checkForUpdates({ silent: true }), 2000);
  }
}

async function handleBind() {
  if (!window.showOpenFilePicker) {
    chrome.showUnsupportedOverlay();
    return;
  }

  let handle = null;

  try {
    const [h] = await window.showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      excludeAcceptAllOption: false,
      multiple: false
    });
    handle = h;
  } catch (e) {
    if (e.name !== 'AbortError') {
      alert('打开文件失败：' + e.message);
      return;
    }
  }

  if (!handle) {
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: 'games.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      });
    } catch (e) {
      if (e.name === 'AbortError') return;
      alert('新建文件失败：' + e.message);
      return;
    }
  }

  const granted = await storage.ensurePermission(handle, 'readwrite');
  if (!granted) {
    alert('未获得文件读写权限，请重试。');
    return;
  }

  chrome.showLoadingOverlay('正在读取文件…');
  let loadedState = emptyState();
  try {
    const text = await storage.readFileText(handle);
    if (text.trim()) {
      try {
        loadedState = normalizeState(JSON.parse(text));
      } catch {
        if (!confirm('该文件不是有效 JSON，是否将其覆盖为新的数据文件？')) {
          chrome.showBindOverlay(handleBind);
          return;
        }
      }
    }
    await storage.writeFileText(handle, JSON.stringify(loadedState, null, 2));
  } catch (e) {
    alert('读取文件失败：' + e.message);
    chrome.showBindOverlay(handleBind);
    return;
  }

  await storage.saveHandleToIDB(handle);
  await enterApp(handle, loadedState);
}

async function handleContinue(handle) {
  chrome.showLoadingOverlay('正在恢复文件权限…');
  const granted = await storage.ensurePermission(handle, 'readwrite');
  if (!granted) {
    alert('权限被拒绝。请重新选择文件。');
    await storage.clearHandleFromIDB();
    chrome.showBindOverlay(handleBind);
    return;
  }
  try {
    const text = await storage.readFileText(handle);
    let loadedState = emptyState();
    if (text.trim()) {
      loadedState = normalizeState(JSON.parse(text));
    }
    await storage.writeFileText(handle, JSON.stringify(loadedState, null, 2));
    await enterApp(handle, loadedState);
  } catch (e) {
    alert('读取文件失败：' + e.message + '\n请重新选择文件。');
    await storage.clearHandleFromIDB();
    chrome.showBindOverlay(handleBind);
  }
}

async function init() {
  if (!window.showOpenFilePicker) {
    chrome.showUnsupportedOverlay();
    return;
  }

  initModules();

  const savedHandle = await storage.loadHandleFromIDB();
  if (savedHandle) {
    chrome.showContinueOverlay(savedHandle, {
      onContinue: () => handleContinue(savedHandle),
      onChange: async () => {
        await storage.clearHandleFromIDB();
        chrome.showBindOverlay(handleBind);
      }
    });
  } else {
    chrome.showBindOverlay(handleBind);
  }
}

init();
