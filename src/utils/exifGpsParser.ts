/**
 * EXIF GPS 解析器 - 多重驗證確保準確性
 * 
 * 驗證策略（按準確度排序）：
 * 1. ImagePicker 返回的原生 exif 對象（快，但可能不完整）
 * 2. 直接讀取文件解析 EXIF（準確，但受限於 Android 10+ 權限）
 * 3. MediaLibrary 系統媒體庫（iOS 效果好，Android 有限制）
 * 
 * ⚠️ 重要：沒有任何方法能 100% 保證讀取到所有照片的 GPS
 * 原因：
 * - Android 10+ Scoped Storage 限制直接文件訪問
 * - 某些手機會自動剝離 EXIF GPS
 * - 用戶拍照時可能沒開啟位置權限
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

export interface GPSInfo {
  latitude: number;
  longitude: number;
  source: 'exif-native' | 'exif-parsed' | 'media-library' | 'manual';
  accuracy?: 'high' | 'medium' | 'low';
  datetime?: string | null; // EXIF 拍攝時間
}

/**
 * 檢查 GPS 坐標是否有效
 * 排除 0.000, 0.000 或非常接近 0 的無效坐標
 */
export function isValidGPS(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  if (latitude == null || longitude == null) return false;
  if (isNaN(latitude) || isNaN(longitude)) return false;
  
  // 檢查是否為 0.000, 0.000 或非常接近 0（約 11 米範圍內）
  const MIN_VALID_COORD = 0.0001;
  if (Math.abs(latitude) < MIN_VALID_COORD && Math.abs(longitude) < MIN_VALID_COORD) {
    return false;
  }
  
  // 檢查坐標範圍
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return false;
  }
  
  return true;
}

export interface GPSCheckResult {
  hasGPS: boolean;
  gps?: GPSInfo;
  datetime?: string | null; // EXIF 拍攝時間
  reason?: 'not-found' | 'no-permission' | 'parse-error' | 'file-access-error' | 'stripped-by-system';
  checkedMethods: string[];
}

/**
 * 從 ImagePicker 返回的 exif 對象提取 GPS
 * 這是最快的方法，但可能不完整（某些手機會限制）
 */
export function extractGpsFromExifObject(
  exif: Record<string, any> | null | undefined
): GPSInfo | null {
  if (!exif) return null;

  try {
    // 提取 EXIF 時間
    const datetime = extractExifDatetime(exif);

    // iOS 格式: { '{GPS}': { Latitude, Longitude, LatitudeRef, LongitudeRef } }
    const gps = exif['{GPS}'] || exif.GPS;
    if (gps) {
      const lat = gps.Latitude ?? gps.latitude;
      const lng = gps.Longitude ?? gps.longitude;
      const latRef = gps.LatitudeRef ?? gps.latitudeRef;
      const lngRef = gps.LongitudeRef ?? gps.longitudeRef;

      if (typeof lat === 'number' && typeof lng === 'number') {
        let latitude = lat;
        let longitude = lng;
        if (latRef === 'S' || latRef === 's') latitude = -latitude;
        if (lngRef === 'W' || lngRef === 'w') longitude = -longitude;

        // 檢查 GPS 是否有效（排除 0.000, 0.000）
        if (!isValidGPS(latitude, longitude)) {
          console.log('⚠️ iOS GPS 格式無效 (0.000,0.000):', latitude, longitude);
          return null;
        }

        return {
          latitude,
          longitude,
          source: 'exif-native',
          accuracy: 'high',
          datetime
        };
      }
    }

    // Android 直接格式
    if (typeof exif.latitude === 'number' && typeof exif.longitude === 'number') {
      const latitude = exif.latitude;
      const longitude = exif.longitude;

      // 檢查 GPS 是否有效（排除 0.000, 0.000）
      if (!isValidGPS(latitude, longitude)) {
        console.log('⚠️ Android GPS 格式無效 (0.000,0.000):', latitude, longitude);
        return null;
      }

      return {
        latitude,
        longitude,
        source: 'exif-native',
        accuracy: 'high',
        datetime
      };
    }

    // DMS 格式
    if (exif.GPSLatitude && Array.isArray(exif.GPSLatitude)) {
      const dmsToDecimal = (dms: number[], ref: string): number => {
        if (dms.length < 3) return NaN;
        let decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;
        if (ref === 'S' || ref === 'W' || ref === 's' || ref === 'w') decimal = -decimal;
        return decimal;
      };

      const latRef = exif.GPSLatitudeRef ?? exif.latitudeRef ?? 'N';
      const lngRef = exif.GPSLongitudeRef ?? exif.longitudeRef ?? 'E';
      const latitude = dmsToDecimal(exif.GPSLatitude, latRef);
      const longitude = exif.GPSLongitude && Array.isArray(exif.GPSLongitude)
        ? dmsToDecimal(exif.GPSLongitude, lngRef)
        : NaN;

      if (!isNaN(latitude) && !isNaN(longitude)) {
        // 檢查 GPS 是否有效（排除 0.000, 0.000）
        if (!isValidGPS(latitude, longitude)) {
          console.log('⚠️ DMS GPS 格式無效 (0.000,0.000):', latitude, longitude);
          return null;
        }

        return {
          latitude,
          longitude,
          source: 'exif-native',
          accuracy: 'high',
          datetime
        };
      }
    }
  } catch (error) {
    console.log('解析 EXIF 對象失敗:', error);
  }

  return null;
}

