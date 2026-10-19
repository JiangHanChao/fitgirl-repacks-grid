import { CONFIG } from './config.js';
import { writeFileText } from './storage.js';

export function emptyState() {
  return {
    version: CONFIG.STATE_VERSION,
    lastCheck: null,
    lastUpdate: null,
    oldestSyncedDate: null,
    games: []
  };
}

export function normalizeState(parsed) {
  let base;

  if (Array.isArray(parsed)) {
    base = {
      version: CONFIG.STATE_VERSION,
      lastCheck: null,
      lastUpdate: null,
      oldestSyncedDate: null,
      games: parsed.map(migrateGame)
    };
  } else if (parsed && typeof parsed === 'object') {
    base = {
      version: CONFIG.STATE_VERSION,
      lastCheck: parsed.lastCheck || null,
      lastUpdate: parsed.lastUpdate || null,
      oldestSyncedDate: parsed.oldestSyncedDate || null,
      games: Array.isArray(parsed.games) ? parsed.games.map(migrateGame) : []
    };
  } else {
    return emptyState();
  }

  if (base.games.length > 0) {
    const dates = base.games.map(g => g.date).filter(Boolean).sort();
    if (dates.length) {
      if (!base.oldestSyncedDate) base.oldestSyncedDate = dates[0];
      if (!base.lastUpdate) base.lastUpdate = dates[dates.length - 1];
    }
  }

  return base;
}

function migrateGame(g) {
  return {
    title: g.title || '',
    titleZh: g.titleZh || '',
    link: g.link || '',
    date: g.date || '',
    size: g.size || '',
    tags: Array.isArray(g.tags) ? g.tags : [],
    hidden: !!g.hidden,
    favorite: !!g.favorite,
    media: g.media && typeof g.media === 'object' ? {
      videoUrl: g.media.videoUrl || null,
      gifUrl: g.media.gifUrl || null,
      imgList: Array.isArray(g.media.imgList) ? g.media.imgList : []
    } : undefined
  };
}

export class Store {
  constructor() {
    this.data = null;
    this.handle = null;
    this._listeners = new Set();
  }

  async attach(handle, data) {
    this.handle = handle;
    this.data = data;
    await this.save();
    this._notify();
  }

  async save() {
    if (!this.handle) return false;
    try {
      await writeFileText(this.handle, JSON.stringify(this.data, null, 2));
      return true;
    } catch (e) {
      console.error('保存失败:', e);
      return false;
    }
  }

  async update(mutator) {
    if (!this.data) return;
    mutator(this.data);
    await this.save();
    this._notify();
  }

  async updateSilent(mutator) {
    if (!this.data) return;
    mutator(this.data);
    await this.save();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach(fn => {
      try { fn(this.data); } catch (e) { console.error(e); }
    });
  }
}
