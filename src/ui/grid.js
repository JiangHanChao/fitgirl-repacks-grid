import { CONFIG } from '../config.js';
import { escapeHtml, formatDate } from '../utils.js';

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${y} 年 ${parseInt(m, 10)} 月`;
}

export function createGrid({ container, mediaManager, onVisibleMonthChange }) {
  let currentGames = [];
  let observer = null;
  const loadState = new Map();
  const queue = [];
  let active = 0;

  let currentMonth = null;
  let lastScrollY = 0;
  let rafHandle = null;

  function buildThumbHtml(game) {
    const st = loadState.get(game.link);
    const media = mediaManager.getCachedMedia(game.link) || game.media;

    if (st === 'img-error') {
      return `<div class="card-thumb placeholder placeholder-error">图片加载失败<br>悬浮看预览</div>`;
    }
    if (st === 'blocked') {
      return `<div class="card-thumb placeholder placeholder-blocked">封面被拦截<br>悬浮可重试</div>`;
    }
    if (st === 'no-media') {
      return `<div class="card-thumb placeholder">${escapeHtml((game.titleZh || game.title || '').slice(0, 28))}</div>`;
    }
    if (media && media.imgList && media.imgList.length) {
      return `<img class="card-thumb" src="${escapeHtml(media.imgList[0])}" alt="" loading="lazy" decoding="async" data-cover="img" referrerpolicy="no-referrer">`;
    }
    return `<div class="card-thumb loading" data-cover="loading"></div>`;
  }

  function buildCardHtml(g, index) {
    const favBadge = g.favorite ? `<span class="card-fav-badge">⭐</span>` : '';
    return `
      <div class="card" data-index="${index}" data-link="${escapeHtml(g.link)}">
        ${favBadge}
        ${buildThumbHtml(g)}
        <div class="card-body">
          <div class="card-title">${escapeHtml(g.titleZh || g.title)}</div>
          <div class="card-meta">
            <span>${formatDate(g.date)}</span>
            ${g.size ? `<span>${escapeHtml(g.size)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function buildDividerHtml(ym) {
    return `<div class="month-divider" data-month="${ym}">${monthLabel(ym)}</div>`;
  }

  function showCoverImage(placeholder, imgList, game) {
    if (!imgList || !imgList.length) {
      loadState.set(game.link, 'no-media');
      renderPlaceholder(placeholder, 'no-media', game.title);
      return;
    }
    const list = imgList.slice(0, CONFIG.MAX_IMG_ATTEMPTS);
    let i = 0;
    function tryNext() {
      if (i >= list.length) {
        loadState.set(game.link, 'img-error');
        if (placeholder.isConnected) renderPlaceholder(placeholder, 'img-error', game.title);
        return;
      }
      const img = document.createElement('img');
      img.className = 'card-thumb';
      img.alt = '';
      img.dataset.cover = 'img';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.onload = () => {
        loadState.set(game.link, 'ok');
        if (placeholder.isConnected) placeholder.replaceWith(img);
      };
      img.onerror = () => { i++; tryNext(); };
      img.src = list[i];
    }
    tryNext();
  }

  function renderPlaceholder(el, status, title) {
    if (!el || !el.isConnected) return;
    el.className = 'card-thumb placeholder';
    el.removeAttribute('data-cover');
    if (status === 'blocked') {
      el.classList.add('placeholder-blocked');
      el.innerHTML = '封面被拦截<br>悬浮可重试';
    } else if (status === 'img-error') {
      el.classList.add('placeholder-error');
      el.innerHTML = '图片加载失败<br>悬浮看预览';
    } else {
      el.textContent = (title || '').slice(0, 28);
    }
  }

  async function loadCover(card, game, placeholder) {
    placeholder.className = 'card-thumb loading';
    placeholder.textContent = '';

    const info = await mediaManager.getMediaInfo(game);
    if (!placeholder.isConnected || placeholder.tagName === 'IMG') return;

    if (info.status === 'ok' && info.imgList && info.imgList.length) {
      showCoverImage(placeholder, info.imgList, game);
    } else if (info.status === 'ok' || info.status === 'no-media') {
      loadState.set(game.link, 'no-media');
      renderPlaceholder(placeholder, 'no-media', game.title);
    } else {
      loadState.set(game.link, 'blocked');
      renderPlaceholder(placeholder, 'blocked', game.title);
    }
  }

  function enqueue(card) {
    const game = currentGames[Number(card.dataset.index)];
    if (!game) return;
    queue.push({ card, game });
    processQueue();
  }

  async function processQueue() {
    if (active >= CONFIG.MAX_CONCURRENT_COVERS || queue.length === 0) return;
    const job = queue.shift();
    if (!job.card.isConnected) { processQueue(); return; }
    const placeholder = job.card.querySelector('.card-thumb');
    if (!placeholder || placeholder.tagName === 'IMG') { processQueue(); return; }
    active++;
    try {
      await loadCover(job.card, job.game, placeholder);
    } finally {
      active--;
      processQueue();
    }
  }

  function bindImgError(img) {
    img.onerror = () => {
      const card = img.closest('.card');
      const game = currentGames[Number(card?.dataset.index)];
      if (game) loadState.set(game.link, 'img-error');
      const ph = document.createElement('div');
      ph.className = 'card-thumb placeholder placeholder-error';
      ph.innerHTML = '图片加载失败<br>悬浮看预览';
      if (img.isConnected) img.replaceWith(ph);
    };
  }

  function observeCards(cards) {
    if (!observer) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          observer.unobserve(en.target);
          enqueue(en.target);
        });
      }, { rootMargin: '50px' });
    }
    cards.forEach(card => {
      const thumb = card.querySelector('.card-thumb');
      if (thumb?.dataset.cover === 'loading') observer.observe(card);
      card.querySelectorAll('img[data-cover="img"]').forEach(bindImgError);
    });
  }

  function clearQueue() {
    queue.length = 0;
  }

  function updateVisibleMonth() {
    const dividers = Array.from(container.querySelectorAll('.month-divider'));
    if (!dividers.length) {
      currentMonth = null;
      return;
    }

    const headerEl = document.querySelector('.header-wrap');
    const headerH = headerEl ? headerEl.offsetHeight : 0;
    const vh = window.innerHeight;
    const isScrollingUp = window.scrollY < lastScrollY;

    if (!isScrollingUp) {
      const threshold = headerH + 20;
      let candidate = null;
      for (const div of dividers) {
        if (div.getBoundingClientRect().top <= threshold) {
          candidate = div.dataset.month;
        } else {
          break;
        }
      }
      if (!candidate) candidate = dividers[0].dataset.month;
      currentMonth = candidate;
    } else {
      const threshold = vh - 100;
      let idx = dividers.findIndex(d => d.dataset.month === currentMonth);

      if (idx === -1) {
        const t = headerH + 20;
        let candidate = null;
        for (const div of dividers) {
          if (div.getBoundingClientRect().top <= t) {
            candidate = div.dataset.month;
          } else break;
        }
        if (!candidate) candidate = dividers[0].dataset.month;
        currentMonth = candidate;
      } else {
        while (idx > 0 && dividers[idx].getBoundingClientRect().top > threshold) {
          idx--;
        }
        currentMonth = dividers[idx].dataset.month;
      }
    }

    if (currentMonth && onVisibleMonthChange) onVisibleMonthChange(currentMonth);
    lastScrollY = window.scrollY;
  }

  function scheduleVisibleMonth() {
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      updateVisibleMonth();
    });
  }

  window.addEventListener('scroll', scheduleVisibleMonth, { passive: true });

  function buildHtml(games, startIndex, initialLastMonth) {
    let html = '';
    let lastMonth = initialLastMonth || null;
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      const month = (g.date || '').slice(0, 7);
      if (month && month !== lastMonth) {
        html += buildDividerHtml(month);
        lastMonth = month;
      }
      html += buildCardHtml(g, startIndex + i);
    }
    return { html, lastMonth };
  }

  function render(games) {
    clearQueue();
    currentGames = games.slice();
    if (observer) observer.disconnect();

    if (!games.length) {
      container.innerHTML = '<div class="empty">没有匹配的游戏</div>';
      currentMonth = null;
      lastScrollY = window.scrollY;
      return;
    }

    const { html } = buildHtml(games, 0, null);
    container.innerHTML = html;
    observeCards(Array.from(container.querySelectorAll('.card')));

    currentMonth = null;
    lastScrollY = window.scrollY;
    updateVisibleMonth();
  }

  function append(newGames) {
    if (!newGames.length) return;
    const startIndex = currentGames.length;
    const prevLastMonth = currentGames.length
      ? (currentGames[currentGames.length - 1].date || '').slice(0, 7)
      : null;

    const { html } = buildHtml(newGames, startIndex, prevLastMonth);
    container.insertAdjacentHTML('beforeend', html);
    currentGames = currentGames.concat(newGames);

    const allCards = Array.from(container.querySelectorAll('.card'));
    observeCards(allCards.slice(startIndex));

    lastScrollY = window.scrollY;
    updateVisibleMonth();
  }

  function getGameByIndex(i) {
    return currentGames[i];
  }

  async function retryCover(link) {
    const st = loadState.get(link);
    if (st !== 'img-error' && st !== 'blocked') return;

    const game = currentGames.find(g => g.link === link);
    if (!game) return;

    loadState.delete(link);
    await mediaManager.invalidate(game);

    const card = container.querySelector(`.card[data-link="${cssEscape(link)}"]`);
    if (!card) return;
    const ph = card.querySelector('.card-thumb');
    if (!ph || ph.tagName === 'IMG') return;
    if (ph.dataset.cover === 'loading') return;

    ph.className = 'card-thumb loading';
    ph.dataset.cover = 'loading';
    ph.textContent = '';
    enqueue(card);
  }

  function updateCardTitle(link, titleZh) {
    const card = container.querySelector(`.card[data-link="${cssEscape(link)}"]`);
    if (!card) return;
    const titleEl = card.querySelector('.card-title');
    if (titleEl) titleEl.textContent = titleZh;
  }

  function updateCardFavorite(link, isFav) {
    const card = container.querySelector(`.card[data-link="${cssEscape(link)}"]`);
    if (!card) return;
    let badge = card.querySelector('.card-fav-badge');
    if (isFav && !badge) {
      badge = document.createElement('span');
      badge.className = 'card-fav-badge';
      badge.textContent = '⭐';
      card.insertBefore(badge, card.firstChild);
    } else if (!isFav && badge) {
      badge.remove();
    }
  }

  return { render, append, getGameByIndex, retryCover, updateCardTitle, updateCardFavorite };
}