/**
 * 從 EXIF 對象提取拍攝時間
 * 支援多種格式：DateTimeOriginal, CreateDate, ModifyDate, {TIFF}, GPS DateStamp
 */
export function extractExifDatetime(
  exif: Record<string, any> | null | undefined
): string | null {
  if (!exif) return null;

  try {
    // 優先順序：DateTimeOriginal > CreateDate > ModifyDate > {TIFF}.DateTime

    // 1. DateTimeOriginal (最準確的拍攝時間)
    if (exif.DateTimeOriginal) {
      return normalizeExifDatetime(exif.DateTimeOriginal);
    }
    if (exif['{Exif}']?.DateTimeOriginal) {
      return normalizeExifDatetime(exif['{Exif}'].DateTimeOriginal);
    }

    // 2. CreateDate
    if (exif.CreateDate) {
      return normalizeExifDatetime(exif.CreateDate);
    }
    if (exif['{Exif}']?.CreateDate) {
      return normalizeExifDatetime(exif['{Exif}'].CreateDate);
    }

    // 3. iOS TIFF 格式
    if (exif['{TIFF}']?.DateTime) {
      return normalizeExifDatetime(exif['{TIFF}'].DateTime);
    }

    // 4. ModifyDate (最後修改時間，可能不準確)
    if (exif.ModifyDate) {
      return normalizeExifDatetime(exif.ModifyDate);
    }

    // 5. GPS DateStamp + TimeStamp (如果有 GPS 時間)
    if (exif.GPSDateStamp && exif.GPSTimeStamp) {
      return normalizeGpsDatetime(exif.GPSDateStamp, exif.GPSTimeStamp);
    }

    // 6. Android 格式
    if (exif.datetime) {
      return normalizeExifDatetime(exif.datetime);
    }
    if (exif.date_time_original) {
      return normalizeExifDatetime(exif.date_time_original);
    }

  } catch (error) {
    console.log('提取 EXIF 時間失敗:', error);
  }

  return null;
}

/**
 * 標準化 EXIF 日期時間格式為 ISO 8601
 * 支援格式: "2024:01:15 14:30:00" 或 "2024/01/15 14:30:00"
 */
