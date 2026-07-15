import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StatusBar, StyleSheet, Text, View, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { fetchSubmissions, softDeleteSubmission, softDeleteBirdSubmission, type Submission, type SubmissionCategory } from '../lib/submissions';
import { getSignedUrl, resolveBatch, subscribe } from '../lib/imageCache';
import type { AppMode, MainTabParamList, RootStackParamList } from '../navigation/AppNavigator';

type Props = BottomTabScreenProps<MainTabParamList, 'Gallery'>;

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
  return `${yyyy}/${mm}/${dd}`;
}

function getPeriodLabel(periodId: string | null | undefined, periods: PeriodOption[]): string {
  if (!periodId) return '未指定';
  const period = periods.find((p) => p.id === periodId);
  return period ? period.label : periodId;
}

export function GalleryScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userPonds, signOut, autoReSignIn } = useAuth();

  const [mode, setMode] = useState<AppMode>(route.params?.type ?? 'fish');
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<Submission[]>([]);
  const [, setTick] = useState(0);
  const [pondFilter, setPondFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [pondModalVisible, setPondModalVisible] = useState(false);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);

  const periods = useMemo(() => (mode === 'fish' ? FISH_PERIODS : BIRD_PERIODS), [mode]);
  const category: SubmissionCategory = mode === 'bird' ? '雀鳥相片' : '魚塘相片';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchSubmissions({ category, pondFilter, periodFilter });
        setItems(data || []);
        if (data && data.length > 0) {
          resolveBatch(data);
        }
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : '載入失敗';
        console.error('載入照片失敗:', errorMsg);
        if (errorMsg.includes('401') || errorMsg.includes('登入')) {
          Alert.alert('登入已過期', '請重新登入', [{ text: '重新登入', onPress: async () => { await signOut(); } }]);
        }
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [category, pondFilter, periodFilter, signOut]);

  // 訂閱緩存更新 → re-render
  useEffect(() => {
    return subscribe(() => setTick(v => v + 1));
  }, []);

  useEffect(() => {
    // 外部從首頁切換 type 時同步
    if (route.params?.type) setMode(route.params.type);
  }, [route.params?.type]);

  useEffect(() => {
    // 切換 fish/bird 重置篩選
    setPondFilter('all');
    setPeriodFilter('all');
  }, [mode]);

  const openDetail = (s: Submission) => {
    navigation.navigate('SubmissionDetail', {
      id: s.id,
      batchId: s.batch_id || undefined,
      category: mode === 'bird' ? '雀鳥相片' : '魚塘相片'
    });
  };

  const confirmDelete = (s: Submission) => {
    Alert.alert('確認刪除', '確定要刪除這張照片嗎？此操作無法復原。', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            // 根據 mode 選擇正確的刪除函數
            const deleteFn = mode === 'bird' ? softDeleteBirdSubmission : softDeleteSubmission;
            const result = await deleteFn(s.id);

            if (result.success) {
              setItems((prev) => prev.filter((x) => x.id !== s.id));
              Alert.alert('成功', '照片已刪除');
            } else {
              const errorMsg = result.error || '刪除失敗';
              if (errorMsg.includes('登入憑證已過期') || errorMsg.includes('401')) {
                const reSignInResult = await autoReSignIn();
                if (reSignInResult.success) {
                  const retryResult = await deleteFn(s.id);
                  if (retryResult.success) {
                    setItems((prev) => prev.filter((x) => x.id !== s.id));
                    Alert.alert('成功', '照片已刪除');
                  } else {
                    Alert.alert('刪除失敗', '自動重新登入後仍無法刪除');
                  }
                } else {
                  Alert.alert('登入已過期', '請重新登入', [{ text: '重新登入', onPress: async () => { await signOut(); } }]);
                }
              } else {
                Alert.alert('刪除失敗', errorMsg);
              }
            }
          })();
        },
      },
    ]);
  };

  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <Pressable 
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Main', { screen: 'Home' });
            }
          }} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>相片庫</Text>
        </View>
      </View>
      <View style={styles.segment}>
        <Pressable style={[styles.segmentBtn, mode === 'fish' && styles.segmentBtnActive]} onPress={() => setMode('fish')}>
          <Text style={[styles.segmentText, mode === 'fish' && styles.segmentTextActive]}>魚類</Text>
        </Pressable>
        <Pressable style={[styles.segmentBtn, mode === 'bird' && styles.segmentBtnActive]} onPress={() => setMode('bird')}>
          <Text style={[styles.segmentText, mode === 'bird' && styles.segmentTextActive]}>雀鳥</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <Pressable style={styles.filterCard} onPress={() => setPondModalVisible(true)}>
          <Text style={styles.filterLabel}>魚塘</Text>
          <Text style={styles.filterValue}>
            {pondFilter === 'all' ? '所有魚塘' : userPonds.find((p) => p.id === pondFilter)?.pond_id || '已選擇'}
          </Text>
        </Pressable>
        <Pressable style={styles.filterCard} onPress={() => setPeriodModalVisible(true)}>
          <Text style={styles.filterLabel}>期別</Text>
          <Text style={styles.filterValue}>{periodFilter === 'all' ? '所有期別' : periods.find((p) => p.id === periodFilter)?.label || periodFilter}</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>尚無相片記錄</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={true}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openDetail(item)}>
              <Image source={{ uri: getSignedUrl(item.id) || item.file_url }} style={styles.thumb} />

              <View style={styles.cardBody}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{item.ponds?.pond_id || '未指定魚塘'}</Text>
                  <StatusBadge status={item.payment_status} variant={mode === 'bird' ? 'bird' : 'fish'} />
                </View>
                <Text style={styles.cardMeta}>{fmtDate(item.submission_timestamp)} · {getPeriodLabel(item.period, periods)}</Text>

                <View style={styles.rowBetween}>
                  <Text style={styles.cardMeta2}>{item.ponds?.name || ''}</Text>
                  {/* 只有雀鳥相片可以刪除 */}
                  {mode === 'bird' && (
                    <Pressable onPress={() => confirmDelete(item)} hitSlop={10}>
                      <Text style={styles.delete}>刪除</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* 魚塘篩選 */}
      <Modal visible={pondModalVisible} animationType="slide" onRequestClose={() => setPondModalVisible(false)}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇魚塘</Text>
            <Pressable onPress={() => setPondModalVisible(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <FlatList
            data={[{ id: 'all', pond_id: 'all', name: '所有魚塘' } as any, ...userPonds]}
            keyExtractor={(p) => p.id}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const active = (item.id === 'all' ? 'all' : item.id) === pondFilter;
              return (
                <Pressable
                  style={[styles.modalItem, active && styles.modalItemActive]}
                  onPress={() => {
                    setPondFilter(item.id === 'all' ? 'all' : item.id);
                    setPondModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemTitle, active && styles.modalItemTitleActive]}>
                    {item.id === 'all' ? '所有魚塘' : item.pond_id}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      {/* 期別篩選 */}
      <Modal visible={periodModalVisible} animationType="slide" onRequestClose={() => setPeriodModalVisible(false)}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇期別</Text>
            <Pressable onPress={() => setPeriodModalVisible(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <FlatList
            data={[{ id: 'all', label: '所有期別' }, ...periods]}
            keyExtractor={(p) => p.id}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const active = item.id === periodFilter;
              return (
                <Pressable
                  style={[styles.modalItem, active && styles.modalItemActive]}
                  onPress={() => {
                    setPeriodFilter(item.id);
                    setPeriodModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemTitle, active && styles.modalItemTitleActive]}>{item.label}</Text>
                  {item.id !== 'all' ? <Text style={[styles.modalItemMeta, active && styles.modalItemMetaActive]}>{item.id}</Text> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 153, 153, 1)',
    position: 'relative',
    minHeight: 24,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    marginTop: 40,
    zIndex: 1,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
  },

  segment: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 10,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 999 },
  segmentBtnActive: { backgroundColor: 'rgba(0, 153, 153, 1)' },
  segmentText: { fontWeight: '900', color: '#111827' }, // 黑色
  segmentTextActive: { color: '#FFFFFF' }, // 白色

  filters: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  filterCard: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 12 },
  filterLabel: { color: '#6b7280', fontSize: 12 },
  filterValue: { marginTop: 6, fontSize: 14, fontWeight: '900', color: '#111827' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#6b7280' },

  card: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  thumb: { width: '100%', height: 200, backgroundColor: '#F3F4F6' },
  cardBody: { padding: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#111827' },
  cardMeta: { marginTop: 6, color: '#6b7280', fontSize: 12 },
  cardMeta2: { marginTop: 10, color: '#374151', fontSize: 12 },
  delete: { color: '#EF4444', fontWeight: '900' },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  modalClose: { color: '#111827', fontWeight: '900' },
  modalItem: { paddingHorizontal: 16, paddingVertical: 12 },
  modalItemActive: { backgroundColor: '#34D399' },
  modalItemTitle: { fontSize: 15, fontWeight: '900', color: '#111827' },
  modalItemTitleActive: { color: '#065F46' },
  modalItemMeta: { marginTop: 6, color: '#6b7280', fontSize: 12 },
  modalItemMetaActive: { color: '#E5E7EB' },
  sep: { height: 1, backgroundColor: '#F3F4F6' },
});
