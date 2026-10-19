import { CONFIG } from './config.js';
import { decodeHtml, sleep } from './utils.js';

const translationCache = new Map();
const TRANSLATE_MAX_RETRIES = 3;
const TRANSLATE_RETRY_BASE = 500;

/**
 * 拉取文章列表
 * 参数：
 *   before  - 早于该时间的最新 100 篇（同步历史）
 *   after   - 晚于该时间的最老 100 篇（同步最新，需配合 order='asc'）
 *   order   - 'asc' | 'desc'，默认 desc
 *   page    - 页码，一般与 after/before 不混用
 *   per_page - 每页数量，默认 100
 */
export async function fetchList(options = {}) {
  const { before, after, order, page, per_page = 100 } = options;

  let url = `${CONFIG.API_BASE}/posts?per_page=${per_page}&_fields=id,title,link,date,slug`;
  if (before) url += `&before=${encodeURIComponent(before)}`;
  if (after) url += `&after=${encodeURIComponent(after)}`;
  if (order) url += `&order=${encodeURIComponent(order)}`;
  if (page) url += `&page=${page}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.map(p => ({
    slug: p.slug,
    title: decodeHtml(p.title.rendered.replace(/<[^>]+>/g, '')).trim(),
    link: p.link,
    date: p.date
  }));
}

export async function fetchContent(slug) {
  const url = `${CONFIG.API_BASE}/posts?slug=${encodeURIComponent(slug)}&_fields=content`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.[0]?.content?.rendered || '';
}

export async function safeFetchContent(slug) {
  await sleep(CONFIG.FETCH_CONTENT_DELAY);
  return fetchContent(slug);
}

export function extractMeta(html) {
  if (!html) return { size: '', tags: [] };
  const text = decodeHtml(html.replace(/<[^>]+>/g, ' '));
  const sizeMatch = text.match(/Repack Size:\s*([^\n]{1,120})/i);
  const size = sizeMatch ? sizeMatch[1].replace(/\s+/g, ' ').trim() : '';
  const tagsMatch = text.match(/Genres\/Tags:\s*([^\n]{1,200})/i);
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean).slice(0, 6)
    : [];
  return { size, tags };
}

export function isNonGame(post) {
  return CONFIG.NON_GAME_KEYWORDS.some(k => post.title.includes(k));
}

export async function translate(text) {
  if (!text || !text.trim()) return { text: '', ok: true };
  const key = text.trim();

  const cached = translationCache.get(key);
  if (cached !== undefined) return { text: cached, ok: true };

  const url = `${CONFIG.TRANSLATE_API}?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;

  for (let attempt = 0; attempt <= TRANSLATE_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);

      if (res.status === 429 || res.status === 403) {
        console.warn(`[translate] 限流 (${res.status})，降级为原文:`, key.slice(0, 60));
        return { text: key, ok: false };
      }

      if (!res.ok) {
        if (attempt < TRANSLATE_MAX_RETRIES) {
          await sleep(TRANSLATE_RETRY_BASE * (attempt + 1));
          continue;
        }
        console.warn(`[translate] 重试耗尽 (${res.status})，降级为原文:`, key.slice(0, 60));
        return { text: key, ok: false };
      }

      const data = await res.json();
      const translated = Array.isArray(data?.[0])
        ? data[0].map(s => s?.[0] || '').join('').trim()
        : '';

      if (!translated) return { text: key, ok: false };
      if (translated === key) return { text: key, ok: true };

      translationCache.set(key, translated);
      return { text: translated, ok: true };
    } catch (e) {
      if (attempt < TRANSLATE_MAX_RETRIES) {
        await sleep(TRANSLATE_RETRY_BASE * (attempt + 1));
        continue;
      }
      console.warn('[translate] 网络异常，降级为原文:', key.slice(0, 60), e.message);
      return { text: key, ok: false };
    }
  }

  return { text: key, ok: false };
}