function normalizeExifDatetime(datetime: string): string | null {
  if (!datetime || typeof datetime !== 'string') return null;

  try {
    // EXIF 格式通常是 "2024:01:15 14:30:00"
    // 轉換為 ISO 8601 格式 "2024-01-15T14:30:00"
    let normalized = datetime
      .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') // 日期部分的 : 改為 -
      .replace(' ', 'T'); // 空格改為 T

    // 驗證是否為有效日期
    const date = new Date(normalized);
    if (isNaN(date.getTime())) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

/**
 * 組合 GPS DateStamp 和 TimeStamp 為 ISO 8601
 * GPSDateStamp: "2024:01:15"
 * GPSTimeStamp: [14, 30, 0] (時分秒數組)
 */
function normalizeGpsDatetime(dateStamp: string, timeStamp: number[]): string | null {
  try {
    // 日期格式 "2024:01:15" -> "2024-01-15"
    const datePart = dateStamp.replace(/:/g, '-');

    // 時間數組 [14, 30, 0] -> "14:30:00"
    const timePart = timeStamp
      .map(n => String(Math.floor(n)).padStart(2, '0'))
      .join(':');

    const isoString = `${datePart}T${timePart}`;

    // 驗證
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return null;
    }

    return isoString;
  } catch {
    return null;
  }
}

/**
 * 從文件 URI 直接解析 EXIF GPS
 * 
 * ⚠️ Expo Go 限制：
 * - content:// URI (Android 10+) 可能無法直接讀取
 * - 如果失敗，會返回 null 並記錄原因
 */
export async function parseGpsFromFile(
  uri: string
): Promise<{ gps: GPSInfo | null; datetime?: string; error?: string }> {
  const methods: string[] = [];

  try {
    // 方法 1: 嘗試只讀取前 64KB（EXIF 通常在這裡）
    methods.push('partial-read');
    const partialResult = await tryReadPartialFile(uri);
    if (partialResult) {
      return {
        gps: { latitude: partialResult.latitude, longitude: partialResult.longitude, source: 'exif-parsed', accuracy: 'high' },
        datetime: partialResult.datetime,
      };
    }

    // 方法 2: 嘗試讀取整個文件（如果文件不大）
    methods.push('full-read');
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists && 'size' in fileInfo && fileInfo.size < 5 * 1024 * 1024) { // < 5MB
      const fullResult = await tryReadFullFile(uri);
      if (fullResult) {
        return {
          gps: { latitude: fullResult.latitude, longitude: fullResult.longitude, source: 'exif-parsed', accuracy: 'high' },
          datetime: fullResult.datetime,
        };
      }
    }

    return {
      gps: null,
      error: 'File does not contain GPS or cannot be parsed'
    };
  } catch (error: any) {
    console.log('文件讀取失敗:', error);
    return {
      gps: null,
      error: error.message || 'File access error'
    };
  }
}

/**
 * 嘗試只讀取文件前 64KB 解析 EXIF
 */
async function tryReadPartialFile(uri: string): Promise<{ latitude: number; longitude: number; datetime?: string } | null> {
  try {
    const header = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 65536,
      position: 0,
    });

    if (!header) return null;

    return parseExifGpsFromBase64Internal(header);
  } catch (error) {
    console.log('部分讀取失敗:', error);
    return null;
  }
}

/**
 * 嘗試讀取整個文件解析 EXIF
 */
async function tryReadFullFile(uri: string): Promise<{ latitude: number; longitude: number; datetime?: string } | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    if (!base64) return null;

    return parseExifGpsFromBase64Internal(base64);
  } catch (error) {
    console.log('完整讀取失敗:', error);
    return null;
  }
}

/**
 * 從 MediaLibrary 獲取 GPS
 * 
 * ⚠️ 限制：
 * - iOS: 效果好
 * - Android: 在 Expo Go 中經常無法讀取（Scoped Storage 限制）
 */
