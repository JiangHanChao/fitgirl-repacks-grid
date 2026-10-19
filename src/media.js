import { CONFIG } from './config.js';
import { fetchContent } from './api.js';
import { extractSlug, normalizeUrl, isNoiseUrl } from './utils.js';

// 纯函数：从 HTML 提取视频 / GIF / 所有静态图
export function extractMediaFromHtml(html) {
  const out = { videoUrl: null, gifUrl: null, imgList: [] };
  if (!html) return out;

  const scope = getScreenshotsScope(html);
  const target = scope || html;

  const vm = target.match(/<video[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+\.webm)["']/i);
  if (vm) out.videoUrl = normalizeUrl(vm[1]);

  const gm = target.match(/<img[^>]+src=["']([^"']+\.gif(?:\?[^"']*)?)["']/i);
  if (gm) {
    const u = normalizeUrl(gm[1]);
    if (u && !isNoiseUrl(u)) out.gifUrl = u;
  }

  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(target)) !== null) {
    const u = normalizeUrl(m[1]);
    if (u && !isNoiseUrl(u) && !out.imgList.includes(u)) out.imgList.push(u);
  }

  return out;
}

function getScreenshotsScope(html) {
  const m = html.match(/<h3[^>]*>\s*Screenshots[^<]*<\/h3>/i);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = html.slice(start);
  const next = rest.search(/<h3[^>]*>/i);
  return next >= 0 ? rest.slice(0, next) : rest;
}

function hasContent(media) {
  if (!media) return false;
  return !!(media.videoUrl || media.gifUrl || (media.imgList && media.imgList.length));
}

export function createMediaManager({ store }) {
  const memCache = new Map(); // link -> {videoUrl, gifUrl, imgList}
  const queue = [];
  let active = 0;

  async function fetchFor(game) {
    const slug = extractSlug(game.link);
    if (!slug) return { videoUrl: null, gifUrl: null, imgList: [] };
    try {
      const html = await fetchContent(slug);
      return extractMediaFromHtml(html);
    } catch {
      return null; // 失败不缓存，下次再试
    }
  }

  async function processQueue() {
    if (active >= CONFIG.MAX_CONCURRENT_COVERS || queue.length === 0) return;
    const job = queue.shift();
    active++;
    try {
      const media = await fetchFor(job.game);
      if (media) {
        // 写回 game 并持久化
        await store.updateSilent(() => {
          job.game.media = media;
        });
        memCache.set(job.game.link, media);
        job.resolve({
          status: hasContent(media) ? 'ok' : 'no-media',
          ...media
        });
      } else {
        job.resolve({ status: 'blocked' });
      }
    } catch (e) {
      job.resolve({ status: 'blocked', detail: e.message });
    } finally {
      active--;
      processQueue();
    }
  }

  function getCachedMedia(link) {
    return memCache.get(link) || null;
  }

  function getMediaInfo(game) {
    // 1. game.media 已持久化（含"已提取但无媒体"的情况）
    if (game.media !== undefined) {
      return Promise.resolve({
        status: hasContent(game.media) ? 'ok' : 'no-media',
        ...game.media
      });
    }
    // 2. 内存缓存
    if (memCache.has(game.link)) {
      const m = memCache.get(game.link);
      return Promise.resolve({
        status: hasContent(m) ? 'ok' : 'no-media',
        ...m
      });
    }
    // 3. 请求
    return new Promise((resolve) => {
      queue.push({ game, resolve });
      processQueue();
    });
  }

  // 强制失效：清内存缓存 + 把 game.media 置回 undefined，让下次 getMediaInfo 重新请求
  async function invalidate(game) {
    memCache.delete(game.link);
    await store.updateSilent(() => {
      game.media = undefined;
    });
  }

  return { getMediaInfo, getCachedMedia, invalidate };
}
