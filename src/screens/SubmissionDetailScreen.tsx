import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/AppNavigator';
import { StatusBadge } from '../components/StatusBadge';
import { FixedTabBar } from '../components/FixedTabBar';
import { fetchSubmissionDetail, fetchBirdSubmissionDetail, type Submission } from '../lib/submissions';
import { useAuth } from '../contexts/AuthContext';
import { handleAuthError } from '../lib/autoReSignIn';

type Props = NativeStackScreenProps<RootStackParamList, 'SubmissionDetail'>;

type PeriodOption = { id: string; label: string };

const FISH_PERIODS: PeriodOption[] = [
  { id: 'before_drawdown', label: '降水前' },
  { id: 'after_basic_day1', label: '基本降水後第1天' },
  { id: 'after_drying_day1', label: '乾塘後第1天' },
  { id: 'after_basic_day7', label: '基本降水後第7天' },
  { id: 'after_drying_day7', label: '乾塘後第7天' },
];

const BIRD_PERIODS: PeriodOption[] = [
  { id: 'non_drawdown_drying', label: '非降水乾塘時' },
  { id: 'after_drying', label: '乾塘後' },
  { id: 'after_basic', label: '基本降水後' },
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

// 格式化 EXIF 時間
// 策略：如果時間串包含 Z（UTC），則保持 UTC 並直接顯示；否則視為本地時間
function fmtExifDate(exifDatetime: string | null | undefined): string {
  if (!exifDatetime) return '';

  try {
    // EXIF 格式可能是：
    // - "2024-01-15T14:30:00" (ISO 本地時間，無時區)
    // - "2024-01-15T14:30:00Z" (ISO UTC 時間)
    // - "2024:01:15 14:30:00" (EXIF 標準格式，本地時間)

    let d: Date;
    if (exifDatetime.includes('T')) {
      // ISO 格式
      d = new Date(exifDatetime);
    } else if (exifDatetime.includes(':') && exifDatetime.includes(' ')) {
      // EXIF 格式 "2024:01:15 14:30:00" - 這是本地時間
      const parts = exifDatetime.split(' ');
      if (parts.length < 2) return exifDatetime;

      const dateParts = parts[0].split(':');
      const timeParts = parts[1].split(':');

      if (dateParts.length < 3 || timeParts.length < 2) return exifDatetime;

      // 直接構造 Date，會被當作本地時間
      d = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2]),
        parseInt(timeParts[0]),
        parseInt(timeParts[1]),
        parseInt(timeParts[2] || '0')
      );
    } else {
      d = new Date(exifDatetime);
    }

    if (isNaN(d.getTime())) return exifDatetime;

    // 如果時間串是 UTC（帶 Z），使用 UTC 方法；否則使用本地方法
    const isUtc = exifDatetime.endsWith('Z');
    const yyyy = isUtc ? d.getUTCFullYear() : d.getFullYear();
    const mm = isUtc ? String(d.getUTCMonth() + 1) : String(d.getMonth() + 1);
    const dd = isUtc ? String(d.getUTCDate()) : String(d.getDate());
    const hh = isUtc ? String(d.getUTCHours()) : String(d.getHours());
    const mi = isUtc ? String(d.getUTCMinutes()) : String(d.getMinutes());

    return `${yyyy.padStart(4, '0')}/${mm.padStart(2, '0')}/${dd.padStart(2, '0')} ${hh.padStart(2, '0')}:${mi.padStart(2, '0')}`;
  } catch (error) {
    console.error('fmtExifDate error:', error);
    return exifDatetime || '';
  }
}

function getPeriodLabel(periodId: string | null | undefined, category: string | null | undefined): string {
  if (!periodId) return '未指定';
  const periods = category === '魚塘相片' ? FISH_PERIODS : BIRD_PERIODS;
  const period = periods.find((p) => p.id === periodId);
  return period ? period.label : periodId;
}

/**
 * 生成地圖 HTML
 */