export async function getGpsFromMediaLibrary(
  uri: string,
  explicitAssetId?: string | null
): Promise<{ gps: GPSInfo | null; error?: string }> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      return { gps: null, error: 'MediaLibrary permission denied' };
    }

    // 提取 Asset ID：
    // 1. 優先使用呼叫端提供的 assetId（iOS ImagePicker 直接提供 PHAsset localIdentifier，最可靠）
    // 2. 否則從 URI 解析（Android content:// 或舊版 ph://）
    let assetId: string | null = explicitAssetId ?? null;

    if (!assetId) {
      if (uri.startsWith('content://media/')) {
        const match = uri.match(/\/(\d+)(?:\?|$)/);
        if (match) assetId = match[1];
      } else if (uri.startsWith('ph://')) {
        const match = uri.match(/ph:\/\/([^/]+)/);
        if (match) assetId = match[1];
      }
    }

    if (!assetId) {
      return { gps: null, error: 'Cannot extract asset ID from URI' };
    }

    console.log(`📍 [MediaLibrary] 使用 assetId 查詢位置: ${assetId}`);
    const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
    
    if (assetInfo?.location) {
      const { latitude, longitude } = assetInfo.location;
      if (typeof latitude === 'number' && typeof longitude === 'number' &&
          !isNaN(latitude) && !isNaN(longitude)) {
        // 檢查 GPS 是否有效（排除 0.000, 0.000）
        if (!isValidGPS(latitude, longitude)) {
          console.log('⚠️ MediaLibrary GPS 無效 (0.000,0.000):', latitude, longitude);
          return { gps: null, error: 'Invalid GPS coordinates (0.000,0.000)' };
        }
        
        return {
          gps: {
            latitude,
            longitude,
            source: 'media-library',
            accuracy: 'medium'
          }
        };
      }
    }

    return { gps: null, error: 'No GPS in MediaLibrary' };
  } catch (error: any) {
    return { gps: null, error: error.message || 'MediaLibrary error' };
  }
}

/**
 * 🔍 主函數：多重驗證檢查照片 GPS
 *
 * 這個函數會嘗試多種方法，並返回詳細結果，
 * 讓你能準確告知用戶為什麼找不到 GPS
 */
export async function checkPhotoGPS(
  uri: string,
  exifObject?: Record<string, any> | null,
  assetId?: string | null
): Promise<GPSCheckResult> {
  const startTime = Date.now();
  const checkedMethods: string[] = [];

  // 提取 EXIF 時間（無論 GPS 是否存在）
  let datetime: string | null = null;
  if (exifObject) {
    datetime = extractExifDatetime(exifObject);
    if (datetime) {
      console.log(`📅 本地提取 EXIF 時間: ${datetime}`);
    }
  }

  // 方法 1: 檢查 ImagePicker 返回的 exif 對象（同步，最快）
  checkedMethods.push('exif-object');
  if (exifObject) {
    const exifGps = extractGpsFromExifObject(exifObject);
    if (exifGps) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`⏱️ [GPS] exif-object 成功，耗時 ${elapsed}s`);
      return {
        hasGPS: true,
        gps: exifGps,
        datetime: exifGps.datetime || datetime,
        checkedMethods
      };
    }
  }

  // 方法 2+3: 並行執行 file-parse 和 media-library（互不依賴）
  checkedMethods.push('file-parse');
  checkedMethods.push('media-library');
  const [fileResult, mediaResult] = await Promise.all([
    parseGpsFromFile(uri),
    getGpsFromMediaLibrary(uri, assetId),
  ]);

  if (fileResult.gps) {
    const bestDatetime = fileResult.datetime || datetime;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⏱️ [GPS] file-parse 成功，耗時 ${elapsed}s`);
    return {
      hasGPS: true,
      gps: fileResult.gps,
      datetime: bestDatetime,
      checkedMethods
    };
  }
  // 即使沒有 GPS，也可能有 datetime
  if (fileResult.datetime && !datetime) {
    datetime = fileResult.datetime;
  }

  if (mediaResult.gps) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⏱️ [GPS] media-library 成功，耗時 ${elapsed}s`);
    return {
      hasGPS: true,
      gps: mediaResult.gps,
      datetime,
      checkedMethods
    };
  }

  // 都失敗了 - 分析原因
  let reason: GPSCheckResult['reason'] = 'not-found';

  if (mediaResult.error?.includes('permission')) {
    reason = 'no-permission';
  } else if (fileResult.error && !fileResult.error.includes('does not contain GPS')) {
    // 只有真正無法讀取檔案時才算 file-access-error；
    // 「檔案讀到了但沒有 GPS」屬於 not-found（正常情況，改用當前定位）
    reason = 'file-access-error';
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`⏱️ [GPS] 所有本地方法失敗，耗時 ${elapsed}s，原因: ${reason}`);

  return {
    hasGPS: false,
    datetime,
    reason,
    checkedMethods
  };
}

