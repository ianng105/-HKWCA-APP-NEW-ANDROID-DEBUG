/**
 * 共享的簽名 URL 緩存 — 所有畫面共用
 * 每個圖片的簽名 URL 只獲取一次，永久緩存
 *
 * 效能優化：
 * - 批次並行數從 2 提高到 10，大幅減少總等待時間
 * - 取得 URL 後立即透過 Image.prefetch 預加載圖片到原生緩存
 * - 每批完成後立即通知 UI 重繪，圖片逐步顯示而非全部等待
 */

import { Image } from 'react-native';
import { getSubmissionImageUrl } from './api';

// 持久緩存：key = submission_id, value = signed_url
const signedUrls: Record<string, string> = {};

// 正在請求中的 ID（防止重複請求）
const pendingIds = new Set<string>();

// 已觸發 prefetch 的 URL（避免重複 prefetch）
const prefetchedUrls = new Set<string>();

// 訂閱者：當緩存更新時通知
type Listener = () => void;
const listeners = new Set<Listener>();

// 並行批次大小（提高以減少等待輪數）
const BATCH_SIZE = 10;
// prefetch 自身的並行上限（避免同時發太多網路請求）
const PREFETCH_CONCURRENCY = 6;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach(fn => fn());
}

export function getSignedUrl(id: string): string | null {
  return signedUrls[id] || null;
}

export function hasSignedUrl(id: string): boolean {
  return id in signedUrls;
}

export function isPending(id: string): boolean {
  return pendingIds.has(id);
}

/**
 * 取消所有待處理的請求（不清除已緩存的 URL）
 * 用於導航到詳情頁時，只保留選中圖片的加載
 */
export function cancelAllPending(): void {
  pendingIds.clear();
}

/**
 * 使用 Image.prefetch 預加載圖片到 React Native 原生圖片緩存
 * 這樣後續 <Image source={{ uri }}> 可以直接從緩存讀取，無需重新下載
 */
async function prefetchImages(urls: string[]): Promise<void> {
  const toFetch = urls.filter(u => u && !prefetchedUrls.has(u));
  if (toFetch.length === 0) return;

  // 標記為已 prefetch（無論成功與否都不重試，避免浪費）
  toFetch.forEach(u => prefetchedUrls.add(u));

  // 分批 prefetch，控制並行數
  for (let i = 0; i < toFetch.length; i += PREFETCH_CONCURRENCY) {
    const batch = toFetch.slice(i, i + PREFETCH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(url => Image.prefetch(url))
    );
    const loaded = results.filter(r => r.status === 'fulfilled' && r.value).length;
    if (loaded > 0) {
      console.log(`🖼️ [Cache] prefetch 完成: ${loaded}/${batch.length}`);
    }
  }
}

/**
 * 解析簽名 URL（批量並行，每批 BATCH_SIZE 個）
 * 每批完成後立即通知 UI 並觸發 prefetch
 */
export async function resolveBatch(submissions: Array<{ id: string; file_url: string; storage_path?: string | null }>): Promise<void> {
  const newItems = submissions.filter(item => !signedUrls[item.id] && !pendingIds.has(item.id));
  if (newItems.length === 0) return;

  newItems.forEach(item => pendingIds.add(item.id));

  console.log(`🖼️ [Cache] 開始解析 ${newItems.length} 個簽名 URL（每批 ${BATCH_SIZE} 個）`);

  for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
    const batch = newItems.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (item) => {
      let storagePath = item.storage_path;
      if (!storagePath && item.file_url) {
        const match = item.file_url.match(/\/submissions\/(.+)$/);
        if (match) storagePath = match[1];
      }
      if (storagePath) {
        const signedUrl = await getSubmissionImageUrl(storagePath);
        if (signedUrl) {
          signedUrls[item.id] = signedUrl;
        }
        return signedUrl;
      }
      return null;
    }));
    // 每批完成立即通知 UI（圖片逐步出現）
    notify();
    // 背景 prefetch，不阻塞下一批 URL 解析
    const validUrls = results.filter((u): u is string => u !== null);
    if (validUrls.length > 0) {
      prefetchImages(validUrls).catch(() => {});
    }
  }

  console.log(`🖼️ [Cache] 全部簽名 URL 解析完成`);
}

/**
 * 優先加載單一圖片（用於詳情頁 — 中止批量，先載這個）
 * 返回 signed_url 或 null
 */
export async function resolveOne(item: { id: string; file_url: string; storage_path?: string | null }): Promise<string | null> {
  // 已有緩存 → 直接返回
  if (signedUrls[item.id]) return signedUrls[item.id];

  // 正在請求中 → 等待完成
  if (pendingIds.has(item.id)) {
    return new Promise((resolve) => {
      const check = () => {
        if (signedUrls[item.id]) {
          resolve(signedUrls[item.id]);
        } else if (!pendingIds.has(item.id)) {
          resolve(null);
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  // 開始請求
  pendingIds.add(item.id);
  let storagePath = item.storage_path;
  if (!storagePath && item.file_url) {
    const match = item.file_url.match(/\/submissions\/(.+)$/);
    if (match) storagePath = match[1];
  }
  if (storagePath) {
    const signedUrl = await getSubmissionImageUrl(storagePath);
    if (signedUrl) {
      signedUrls[item.id] = signedUrl;
      notify();
      return signedUrl;
    }
  }
  pendingIds.delete(item.id);
  return null;
}