function generateMapHtml(latitude: number, longitude: number): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { 
      height: 100%; 
      width: 100%; 
      overflow: hidden;
    }
    /* 隱藏 Leaflet logo 和 attribution */
    .leaflet-control-attribution {
      display: none !important;
    }
    .leaflet-bottom.leaflet-right {
      display: none !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    // 初始化地圖
    const map = L.map('map', {
      center: [${latitude}, ${longitude}],
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      touchZoom: true,
      dragging: true,
      attributionControl: false, // 禁用 attribution 控制
    });

    // 添加地圖圖層（不顯示 attribution）
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '',
      maxZoom: 19,
    }).addTo(map);

    // 自定義紅色標記圖標（表示拍攝位置）
    const redIcon = L.divIcon({
      html: '<div style="background-color: #EF4444; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><div style="width: 8px; height: 8px; background: white; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(45deg);"></div></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      className: 'custom-marker',
    });

    // 添加標記
    const marker = L.marker([${latitude}, ${longitude}], {
      icon: redIcon,
      title: '拍攝位置',
    }).addTo(map);

    // 添加標記彈出窗口
    marker.bindPopup(\`
      <div style="text-align: center; font-family: sans-serif;">
        <strong style="font-size: 14px;">📍 拍攝位置</strong><br>
        <span style="font-size: 12px; color: #6B7280;">
          ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
        </span>
      </div>
    \`).openPopup();

    // 禁用某些手勢以避免與 ScrollView 衝突
    map.touchZoom.disable();
    map.scrollWheelZoom.disable();
    
    // 但允許雙擊縮放
    map.on('dblclick', function() {
      map.touchZoom.enable();
      setTimeout(() => {
        map.touchZoom.disable();
      }, 100);
    });
  </script>
</body>
</html>
  `;
}

