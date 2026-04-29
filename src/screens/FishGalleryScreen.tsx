import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { FixedTabBar } from '../components/FixedTabBar';
import { fetchSubmissions, type Submission, type SubmissionCategory } from '../lib/submissions';
import { handleAuthError } from '../lib/autoReSignIn';
import type { AppMode, MainTabParamList, RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'FishGallery'>;

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

export function FishGalleryScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, userPonds, signOut, autoReSignIn } = useAuth();
  const insets = useSafeAreaInsets();

  // 从 route 参数中获取初始筛选条件
  const initialPondId = route.params?.pondId || 'all';
  const initialPeriodId = route.params?.periodId || 'all';

  const [mode, setMode] = useState<AppMode>('fish');
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<Submission[]>([]);
  const [pondFilter, setPondFilter] = useState<string>(initialPondId);
  const [periodFilter, setPeriodFilter] = useState<string>(initialPeriodId);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [pondModalVisible, setPondModalVisible] = useState(false);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const periods = useMemo(() => mode === 'fish' ? FISH_PERIODS : BIRD_PERIODS, [mode]);
  const category: SubmissionCategory = useMemo(() => mode === 'fish' ? '魚塘相片' : '雀鳥相片', [mode]);

  // 切換模式時重置日期篩選
  useEffect(() => {
    setStartDate('');
    setEndDate('');
  }, [mode]);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setIsLoading(true);
        try {
          let data = await fetchSubmissions({
            category,
            pondFilter,
            periodFilter,
            ownerFilter: user?.owner_uuid
          });

          // 應用日期篩選（客戶端過濾）
          if (data && (startDate || endDate)) {
            data = data.filter(item => {
              const itemDate = new Date(item.submission_timestamp);
              const start = startDate ? new Date(startDate) : null;
              const end = endDate ? new Date(endDate) : null;

              if (start && end) {
                return itemDate >= start && itemDate <= new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);
              } else if (start) {
                return itemDate >= start;
              } else if (end) {
                return itemDate <= new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);
              }
              return true;
            });
          }

          setItems(data || []);
        } catch (e: unknown) {
          await handleAuthError(e, autoReSignIn, signOut, async () => {
            const data = await fetchSubmissions({
              category,
              pondFilter: pondFilter === 'all' ? undefined : pondFilter,
              periodFilter: periodFilter === 'all' ? undefined : periodFilter,
              ownerFilter: user?.owner_uuid
            });
            setItems(data || []);
          });
        } finally {
          setIsLoading(false);
        }
      };
      void load();
    }, [category, pondFilter, periodFilter, startDate, endDate, user?.owner_uuid, signOut])
  );

  const openDetail = (s: Submission) => {
    navigation.navigate('SubmissionDetail', {
      id: s.batch_id ? undefined : s.id,
      batchId: s.batch_id || undefined,
      category: mode === 'bird' ? '雀鳥相片' : '魚塘相片'
    });
  };

  const refreshData = async () => {
    setIsLoading(true);
    try {
      let data = await fetchSubmissions({
        category,
        pondFilter,
        periodFilter,
        ownerFilter: user?.owner_uuid
      });
      
      // 應用日期篩選（客戶端過濾）
      if (data && (startDate || endDate)) {
        data = data.filter(item => {
          const itemDate = new Date(item.submission_timestamp);
          const start = startDate ? new Date(startDate) : null;
          const end = endDate ? new Date(endDate) : null;
          
          if (start && end) {
            return itemDate >= start && itemDate <= new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);
          } else if (start) {
            return itemDate >= start;
          } else if (end) {
            return itemDate <= new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);
          }
          return true;
        });
      }
      
      setItems(data || []);
    } catch (e: unknown) {
      await handleAuthError(e, autoReSignIn, signOut, async () => {
        const data = await fetchSubmissions({ 
          category, 
          pondFilter: pondFilter === 'all' ? undefined : pondFilter, 
          periodFilter: periodFilter === 'all' ? undefined : periodFilter 
        });
        setItems(data || []);
      });
    } finally {
      setIsLoading(false);
    }
  };

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <Pressable 
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Main', { screen: 'Gallery' });
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

      {/* Toggle 分頁 - 切換魚塘/雀鳥相片庫 */}
      <View style={styles.toggleContainer}>
        <Pressable 
          style={[styles.toggleButton, mode === 'fish' && styles.toggleButtonActive]}
          onPress={() => {
            setMode('fish');
            setPeriodFilter('all');
          }}
        >
          <Text style={[styles.toggleText, mode === 'fish' && styles.toggleTextActive]}>魚塘相片庫</Text>
        </Pressable>
        <Pressable 
          style={[styles.toggleButton, mode === 'bird' && styles.toggleButtonActive]}
          onPress={() => {
            setMode('bird');
            setPeriodFilter('all');
          }}
        >
          <Text style={[styles.toggleText, mode === 'bird' && styles.toggleTextActive]}>雀鳥相片庫</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <Pressable style={styles.filterCard} onPress={() => setPondModalVisible(true)}>
          <Text style={styles.filterLabel}>魚塘</Text>
          <Text style={styles.filterValue}>
            {pondFilter === 'all' ? '所有魚塘' : (userPonds || []).find((p) => p.id === pondFilter)?.pond_id || '已選擇'}
          </Text>
        </Pressable>
        <Pressable style={styles.filterCard} onPress={() => setPeriodModalVisible(true)}>
          <Text style={styles.filterLabel}>降水階段</Text>
          <Text style={styles.filterValue}>{periodFilter === 'all' ? '所有降水階段' : periods.find((p) => p.id === periodFilter)?.label || periodFilter}</Text>
        </Pressable>
        <Pressable style={styles.filterCard} onPress={() => setDateModalVisible(true)}>
          <Text style={styles.filterLabel}>📅 日期</Text>
          <Text style={styles.filterValue}>
            {!startDate && !endDate ? '所有日期' : 
             startDate && endDate ? `${startDate} ~ ${endDate}` :
             startDate ? `${startDate} 起` :
             `至 ${endDate}`}
          </Text>
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 + insets.bottom }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openDetail(item)}>
              <View style={styles.imageContainer}>
                {item.file_url ? <Image source={{ uri: item.file_url }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: '#E5E7EB' }]} />}
              </View>

              <View style={styles.cardBody}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{item.ponds?.pond_id || '未指定魚塘'}</Text>
                  <StatusBadge status={item.payment_status} />
                </View>
                <Text style={styles.cardMeta}>{fmtDate(item.submission_timestamp)} · {getPeriodLabel(item.period, periods)}</Text>

                {item.ponds?.name && item.ponds.name !== item.ponds?.pond_id ? (
                <View style={styles.rowBetween}>
                  <Text style={styles.cardMeta2}>{item.ponds.name}</Text>
                </View>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}

      {/* 魚塘篩選 */}
      <Modal visible={pondModalVisible} animationType="slide" onRequestClose={() => setPondModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇魚塘</Text>
            <Pressable onPress={() => setPondModalVisible(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <FlatList
            data={[{ id: 'all', pond_id: 'all', name: '所有魚塘' } as any, ...(userPonds || [])]}
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
                    {item.id === 'all' ? '所有魚塘' : `${item.pond_id} · ${item.name}`}
                  </Text>
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* 降水階段篩選 */}
      <Modal visible={periodModalVisible} animationType="slide" onRequestClose={() => setPeriodModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇降水階段</Text>
            <Pressable onPress={() => setPeriodModalVisible(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <FlatList
            data={[{ id: 'all', label: '所有降水階段' }, ...periods]}
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
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* 日期篩選 */}
      <Modal visible={dateModalVisible} animationType="slide" onRequestClose={() => setDateModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇日期範圍</Text>
            <Pressable onPress={() => setDateModalVisible(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {/* 開始日期 */}
            <View style={styles.dateInputSection}>
              <Text style={styles.dateLabel}>開始日期</Text>
              <Pressable 
                style={styles.datePickerButton}
                onPress={() => setShowStartDatePicker(true)}
              >
                <Text style={styles.datePickerText}>
                  {startDate ? startDate : '選擇開始日期'}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
              </Pressable>
              {showStartDatePicker && (
                <DateTimePicker
                  value={startDate ? new Date(startDate) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowStartDatePicker(false);
                    if (selectedDate) {
                      setStartDate(selectedDate.toISOString().split('T')[0]);
                    }
                  }}
                />
              )}
            </View>

            {/* 結束日期 */}
            <View style={styles.dateInputSection}>
              <Text style={styles.dateLabel}>結束日期</Text>
              <Pressable 
                style={styles.datePickerButton}
                onPress={() => setShowEndDatePicker(true)}
              >
                <Text style={styles.datePickerText}>
                  {endDate ? endDate : '選擇結束日期'}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
              </Pressable>
              {showEndDatePicker && (
                <DateTimePicker
                  value={endDate ? new Date(endDate) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowEndDatePicker(false);
                    if (selectedDate) {
                      setEndDate(selectedDate.toISOString().split('T')[0]);
                    }
                  }}
                />
              )}
            </View>

            {/* 操作按鈕 */}
            <View style={styles.dateButtonsContainer}>
              <Pressable
                style={[styles.dateButton, styles.clearButton]}
                onPress={() => {
                  setStartDate('');
                  setEndDate('');
                }}
              >
                <Text style={styles.clearButtonText}>清除篩選</Text>
              </Pressable>

              <Pressable
                style={[styles.dateButton, styles.confirmButton]}
                onPress={() => {
                  setDateModalVisible(false);
                }}
              >
                <Text style={styles.confirmButtonText}>確認</Text>
              </Pressable>
            </View>

            {/* 快速選擇 */}
            <View style={styles.quickSelectSection}>
              <Text style={styles.quickSelectTitle}>快速選擇</Text>
              <Pressable
                style={styles.quickSelectButton}
                onPress={() => {
                  const today = new Date();
                  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                  setStartDate(weekAgo.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
              >
                <Text style={styles.quickSelectText}>最近7天</Text>
              </Pressable>
              <Pressable
                style={styles.quickSelectButton}
                onPress={() => {
                  const today = new Date();
                  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                  setStartDate(monthAgo.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
              >
                <Text style={styles.quickSelectText}>最近30天</Text>
              </Pressable>
              <Pressable
                style={styles.quickSelectButton}
                onPress={() => {
                  const today = new Date();
                  const year = today.getFullYear();
                  const month = today.getMonth();
                  const firstDay = new Date(year, month, 1);
                  setStartDate(firstDay.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
              >
                <Text style={styles.quickSelectText}>本月</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <FixedTabBar />
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
    marginTop: 30,
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
  segmentBtnActive: { backgroundColor: '#34D399' },
  segmentText: { fontWeight: '900', color: '#111827' },
  segmentTextActive: { color: '#065F46' },

  toggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#F3F4F6',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(0, 153, 153, 1)',
    borderColor: 'rgba(0, 153, 153, 1)',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827', // 黑色
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },

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
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
  },
  thumb: { width: '100%', height: 200, backgroundColor: '#F3F4F6' },
  cardBody: { padding: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#111827' },
  cardMeta: { marginTop: 6, color: '#6b7280', fontSize: 12 },
  cardMeta2: { marginTop: 10, color: '#374151', fontSize: 12 },

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

  // 日期選擇樣式
  dateInputSection: {
    marginBottom: 20,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  dateInputContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dateInput: {
    width: '100%',
    padding: 12,
    fontSize: 16,
    borderWidth: 0,
    color: '#111827',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  datePickerText: {
    fontSize: 16,
    color: '#111827',
  },
  dateButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  dateButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  confirmButton: {
    backgroundColor: '#059669',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  quickSelectSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  quickSelectTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  quickSelectButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 8,
  },
  quickSelectText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
    textAlign: 'center',
  },
});
