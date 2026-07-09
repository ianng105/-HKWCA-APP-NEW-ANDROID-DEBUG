/**
 * API 調用函數
 * 
 * 請在下方配置您的後端 API URL
 */

import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  getOnTokenExpired,
  clearTokens
} from './authToken';
import * as FileSystem from 'expo-file-system/legacy';

// ==========================================
// Lovable Cloud 配置
// ==========================================
const API_BASE_URL = 'https://tbcocbxpspekvqozfycu.supabase.co';

// Lovable Cloud - Anon Key
// 專案：tbcocbxpspekvqozfycu
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiY29jYnhwc3Bla3Zxb3pmeWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MjM3ODMsImV4cCI6MjA4Mzk5OTc4M30.2ndCqUmoR1eeyV1-uwVTB4WDcLz__-fDssZ7j-jPNMk';

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * 刷新 access token
 */
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    console.log('❌ [API] 沒有 refresh_token，無法刷新');
    return false;
  }

  try {
    console.log('🔄 [API] 嘗試刷新 token...');
    const response = await fetch(`${API_BASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      console.log('❌ [API] 刷新 token 失敗:', response.status);
      return false;
    }

    const data = await response.json();
    if (data.access_token) {
      setAccessToken(data.access_token);
      if (data.refresh_token) {
        setRefreshToken(data.refresh_token);
      }
      console.log('✅ [API] Token 刷新成功');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ [API] 刷新 token 出錯:', error);
    return false;
  }
}

/**
 * 處理 401 錯誤，嘗試刷新 token 或登出
 */
async function handleAuthError(errorText: string): Promise<boolean> {
  // 檢查是否是 JWT 過期
  if (errorText.includes('JWT expired') || errorText.includes('PGRST303')) {
    console.log('🔄 [API] JWT 過期，嘗試刷新...');
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return true; // 刷新成功，可以重試
    }
    
    // 刷新失敗，觸發登出
    console.log('❌ [API] Token 刷新失敗，需要重新登入');
    const onExpired = getOnTokenExpired();
    if (onExpired) {
      onExpired();
    }
  }
  return false;
}



/**
 * 調用 REST API
 */
export async function restFetch<T>(
  pathAndQuery: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> },
  retryCount = 0
): Promise<T> {
  const url = `${API_BASE_URL}/rest/v1${pathAndQuery}`;
  
  const accessToken = getAccessToken();
  console.log(`🔍 [API] getAccessToken() 返回: ${accessToken ? accessToken.substring(0, 20) + '...' : 'null'}`);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Supabase 需要 apikey 頭部（項目級別）
  if (API_KEY) {
    headers['apikey'] = API_KEY;
  }
  
  // 如果用戶已登入，使用 access_token 進行認證（用於 RLS）
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
    console.log(`🔑 [API] ✅ 使用用戶 access_token 認證`);
  } else {
    console.log(`🔑 [API] ❌ 未登入，使用匿名認證（可能導致 401）`);
  }
  
  // 合併自定義 headers
  if (options?.headers) {
    Object.assign(headers, options.headers);
  }

  console.log(`🌐 [API] REST 請求: ${options?.method || 'GET'} ${url}`);
  console.log(`🌐 [API] 請求頭:`, { 
    apikey: headers['apikey'] ? '已設置' : '未設置', 
    Authorization: headers['Authorization'] ? headers['Authorization'].substring(0, 30) + '...' : '未設置' 
  });

  const res = await fetch(url, {
    method: options?.method || 'GET',
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  
  // 處理 401 錯誤
  if (res.status === 401 && retryCount === 0) {
    const shouldRetry = await handleAuthError(text);
    if (shouldRetry) {
      console.log('🔄 [API] Token 已刷新，重試請求...');
      return restFetch(pathAndQuery, options, retryCount + 1);
    }
  }
  
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}: ${text}`, res.status);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

/**
 * 調用 Edge Functions
 */
export async function functionsFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal },
  retryCount = 0
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}/functions/v1${normalizedPath}`;

  const accessToken = getAccessToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Supabase 需要 apikey 頭部
  if (API_KEY) {
    headers['apikey'] = API_KEY;
  }
  
  // 如果用戶已登入，使用 access_token；否則使用 API_KEY
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  } else if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  
  // 合併自定義 headers
  if (options?.headers) {
    Object.assign(headers, options.headers);
  }

  const res = await fetch(url, {
    method: options?.method || 'POST',
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });

  // 處理 401 錯誤
  if (res.status === 401 && retryCount === 0) {
    const errorText = await res.text();
    const shouldRetry = await handleAuthError(errorText);
    if (shouldRetry) {
      console.log('🔄 [API] Token 已刷新，重試請求...');
      return functionsFetch(path, options, retryCount + 1);
    }
    // 如果刷新失敗，拋出錯誤
    throw new ApiError(`HTTP 401: ${errorText}`, 401);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || data?.message || `HTTP ${res.status}`, res.status);
  }

  return data as T;
}

/**
 * 簡化的 API 調用（別名到 functionsFetch）
 */
export async function apiFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> }
): Promise<T> {
  return functionsFetch<T>(path, options);
}

// 導出配置供其他模塊使用
export { API_BASE_URL, API_KEY };

/**
 * 獲取上傳 URL（直接 POST 到 Storage）
 */
export interface SignedUploadUrlResponse {
  success: boolean;
  method?: string;       // POST
  upload_url?: string;   // 直接 upload URL
  storage_path?: string;
  signed_url?: string;   // 向後兼容（舊版簽名 URL）
  token?: string;
  error?: string;
}

export async function getSignedUploadUrl(
  ownerId: string,
  filename: string,
  type: 'pond' | 'bird' = 'pond',
  signal?: AbortSignal,
): Promise<SignedUploadUrlResponse> {
  try {
    const result = await functionsFetch<SignedUploadUrlResponse>('/get-upload-url', {
      method: 'POST',
      body: {
        owner_id: ownerId,
        filename,
        type,
      },
      signal,
    });
    console.log(`📋 [get-upload-url] response: method=${result.method}, storage_path=${result.storage_path}`);
    return result;
  } catch (error) {
    console.error('❌ [API] 獲取上傳 URL 失敗:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 直接 POST 上傳文件到 Supabase Storage（使用 Edge Function 回傳的 URL + 用戶 JWT）
 */
export async function uploadFileToStorage(
  uploadUrl: string,
  fileUri: string,
  contentType: string = 'image/jpeg',
  signal?: AbortSignal,
): Promise<{ success: boolean; error?: string }> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      return { success: false, error: 'File not found' };
    }

    const fileSize = 'size' in fileInfo ? fileInfo.size : 0;
    console.log(`📁 [Upload] 文件大小: ${fileSize} bytes`);
    console.log(`📁 [Upload] 上傳 URL: ${uploadUrl}`);

    // 使用 POST 直接上傳到 Storage（需要 Authorization + apikey headers）
    const accessToken = getAccessToken();
    const uploadHeaders: Record<string, string> = {
      'Content-Type': contentType,
    };
    if (API_KEY) {
      uploadHeaders['apikey'] = API_KEY;
    }
    if (accessToken) {
      uploadHeaders['Authorization'] = `Bearer ${accessToken}`;
      console.log(`📁 [Upload] 使用 JWT token + apikey 認證 (POST)`);
    } else {
      console.log(`📁 [Upload] 無 JWT token，使用 apikey 上傳`);
    }

    const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: uploadHeaders,
    });

    console.log(`📁 [Upload] 回應狀態: ${result.status}`);
    console.log(`📁 [Upload] 回應內容: ${result.body}`);

    if (result.status >= 200 && result.status < 300) {
      console.log('✅ [Upload] 文件上傳成功');
      return { success: true };
    } else {
      console.error('❌ [Upload] 文件上傳失敗:', result.status, result.body);
      return { success: false, error: `Upload failed: ${result.status} - ${result.body}` };
    }
  } catch (error) {
    console.error('❌ [Upload] 上傳異常:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * 獲取 submission 圖片的簽名 URL（透過 Edge Function 驗證擁有權後生成短期簽名 URL）
 */
export interface SubmissionImageUrlResponse {
  success: boolean;
  signed_url?: string;
  error?: string;
}

export async function getSubmissionImageUrl(
  storagePath: string,
  expiresIn: number = 300,
): Promise<string | null> {
  try {
    const result = await functionsFetch<SubmissionImageUrlResponse>('/get-submission-image-url', {
      method: 'POST',
      body: { storage_path: storagePath, expires_in: expiresIn },
    });
    if (result.success && result.signed_url) {
      console.log(`🖼️ [Image] 簽名 URL 獲取成功:`);
      console.log(`  storage_path: ${storagePath}`);
      console.log(`  signed_url: ${result.signed_url}`);
      return result.signed_url;
    }
    console.warn(`⚠️ [Image] 簽名 URL 獲取失敗: ${result.error}`);
    return null;
  } catch (error) {
    console.error('❌ [Image] 獲取簽名 URL 異常:', error);
    return null;
  }
}
