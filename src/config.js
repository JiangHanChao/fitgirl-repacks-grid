export const CONFIG = Object.freeze({
  // UI
  HOVER_DELAY: 1000,
  // 网络节流
  FETCH_CONTENT_DELAY: 150,
  TRANSLATE_DELAY: 300,
  // 自动更新
  AUTO_CHECK_HOURS: 12,
  // 封面并发控制
  MAX_FORWARD_BATCHES: 3,
  MAX_CONCURRENT_COVERS: 3,
  MAX_IMG_ATTEMPTS: 6,
  RETRY_COOLDOWN_BLOCKED: 5000,
  RETRY_COOLDOWN_IMG_ERROR: 30000,
  // 过滤规则
  NON_GAME_KEYWORDS: ['Updates Digest', 'Upcoming Repacks'],
  // API
  API_BASE: 'https://fitgirl-repacks.site/wp-json/wp/v2',
  TRANSLATE_API: 'https://translate.googleapis.com/translate_a/single',
  // IndexedDB
  DB_NAME: 'fitgirl-grid-handle',
  DB_VERSION: 1,
  DB_STORE: 'handles',
  DB_HANDLE_KEY: 'gamesFile',
  STATE_VERSION: 2,
  // 浏览模式一次渲染的数量，搜索模式不受此限制
  RENDER_LIMIT: 280,
  // 回顶按钮显示的滚动阈值
  SCROLL_TOP_THRESHOLD: 400
});
