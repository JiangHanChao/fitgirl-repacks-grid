export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function decodeHtml(str) {
  const t = document.createElement('textarea');
  t.innerHTML = str;
  return t.value;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  }[s]));
}

export function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  } catch { return d; }
}

export function formatDateTime(d) {
  if (!d) return '从未';
  try {
    return new Date(d).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return d; }
}

export function isNoiseUrl(url) {
  return /s\.w\.org\/images\/core\/emoji/i.test(url);
}

export function normalizeUrl(url) {
  if (!url) return null;
  url = url.trim();
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = 'https://fitgirl-repacks.site' + url;
  else if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

export function extractSlug(link) {
  if (!link) return '';
  try {
    const u = new URL(link);
    return u.pathname.replace(/\/$/, '').split('/').pop() || '';
  } catch {
    return link.replace(/\/$/, '').split('/').pop() || '';
  }
}