export function SubmissionDetailScreen({ route, navigation }: Props) {
  const { id, batchId, category } = route.params;
  const { signOut, autoReSignIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      // 根據 category 選擇正確的查詢函數
      const fetchFn = category === '雀鳥相片' ? fetchBirdSubmissionDetail : fetchSubmissionDetail;
      try {
        const data = await fetchFn({ id, batchId });
        setItems(data || []);
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : '載入失敗';
        setError(errorMsg);

        if (errorMsg.includes('登入憑證已過期') || errorMsg.includes('401')) {
          // 尝试自动重新登入
          const reSignInResult = await autoReSignIn();
          if (reSignInResult.success) {
            // 重新登入成功，重新載入數據
            setIsLoading(true);
            setError(null);
            try {
              const data = await fetchFn({ id, batchId });
              setItems(data || []);
            } catch (retryError) {
              const retryErrorMsg = retryError instanceof Error ? retryError.message : '載入失敗';
              setError(retryErrorMsg);
            } finally {
              setIsLoading(false);
            }
          } else {
            Alert.alert(
              '登入已過期',
              '您的登入憑證已過期，請重新登入',
              [
                {
                  text: '重新登入',
                  onPress: async () => {
                    await signOut();
                    navigation.goBack();
                  },
                },
              ],
              { cancelable: false }
            );
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [id, batchId, category, signOut, navigation]);

  const first = items[0];

  const photos = useMemo(
    () => items.map((s) => ({ id: s.id, url: s.file_url })).filter((p) => !!p.url),
    [items]
  );

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;

  // 渲染 Header
  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + 12, height: 56 + insets.top }]}>
      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </Pressable>
      <Text style={styles.headerTitle}>提交詳情</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.wrapper}>
        {renderHeader()}
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  if (error && !first) {
    return (
      <View style={styles.wrapper}>
        {renderHeader()}
        <View style={styles.center}>
          <Text style={styles.empty}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!first) {
    return (
      <View style={styles.wrapper}>
        {renderHeader()}
        <View style={styles.center}>
          <Text style={styles.empty}>找不到記錄</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {renderHeader()}

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}>
        {/* 照片輪播（簡化版） */}
        <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={photos}
        keyExtractor={(p) => p.id}
        style={styles.carousel}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        renderItem={({ item }) => (
          <Pressable>
            <Image source={{ uri: item.url }} style={styles.photo} />
          </Pressable>
        )}
      />

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>提交詳情</Text>
          <StatusBadge status={first.payment_status} />
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>魚塘</Text>
          <Text style={styles.metaVal}>
            {first.ponds?.pond_id
              ? (first.ponds?.name && first.ponds.name !== first.ponds.pond_id
                  ? `${first.ponds.pond_id} · ${first.ponds.name}`
                  : first.ponds.pond_id)
              : first.pond_id || '未指定'}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>降水階段</Text>
          <Text style={styles.metaVal}>{getPeriodLabel(first.period, first.category)}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>提交時間</Text>
          <Text style={styles.metaVal}>{fmtDate(first.submission_timestamp)}</Text>
        </View>

        {/* 照片GPS - 照片EXIF內嵌位置 */}
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>拍攝位置</Text>
          <View style={{ maxWidth: '70%', alignItems: 'flex-end' }}>
            <Text style={styles.metaVal}>
              {first?.exif_latitude && first?.exif_longitude
                ? `${Number(first.exif_latitude).toFixed(6)}, ${Number(first.exif_longitude).toFixed(6)}`
                : '無GPS資訊'}
            </Text>
            <Text style={[styles.metaVal, { fontSize: 12, color: '#9CA3AF', marginTop: 2 }]}>
              {first?.exif_latitude && first?.exif_longitude
                ? (first?.exif_datetime ? fmtExifDate(first.exif_datetime) : 'EXIF無時間')
                : ''}
            </Text>
          </View>
        </View>

        {/* 地圖顯示 - 只顯示照片EXIF位置 */}
        {first?.exif_latitude && first?.exif_longitude ? (
          <View style={styles.mapSection}>
            <View style={styles.mapHeader}>
              <Text style={styles.mapTitle}>📍 拍攝位置</Text>
              <Pressable
                style={styles.openMapButton}
                onPress={() => {
                  const lat = Number(first.exif_latitude);
                  const lng = Number(first.exif_longitude);
                  const url = Platform.select({
                    ios: `maps://app?daddr=${lat},${lng}`,
                    android: `google.navigation:q=${lat},${lng}`,
                  });
                  if (url) {
                    Linking.openURL(url).catch(() => {
                      // 如果無法打開原生地圖應用，使用網頁版
                      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
                    });
                  }
                }}
              >
                <Ionicons name="navigate" size={16} color="#059669" />
                <Text style={styles.openMapText}>導航</Text>
              </Pressable>
            </View>
            <View style={styles.mapContainer}>
              <WebView
                source={{ html: generateMapHtml(
                  Number(first.exif_latitude),
                  Number(first.exif_longitude)
                ) }}
                style={styles.map}
                scrollEnabled={false}
                bounces={false}
              />
            </View>
          </View>
        ) : null}

        {/* 只有魚塘相片顯示撥款金額 */}
        {first.payment_amount && category !== '雀鳥相片' ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>撥款金額</Text>
            <Text style={styles.amount}>HK$ {Number(first.payment_amount).toLocaleString()}</Text>
          </View>
        ) : null}

        {/* 只有魚塘相片顯示相片數量 */}
        {category !== '雀鳥相片' && (
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>相片數量</Text>
            <Text style={styles.metaVal}>{photos.length} 張</Text>
          </View>
        )}
      </View>
      <FixedTabBar />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 153, 153, 1)',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  empty: { color: '#6b7280' },

  carousel: { paddingTop: 12 },
  photo: { width: 260, height: 260, borderRadius: 16, backgroundColor: '#F3F4F6' },

  card: {
    marginTop: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  metaKey: { color: '#6b7280' },
  metaVal: { color: '#111827', fontWeight: '800', maxWidth: '70%', textAlign: 'right' },
  amount: { color: '#111827', fontWeight: '900' },

  // 地圖相關樣式
  mapSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mapTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  openMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  openMapText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  mapContainer: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  map: {
    flex: 1,
  },
});
