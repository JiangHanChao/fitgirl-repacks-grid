import { CONFIG } from './config.js';
import { fetchList, safeFetchContent, extractMeta, isNonGame, translate } from './api.js';
import { extractMediaFromHtml } from './media.js';
import { sleep, formatDate } from './utils.js';

export function createUpdater({ store, chrome }) {
  let isUpdating = false;

  async function processEntries(entries, progressPrefix) {
    let added = 0, updated = 0, failures = 0;
    let consecutiveFailures = 0;

    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      const text = `${progressPrefix} ${i + 1}/${entries.length}：${item.post.title.slice(0, 40)}…`;
      chrome.setProgress(text);
      chrome.setBadge(`${progressPrefix} ${i + 1}/${entries.length}`);

      let meta = { size: '', tags: [] };
      let media;
      try {
        const content = await safeFetchContent(item.post.slug);
        meta = extractMeta(content);
        media = extractMediaFromHtml(content);
      } catch (e) {
        console.warn('内容拉取失败:', item.post.title, e.message);
        if (item.type === 'update' && item.old?.media !== undefined) {
          media = item.old.media;
        }
      }

      let titleZh;
      if (item.type === 'update' && item.old?.titleZh) {
        titleZh = item.old.titleZh;
      } else {
        const tr = await translate(item.post.title);
        titleZh = tr.text;
        if (!tr.ok) {
          failures++;
          consecutiveFailures++;
          if (consecutiveFailures >= 2) {
            await sleep(Math.min(consecutiveFailures * 500, 3000));
          }
        } else {
          consecutiveFailures = 0;
        }
        await sleep(CONFIG.TRANSLATE_DELAY);
      }

      const newGame = {
        title: item.post.title,
        titleZh,
        link: item.post.link,
        date: item.post.date,
        size: meta.size,
        tags: meta.tags,
        hidden: item.old?.hidden || false,
        favorite: item.old?.favorite || false,
        media
      };

      if (item.type === 'new') {
        store.data.games.push(newGame);
        added++;
      } else {
        const idx = store.data.games.findIndex(g => g.link === item.post.link);
        if (idx >= 0) store.data.games[idx] = newGame;
        updated++;
      }

      if ((i + 1) % 5 === 0) await store.save();
    }

    return { added, updated, failures };
  }

  async function checkForUpdates({ silent = false } = {}) {
    if (isUpdating || !store.data) return;
    isUpdating = true;
    chrome.setBusy(true, 'checking');
    chrome.setBadge('🔄 同步中');

    let totalAdded = 0, totalUpdated = 0, totalFailures = 0;
    let reachedLatest = false;
    let batchesDone = 0;

    try {
      if (!store.data.lastUpdate) {
        chrome.setProgress('正在拉取最新帖子…');
        const posts = await fetchList();
        if (!posts.length) {
          store.data.lastUpdate = new Date().toISOString();
          store.data.lastCheck = new Date().toISOString();
          await store.save();
          chrome.setProgress('✅ 已是最新', 'success');
          return;
        }

        const filtered = posts.filter(p => !isNonGame(p));
        const existing = new Map(store.data.games.map(g => [g.link, g]));
        const entries = [];
        for (const p of filtered) {
          const old = existing.get(p.link);
          if (!old) entries.push({ post: p, type: 'new' });
          else if (old.title !== p.title) entries.push({ post: p, type: 'update', old });
        }

        if (entries.length) {
          const stats = await processEntries(entries, '同步中');
          totalAdded += stats.added;
          totalUpdated += stats.updated;
          totalFailures += stats.failures;
        }

        store.data.lastUpdate = posts[0].date;
        store.data.games.sort((a, b) => new Date(b.date) - new Date(a.date));
        store.data.lastCheck = new Date().toISOString();
        await store.save();
        store._notify();

        const failSuffix = totalFailures > 0 ? `，${totalFailures} 条翻译失败` : '';
        chrome.setProgress(
          totalAdded + totalUpdated > 0
            ? `✅ 已同步到最新：新增 ${totalAdded}，更新 ${totalUpdated}${failSuffix}`
            : '✅ 已是最新',
          'success'
        );
        return;
      }

      let lastFetchedDate = store.data.lastUpdate;

      for (let batch = 1; batch <= CONFIG.MAX_FORWARD_BATCHES; batch++) {
        batchesDone = batch;
        chrome.setProgress(`拉取第 ${batch}/${CONFIG.MAX_FORWARD_BATCHES} 批…`);
        chrome.setBadge(`🔄 第 ${batch}/${CONFIG.MAX_FORWARD_BATCHES} 批`);

        const posts = await fetchList({ after: lastFetchedDate, order: 'asc' });

        if (!posts.length) {
          reachedLatest = true;
          break;
        }

        const filtered = posts.filter(p => !isNonGame(p));
        const existing = new Map(store.data.games.map(g => [g.link, g]));
        const entries = [];
        for (const p of filtered) {
          const old = existing.get(p.link);
          if (!old) entries.push({ post: p, type: 'new' });
          else if (old.title !== p.title) entries.push({ post: p, type: 'update', old });
        }

        if (entries.length) {
          const stats = await processEntries(entries, `第${batch}批`);
          totalAdded += stats.added;
          totalUpdated += stats.updated;
          totalFailures += stats.failures;
        }

        lastFetchedDate = posts[posts.length - 1].date;
        store.data.lastUpdate = lastFetchedDate;
        store.data.games.sort((a, b) => new Date(b.date) - new Date(a.date));
        await store.save();
        store._notify();

        if (posts.length < 100) {
          reachedLatest = true;
          break;
        }
      }

      store.data.lastCheck = new Date().toISOString();
      await store.save();

      const failSuffix = totalFailures > 0 ? `，${totalFailures} 条翻译失败` : '';

      if (reachedLatest) {
        chrome.setProgress(
          totalAdded + totalUpdated > 0
            ? `✅ 已同步到最新：新增 ${totalAdded}，更新 ${totalUpdated}${failSuffix}`
            : '✅ 已是最新',
          'success'
        );
      } else {
        chrome.setProgress(
          `⚠️ 已处理 ${batchesDone} 批，可能还有更多新帖子，请稍后再次点击"同步最新"${failSuffix}`,
          'info'
        );
      }
    } catch (e) {
      chrome.setProgress(`❌ 同步失败：${e.message}`, 'error');
      if (!silent) console.error(e);
    } finally {
      isUpdating = false;
      chrome.setBusy(false);
    }
  }

  async function syncMoreHistory() {
    if (isUpdating || !store.data) return;

    const before = store.data.oldestSyncedDate || new Date().toISOString();

    if (!confirm(
      `当前历史已同步至：${store.data.oldestSyncedDate ? formatDate(store.data.oldestSyncedDate) : '尚未同步'}\n` +
      `本次将拉取此前的最新 100 篇（约 90 个新游戏，预计 45 秒）`
    )) return;

    isUpdating = true;
    chrome.setBusy(true, 'syncing');
    chrome.setBadge('📥 拉取中');

    try {
      chrome.setProgress('正在拉取历史数据…');
      const posts = await fetchList({ before });

      if (!posts.length) {
        chrome.setProgress('✅ 已无更多历史数据（已到站点最早内容）', 'info');
        return;
      }

      const oldestInBatch = posts[posts.length - 1].date;

      const filtered = posts.filter(p => !isNonGame(p));
      const existing = new Set(store.data.games.map(g => g.link));
      const entries = filtered
        .filter(p => !existing.has(p.link))
        .map(p => ({ post: p, type: 'new' }));

      if (!entries.length) {
        store.data.oldestSyncedDate = oldestInBatch;
        await store.save();
        store._notify();
        const isLastBatch = posts.length < 100;
        if (isLastBatch) {
          chrome.setProgress(`✅ 已无更多历史数据（已同步至 ${formatDate(oldestInBatch)}）`, 'info');
        } else {
          chrome.setProgress(
            `ℹ️ 本批 100 篇无新增，历史推进至 ${formatDate(oldestInBatch)}，可再点一次继续`,
            'info'
          );
        }
        return;
      }

      const stats = await processEntries(entries, '同步中');

      store.data.games.sort((a, b) => new Date(b.date) - new Date(a.date));
      store.data.oldestSyncedDate = oldestInBatch;
      await store.save();
      store._notify();

      const isLastBatch = posts.length < 100;
      const failSuffix = stats.failures > 0 ? `，${stats.failures} 条翻译失败（下次悬浮会重试）` : '';
      const lastSuffix = isLastBatch ? '（已到达站点最早内容）' : '';
      chrome.setProgress(
        `✅ 同步完成：新增 ${stats.added} 个游戏，历史推进至 ${formatDate(oldestInBatch)}${lastSuffix}${failSuffix}`,
        'success'
      );
    } catch (e) {
      chrome.setProgress(`❌ 同步失败：${e.message}`, 'error');
    } finally {
      isUpdating = false;
      chrome.setBusy(false);
    }
  }

  return { checkForUpdates, syncMoreHistory };
}
