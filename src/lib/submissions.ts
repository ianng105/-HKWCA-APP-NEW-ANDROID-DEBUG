import { restFetch, functionsFetch } from './api';

export type Submission = {
  id: string;
  batch_id?: string | null;
  category?: string | null;
  period?: string | null;
  pond_id?: string | null;
  file_url: string;
  submission_timestamp: string;
  latitude?: number | null;
  longitude?: number | null;
  // GPS 位置區分
  exif_latitude?: number | null;
  exif_longitude?: number | null;
  exif_datetime?: string | null; // EXIF 中的拍攝時間（伺服器提取）
  upload_latitude?: number | null;
  upload_longitude?: number | null;
  photo_taken_at?: string | null; // 客戶端傳入的拍攝時間
  payment_status?: string | null;
  payment_amount?: number | null;
  ponds?: { name?: string | null; pond_id?: string | null } | null;
  owners?: { name?: string | null; owner_id?: string | null } | null;
  // 雀鳥相片專用
  owner_uuid?: string | null;
};

// 雀鳥提交記錄類型（bird_submissions 表）
type BirdSubmissionDB = {
  id: string;
  batch_id?: string | null;
  owner_id: string; // 短 ID (如 F001) - 保留向後兼容
  owner_uuid?: string | null; // UUID - 統一使用此欄位查詢
  pond_id?: string | null;
  rainfall_phase?: string | null;
  phase?: number | null;
  file_url: string;
  submission_timestamp: string;
  exif_latitude?: number | null;
  exif_longitude?: number | null;
  exif_datetime?: string | null;
  upload_latitude?: number | null;
  upload_longitude?: number | null;
  photo_taken_at?: string | null;
  payment_status?: string | null;
  payment_amount?: number | null;
  ponds?: { name?: string | null; pond_id?: string | null } | null;
};

export type SubmissionCategory = '魚塘相片' | '雀鳥相片';

export async function fetchSubmissions(options: {
  category: SubmissionCategory;
  periodFilter?: string; // 'all' or period id
  pondFilter?: string; // 'all' or pond uuid
  ownerFilter?: string; // owner id (UUID for fish, short ID for bird)
  startIso?: string;
  endIso?: string;
  limit?: number;
}): Promise<Submission[]> {
  const { category, periodFilter = 'all', pondFilter = 'all', ownerFilter, startIso, endIso, limit = 50 } = options;

  // 雀鳥相片使用 bird_submissions 表
  if (category === '雀鳥相片') {
    let q = `/bird_submissions?select=*,ponds(name,pond_id)&is_deleted=eq.false&order=submission_timestamp.desc&limit=${limit}`;

    // period 在 bird_submissions 中叫 rainfall_phase
    if (periodFilter !== 'all') q += `&rainfall_phase=eq.${encodeURIComponent(periodFilter)}`;
    if (pondFilter !== 'all') q += `&pond_id=eq.${encodeURIComponent(pondFilter)}`;
    // 統一使用 owner_uuid（UUID 格式）
    if (ownerFilter) q += `&owner_uuid=eq.${encodeURIComponent(ownerFilter)}`;
    if (startIso) q += `&submission_timestamp=gte.${encodeURIComponent(startIso)}`;
    if (endIso) q += `&submission_timestamp=lte.${encodeURIComponent(endIso)}`;

    const data = (await restFetch<BirdSubmissionDB[]>(q)) || [];
    // 轉換為統一的 Submission 格式
    return data.map((item) => ({
      ...item,
      category: '雀鳥相片' as const,
      period: item.rainfall_phase,
      owners: { name: item.owner_id, owner_id: item.owner_id },
    })) as Submission[];
  }

  // 魚塘相片使用 submissions 表
  // category 可能是 '魚塘相片', '魚塘', 或 'pond'，使用 OR 條件
  const categoryFilter = category === '魚塘相片'
    ? `or=${encodeURIComponent('(category.eq.魚塘相片,category.eq.魚塘,category.eq.pond)')}`
    : `category=eq.${encodeURIComponent(category)}`;

  let q = `/submissions?select=*,ponds(name,pond_id),owners(name,owner_id)&is_deleted=eq.false&${categoryFilter}&order=submission_timestamp.desc&limit=${limit}`;

  if (periodFilter !== 'all') q += `&period=eq.${encodeURIComponent(periodFilter)}`;
  if (pondFilter !== 'all') q += `&pond_id=eq.${encodeURIComponent(pondFilter)}`;
  if (ownerFilter) q += `&owner_id=eq.${encodeURIComponent(ownerFilter)}`;
  if (startIso) q += `&submission_timestamp=gte.${encodeURIComponent(startIso)}`;
  if (endIso) q += `&submission_timestamp=lte.${encodeURIComponent(endIso)}`;

  return (await restFetch<Submission[]>(q)) || [];
}

export async function fetchSubmissionDetail(options: { id?: string; batchId?: string }): Promise<Submission[]> {
  const { id, batchId } = options;
  if (!id && !batchId) return [];

  let q = `/submissions?select=*,exif_latitude,exif_longitude,exif_datetime,upload_latitude,upload_longitude,photo_taken_at,ponds(name,pond_id),owners(name,owner_id)&is_deleted=eq.false&order=submission_timestamp.asc`;
  if (batchId) q += `&batch_id=eq.${encodeURIComponent(batchId)}`;
  else q += `&id=eq.${encodeURIComponent(id!)}`;

  return (await restFetch<Submission[]>(q)) || [];
}

export async function fetchBirdSubmissionDetail(options: { id?: string; batchId?: string }): Promise<Submission[]> {
  const { id, batchId } = options;
  if (!id && !batchId) return [];

  let q = `/bird_submissions?select=*,ponds(name,pond_id)&is_deleted=eq.false&order=submission_timestamp.asc`;
  if (batchId) q += `&batch_id=eq.${encodeURIComponent(batchId)}`;
  else q += `&id=eq.${encodeURIComponent(id!)}`;

  const data = (await restFetch<BirdSubmissionDB[]>(q)) || [];
  // 轉換為統一的 Submission 格式
  return data.map((item) => ({
    ...item,
    category: '雀鳥相片' as const,
    period: item.rainfall_phase,
    owners: { name: item.owner_id, owner_id: item.owner_id },
  })) as Submission[];
}

export async function softDeleteSubmission(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🗑️ [softDelete] 嘗試刪除照片: ${id}`);

    await restFetch<void>(`/submissions?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { is_deleted: true },
    });

    console.log(`✅ [softDelete] 刪除成功: ${id}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知錯誤';
    console.error(`❌ [softDelete] 刪除失敗: ${id}`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

export async function softDeleteBirdSubmission(id: string, ownerUuid?: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🗑️ [softDeleteBird] 嘗試刪除雀鳥照片 via Edge Function`);
    console.log(`🗑️ [softDeleteBird] ID: ${id}`);

    // 使用 Edge Function 進行軟刪除（繞過 RLS）
    const result = await functionsFetch<{ success: boolean; id?: string; error?: string }>(
      '/soft-delete-bird',
      {
        method: 'POST',
        body: { id },
      }
    );

    if (result.success) {
      console.log(`✅ [softDeleteBird] 刪除成功: ${id}`);
      return { success: true };
    } else {
      const errorMsg = result.error || '刪除失敗';
      console.error(`❌ [softDeleteBird] 刪除失敗: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知錯誤';
    console.error(`❌ [softDeleteBird] 刪除失敗: ${id}`, errorMsg);
    return { success: false, error: errorMsg };
  }
}