/**
 * 快速檢查：只使用 exif 對象
 * 適合在 ImagePicker 回調中使用
 */
export function quickCheckGPS(
  exifObject: Record<string, any> | null | undefined
): { hasGPS: boolean; gps?: GPSInfo } {
  if (!exifObject) {
    return { hasGPS: false };
  }
  
  const gps = extractGpsFromExifObject(exifObject);
  if (gps) {
    return { hasGPS: true, gps };
  }
  
  return { hasGPS: false };
}

/**
 * 📝 獲取用戶友好的錯誤信息
 */
export function getGPSCheckErrorMessage(result: GPSCheckResult): string {
  if (result.hasGPS) {
    return 'GPS 已找到';
  }

  switch (result.reason) {
    case 'no-permission':
      return '無法訪問照片位置權限，請在設置中開啟';
    case 'file-access-error':
      return '無法讀取照片文件（Android 10+ 限制），建議使用「選擇位置」功能';
    case 'parse-error':
      return '無法解析照片信息';
    case 'stripped-by-system':
      return '系統已移除照片位置信息';
    case 'not-found':
    default:
      return '照片沒有內嵌 GPS 位置\n\n可能原因：\n• 拍照時未開啟位置權限\n• 室內 GPS 無信號\n• 照片被壓縮處理過';
  }
}

// ============== 內部 EXIF 解析函數 ==============

function parseExifGpsFromBase64Internal(base64String: string): { latitude: number; longitude: number; datetime?: string } | null {
  try {
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return parseExifGpsFromBuffer(bytes);
  } catch (error) {
    return null;
  }
}

function parseExifGpsFromBuffer(buffer: Uint8Array): { latitude: number; longitude: number; datetime?: string } | null {
  try {
    if (buffer.length < 2 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
      return null;
    }

    let offset = 2;

    while (offset < buffer.length - 4) {
      if (buffer[offset] !== 0xFF) {
        offset++;
        continue;
      }

      const marker = buffer[offset + 1];

      if (marker === 0x00 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) {
        offset += 2;
        continue;
      }

      const segmentLength = (buffer[offset + 2] << 8) | buffer[offset + 3];

      if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
        offset += 2;
        continue;
      }

      if (marker === 0xE1) {
        const segmentData = buffer.slice(offset + 4, offset + 4 + segmentLength - 2);
        const gps = parseExifSegment(segmentData);
        if (gps) return gps;
      }

      offset += 2 + segmentLength;
    }
  } catch (error) {
    console.log('Buffer 解析失敗:', error);
  }

  return null;
}

