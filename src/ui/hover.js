import { CONFIG } from '../config.js';
import { escapeHtml, formatDate } from '../utils.js';

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
}

export function createHover({ panel, store, mediaManager, getGameByIndex, translate, onHideGame, onToggleFavorite }) {
  let showTimer = null;
  let hideTimer = null;
  let currentCard = null;
  let requestId = 0;

  function findGame(link) {
    return store.data.games.find(g => g.link === link);
  }

  function buildMediaPlaceholder(game) {
    const media = game.media;
    if (!media) return '';
    if (!media.videoUrl && !media.gifUrl && !(media.imgList?.length)) return '';
    return `<div class="hp-media-placeholder" data-game-link="${escapeHtml(game.link)}"></div>`;
  }

  function fillMedia() {
    const ph = panel.querySelector('.hp-media-placeholder');
    if (!ph) return;
    const link = ph.dataset.gameLink;
    const game = findGame(link);
    if (!game || !game.media) { ph.remove(); return; }
    const media = game.media;

    if (media.videoUrl) {
      const video = document.createElement('video');
      video.className = 'hp-media';
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.setAttribute('playsinline', '');
      video.preload = 'metadata';
      video.referrerPolicy = 'no-referrer';
      const source = document.createElement('source');
      source.src = media.videoUrl;
      source.type = 'video/webm';
      video.appendChild(source);
      if (ph.isConnected) ph.replaceWith(video);
      return;
    }

    const candidates = [];
    if (media.gifUrl) candidates.push(media.gifUrl);
    if (media.imgList) candidates.push(...media.imgList.slice(0, CONFIG.MAX_IMG_ATTEMPTS));
    if (!candidates.length) { ph.remove(); return; }

    let i = 0;
    function tryNext() {
      if (i >= candidates.length) { if (ph.isConnected) ph.remove(); return; }
      const img = document.createElement('img');
      img.className = 'hp-media';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => { if (ph.isConnected) ph.replaceWith(img); };
      img.onerror = () => { i++; tryNext(); };
      img.src = candidates[i];
    }
    tryNext();
  }

  function buildContentHtml(game, title, size, tags) {
    const favBtn = game.favorite
      ? `<button class="hp-fav-btn active" data-link="${escapeHtml(game.link)}">⭐ 已收藏</button>`
      : `<button class="hp-fav-btn" data-link="${escapeHtml(game.link)}">⭐ 收藏</button>`;

    return `
      <div class="hp-title">${escapeHtml(title)}</div>
      <div class="hp-row"><b>发布日期：</b>${formatDate(game.date)}</div>
      ${size ? `<div class="hp-row"><b>重打包大小：</b>${escapeHtml(size)}</div>` : ''}
      ${tags && tags.length
        ? `<div class="hp-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
        : ''}
      <div class="hp-actions">
        <a class="hp-link" href="${escapeHtml(game.link)}" target="_blank" rel="noopener">打开页面 ↗</a>
        ${favBtn}
        <button class="hp-hide-btn" data-link="${escapeHtml(game.link)}">🚫 隐藏</button>
      </div>
    `;
  }

  function renderContent(game, title, size, tags, isUpdate = false) {
    if (isUpdate) {
      const content = panel.querySelector('.hp-content');
      if (content) content.innerHTML = buildContentHtml(game, title, size, tags);
      return;
    }
    panel.innerHTML =
      `${buildMediaPlaceholder(game)}<div class="hp-content">${buildContentHtml(game, title, size, tags)}</div>`;
    fillMedia();
  }

  async function show(cardEl, game) {
    const reqId = ++requestId;
    const displayTitle = game.titleZh || game.title;

    renderContent(game, displayTitle, game.size, game.tags, false);
    panel.classList.add('visible');
    position(cardEl);

    if (game.media === undefined) {
      mediaManager.getMediaInfo(game).then(() => {
        if (reqId !== requestId) return;
        if (!panel.classList.contains('visible')) return;
        if (currentCard !== cardEl) return;
        renderContent(game, game.titleZh || game.title, game.size, game.tags, false);
        position(cardEl);
      }).catch(() => {});
    }

    if (game.titleZh) return;

    const result = await translate(game.title);
    if (reqId !== requestId) return;
    if (!panel.classList.contains('visible')) return;
    if (currentCard !== cardEl) return;

    if (!result.ok) return;

    game.titleZh = result.text || game.title;
    await store.updateSilent(() => {});
    document.dispatchEvent(new CustomEvent('card-title-updated', {
      detail: { link: game.link, titleZh: game.titleZh }
    }));
    renderContent(game, game.titleZh, game.size, game.tags, true);
    position(cardEl);
  }

  function position(cardEl) {
    const rect = cardEl.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const gap = 10;
    let left = rect.right + gap;
    let top = rect.top;
    if (left + panelRect.width > window.innerWidth - 12) left = rect.left - panelRect.width - gap;
    if (left < 12) { left = Math.max(12, rect.left); top = rect.bottom + gap; }
    if (top + panelRect.height > window.innerHeight - 12) top = window.innerHeight - panelRect.height - 12;
    top = Math.max(12, top);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  function hide() {
    clearTimeout(showTimer); showTimer = null;
    clearTimeout(hideTimer); hideTimer = null;
    panel.classList.remove('visible');
    const v = panel.querySelector('video');
    if (v) v.pause();
    currentCard = null;
    requestId++;
  }

  function updateFavoriteState(link, isFav) {
    const btn = panel.querySelector(`.hp-fav-btn[data-link="${cssEscape(link)}"]`);
    if (!btn) return;
    if (isFav) {
      btn.classList.add('active');
      btn.textContent = '⭐ 已收藏';
    } else {
      btn.classList.remove('active');
      btn.textContent = '⭐ 收藏';
    }
  }

  function attach(container, retryCover) {
    container.addEventListener('mouseover', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      clearTimeout(hideTimer); hideTimer = null;
      if (card === currentCard && panel.classList.contains('visible')) return;
      if (card === currentCard && showTimer) return;

      currentCard = card;
      const game = getGameByIndex(Number(card.dataset.index));
      if (!game) return;

      if (retryCover) retryCover(game.link);

      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        showTimer = null;
        if (currentCard === card) show(card, game);
      }, CONFIG.HOVER_DELAY);
    });

    container.addEventListener('mouseout', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      if (e.relatedTarget && panel.contains(e.relatedTarget)) return;
      if (e.relatedTarget && card.contains(e.relatedTarget)) return;
      clearTimeout(showTimer); showTimer = null;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { hideTimer = null; hide(); }, 150);
    });

    panel.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer); hideTimer = null;
    });

    panel.addEventListener('mouseleave', () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => hide(), 100);
    });

    panel.addEventListener('click', (e) => {
      const favBtn = e.target.closest('.hp-fav-btn');
      if (favBtn) {
        e.preventDefault();
        if (onToggleFavorite) onToggleFavorite(favBtn.dataset.link);
        return;
      }
      const hideBtn = e.target.closest('.hp-hide-btn');
      if (hideBtn) {
        e.preventDefault();
        onHideGame(hideBtn.dataset.link);
        hide();
      }
    });

    window.addEventListener('scroll', hide, { passive: true });
  }

  return { attach, hide, updateFavoriteState };
}
