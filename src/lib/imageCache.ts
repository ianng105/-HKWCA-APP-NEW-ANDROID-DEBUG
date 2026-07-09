/**
 * 共享的簽名 URL 緩存 — 所有畫面共用
 * 每個圖片的簽名 URL 只獲取一次，永久緩存
 */

import { getSubmissionImageUrl } from './api';

// 持久緩存：key = submission_id, value = signed_url
const signedUrls: Record<string, string> = {};

// 正在請求中的 ID（防止重複請求）
const pendingIds = new Set<string>();

// 訂閱者：當緩存更新時通知
type Listener = () => void;
const listeners = new Set<Listener>();

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
 * 解析簽名 URL（批量，每批最多 2 個，循環直到全部完成）
 */
export async function resolveBatch(submissions: Array<{ id: string; file_url: string; storage_path?: string | null }>): Promise<void> {
  const newItems = submissions.filter(item => !signedUrls[item.id] && !pendingIds.has(item.id));
  if (newItems.length === 0) return;

  newItems.forEach(item => pendingIds.add(item.id));

  for (let i = 0; i < newItems.length; i += 2) {
    const batch = newItems.slice(i, i + 2);
    await Promise.all(batch.map(async (item) => {
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
      }
    }));
    notify();
  }
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