function parseExifSegment(data: Uint8Array): { latitude: number; longitude: number; datetime?: string } | null {
  try {
    if (data.length < 14) return null;

    const exifHeader = 'Exif\x00\x00';
    for (let i = 0; i < exifHeader.length; i++) {
      if (data[i] !== exifHeader.charCodeAt(i)) return null;
    }

    const tiffStart = 6;
    const isLittleEndian = data[tiffStart] === 0x49 && data[tiffStart + 1] === 0x49;
    const isBigEndian = data[tiffStart] === 0x4D && data[tiffStart + 1] === 0x4D;

    if (!isLittleEndian && !isBigEndian) return null;

    const readUInt16 = (offset: number): number => {
      if (isLittleEndian) {
        return data[offset] | (data[offset + 1] << 8);
      }
      return (data[offset] << 8) | data[offset + 1];
    };

    const readUInt32 = (offset: number): number => {
      if (isLittleEndian) {
        return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
      }
      return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
    };

    /** Read an ASCII string from a TIFF tag value (type 2) at an IFD entry */
    const readAsciiTag = (entryOffset: number): string | null => {
      const type = readUInt16(entryOffset + 2);
      if (type !== 2) return null; // ASCII
      const count = readUInt32(entryOffset + 4);
      const valueOrOffset = readUInt32(entryOffset + 8);
      if (count > 4) {
        // Value is stored at offset from TIFF start
        const strOffset = tiffStart + valueOrOffset;
        if (strOffset + count > data.length) return null;
        let str = '';
        for (let j = 0; j < count - 1; j++) { // skip null terminator
          const ch = data[strOffset + j];
          if (ch === 0) break;
          str += String.fromCharCode(ch);
        }
        return str || null;
      }
      // Value fits inline
      let str = '';
      for (let j = 0; j < count - 1 && j < 4; j++) {
        const ch = data[entryOffset + 8 + j];
        if (ch === 0) break;
        str += String.fromCharCode(ch);
      }
      return str || null;
    };

    if (readUInt16(tiffStart + 2) !== 0x002A) return null;

    const ifd0Offset = readUInt32(tiffStart + 4);
    if (tiffStart + ifd0Offset + 2 > data.length) return null;

    const numEntries = readUInt16(tiffStart + ifd0Offset);
    let gpsIfdOffset: number | null = null;
    let exifIfdOffset: number | null = null;
    let datetime: string | null = null;

    // Scan IFD0 for GPS pointer, ExifIFD pointer, and datetime tags
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = tiffStart + ifd0Offset + 2 + i * 12;
      if (entryOffset + 12 > data.length) break;

      const tag = readUInt16(entryOffset);

      if (tag === 0x8825) {
        gpsIfdOffset = readUInt32(entryOffset + 8);
      } else if (tag === 0x8769) {
        exifIfdOffset = readUInt32(entryOffset + 8);
      } else if (tag === 0x0132 || tag === 0x9003 || tag === 0x9004) {
        // DateTime (0x0132), DateTimeOriginal (0x9003), DateTimeDigitized (0x9004)
        if (!datetime) {
          const dt = readAsciiTag(entryOffset);
          if (dt) datetime = dt;
        }
        // Prefer DateTimeOriginal (0x9003) over others
        if (tag === 0x9003) {
          const dt = readAsciiTag(entryOffset);
          if (dt) datetime = dt;
        }
      }
    }

    // If no datetime in IFD0, check Exif SubIFD
    if (!datetime && exifIfdOffset !== null) {
      const subIfdPos = tiffStart + exifIfdOffset;
      if (subIfdPos + 2 <= data.length) {
        const subNumEntries = readUInt16(subIfdPos);
        for (let i = 0; i < subNumEntries; i++) {
          const entryOffset = subIfdPos + 2 + i * 12;
          if (entryOffset + 12 > data.length) break;
          const tag = readUInt16(entryOffset);
          if (tag === 0x9003 || tag === 0x9004 || tag === 0x0132) {
            const dt = readAsciiTag(entryOffset);
            if (dt) { datetime = dt; break; }
          }
        }
      }
    }

    if (gpsIfdOffset === null || tiffStart + gpsIfdOffset + 2 > data.length) return null;
    
    const gpsOffset = tiffStart + gpsIfdOffset;
    const gpsNumEntries = readUInt16(gpsOffset);
    
    let latitudeRef: string | null = null;
    let longitudeRef: string | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    
    for (let i = 0; i < gpsNumEntries; i++) {
      const entryOffset = gpsOffset + 2 + i * 12;
      if (entryOffset + 12 > data.length) break;
      
      const tag = readUInt16(entryOffset);
      const type = readUInt16(entryOffset + 2);
      const valueOrOffset = readUInt32(entryOffset + 8);
      
      switch (tag) {
        case 0x0001:
          latitudeRef = String.fromCharCode(data[tiffStart + valueOrOffset]);
          break;
        case 0x0002:
          latitude = readRational(data, tiffStart + valueOrOffset, type, isLittleEndian);
          break;
        case 0x0003:
          longitudeRef = String.fromCharCode(data[tiffStart + valueOrOffset]);
          break;
        case 0x0004:
          longitude = readRational(data, tiffStart + valueOrOffset, type, isLittleEndian);
          break;
      }
    }
    
    if (latitude !== null && longitude !== null && latitudeRef && longitudeRef) {
      if (latitudeRef === 'S' || latitudeRef === 's') latitude = -latitude;
      if (longitudeRef === 'W' || longitudeRef === 'w') longitude = -longitude;

      if (!isNaN(latitude) && !isNaN(longitude) &&
          latitude >= -90 && latitude <= 90 &&
          longitude >= -180 && longitude <= 180) {
        // 檢查 GPS 是否有效（排除 0.000, 0.000）
        if (!isValidGPS(latitude, longitude)) {
          console.log('⚠️ EXIF Segment GPS 無效 (0.000,0.000):', latitude, longitude);
          return null;
        }

        const result: { latitude: number; longitude: number; datetime?: string } = { latitude, longitude };
        if (datetime) {
          result.datetime = normalizeExifDatetime(datetime) ?? undefined;
          if (result.datetime) {
            console.log(`📅 二進制解析 EXIF 時間: ${result.datetime}`);
          }
        }
        return result;
      }
    }
  } catch (error) {
    console.log('EXIF 段解析失敗:', error);
  }

  return null;
}

function readRational(
  data: Uint8Array, 
  offset: number, 
  type: number,
  isLittleEndian: boolean
): number | null {
  const readUInt32 = (off: number): number => {
    if (isLittleEndian) {
      return (data[off] | (data[off + 1] << 8) | (data[off + 2] << 16) | (data[off + 3] << 24)) >>> 0;
    }
    return ((data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3]) >>> 0;
  };

  if (type === 5 || type === 10) {
    if (offset + 24 > data.length) return null;
    
    let degrees = 0, minutes = 0, seconds = 0;
    
    for (let i = 0; i < 3; i++) {
      const numerator = readUInt32(offset + i * 8);
      const denominator = readUInt32(offset + i * 8 + 4);
      const value = denominator !== 0 ? numerator / denominator : 0;
      
      if (i === 0) degrees = value;
      else if (i === 1) minutes = value;
      else if (i === 2) seconds = value;
    }
    
    return degrees + minutes / 60 + seconds / 3600;
  }
  
  return null;
}

// 向後兼容
export async function extractGpsFromImage(
  uri: string,
  exifObject?: Record<string, any> | null
): Promise<GPSInfo | null> {
  const result = await checkPhotoGPS(uri, exifObject);
  return result.gps || null;
}

export async function parseExifGpsFromUri(uri: string): Promise<GPSInfo | null> {
  const result = await parseGpsFromFile(uri);
  return result.gps;
}

export async function parseExifGpsFromBase64(base64: string): Promise<GPSInfo | null> {
  const result = parseExifGpsFromBase64Internal(base64);
  if (result) {
    const gps: GPSInfo = { latitude: result.latitude, longitude: result.longitude, source: 'exif-parsed', accuracy: 'high' };
    if (result.datetime) gps.datetime = result.datetime;
    return gps;
  }
  return null;
}
