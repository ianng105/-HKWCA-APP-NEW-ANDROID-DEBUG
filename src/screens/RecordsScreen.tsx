import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StatusBar, StyleSheet, Text, View, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { fetchSubmissions, type Submission, type SubmissionCategory } from '../lib/submissions';
import type { AppMode, MainTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { handleAuthError } from '../lib/autoReSignIn';
import { getFishPeriodsWithYearLabel, getBirdPeriodsWithYearLabel } from '../lib/projectYear';

type Props = BottomTabScreenProps<MainTabParamList, 'Records'>;

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

type PeriodStatus = {
  period: string;
  hasSubmitted: boolean;
  isApproved: boolean;
  submissions: Submission[];
};

type DatePreset = 'all' | '7d' | '30d';

function startIsoFromPreset(preset: DatePreset) {
  if (preset === 'all') return undefined;
  const d = new Date();
  d.setDate(d.getDate() - (preset === '7d' ? 7 : 30));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

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

export function RecordsScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { userPonds, signOut, autoReSignIn } = useAuth();

  const [mode, setMode] = useState<AppMode>(route.params?.type ?? 'fish');
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<Submission[]>([]);
  const [pondFilter, setPondFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [pondModalVisible, setPondModalVisible] = useState(false);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);

  const periods = useMemo(() => (mode === 'fish' ? getFishPeriodsWithYearLabel() : getBirdPeriodsWithYearLabel()), [mode]);
  const category: SubmissionCategory = mode === 'bird' ? '雀鳥相片' : '魚塘相片';

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const startIso = startIsoFromPreset(datePreset);
        const data = await fetchSubmissions({ category, pondFilter, periodFilter, startIso });

        // 參照 Web：按 batch_id 分組，只顯示每個批次第一張
        const map = new Map<string, Submission>();
        (data || []).forEach((s) => {
          const key = s.batch_id || s.id;
          if (!map.has(key)) map.set(key, s);
        });

        setItems(Array.from(map.values()));
      } catch (e: unknown) {
        await handleAuthError(e, autoReSignIn, signOut, async () => {
          const data = await fetchSubmissions({ category, pondFilter, periodFilter, datePreset });
          
          const map = new Map<string, any>();
          for (const s of data || []) {
            const key = s.batch_id || s.id;
            if (!map.has(key)) {
              map.set(key, { ...s, count: 1 });
            } else {
              const existing = map.get(key);
              if (existing) {
                existing.count = (existing.count || 1) + 1;
              }
            }
          }
          
          setItems(Array.from(map.values()));
        });
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [category, pondFilter, periodFilter, datePreset, signOut]);

  useEffect(() => {
    if (route.params?.type) setMode(route.params.type);
  }, [route.params?.type]);

  useEffect(() => {
    setPondFilter('all');
    setPeriodFilter('all');
    setDatePreset('all');
  }, [mode]);

  const openDetail = (s: Submission) => {
    navigation.navigate('SubmissionDetail', {
      id: s.batch_id ? undefined : s.id,
      batchId: s.batch_id || undefined,
      category: mode === 'bird' ? '雀鳥相片' : '魚塘相片'
    });
  };

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
          <Text style={styles.title}>我的記錄</Text>
        </View>
      </View>
      {/* Toggle 分頁 - 切換魚塘/雀鳥記錄 */}
      <View style={styles.toggleContainer}>
        <Pressable
          style={[styles.toggleButton, mode === 'fish' && styles.toggleButtonActive]}
          onPress={() => setMode('fish')}
        >
          <Text style={[styles.toggleText, mode === 'fish' && styles.toggleTextActive]}>魚塘記錄</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, mode === 'bird' && styles.toggleButtonActive]}
          onPress={() => setMode('bird')}
        >
          <Text style={[styles.toggleText, mode === 'bird' && styles.toggleTextActive]}>雀鳥記錄</Text>
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

      <View style={styles.presetRow}>
        <Pressable style={[styles.presetBtn, datePreset === 'all' && styles.presetBtnActive]} onPress={() => setDatePreset('all')}>
          <Text style={[styles.presetText, datePreset === 'all' && styles.presetTextActive]}>全部</Text>
        </Pressable>
        <Pressable style={[styles.presetBtn, datePreset === '7d' && styles.presetBtnActive]} onPress={() => setDatePreset('7d')}>
          <Text style={[styles.presetText, datePreset === '7d' && styles.presetTextActive]}>近 7 日</Text>
        </Pressable>
        <Pressable style={[styles.presetBtn, datePreset === '30d' && styles.presetBtnActive]} onPress={() => setDatePreset('30d')}>
          <Text style={[styles.presetText, datePreset === '30d' && styles.presetTextActive]}>近 30 日</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>尚無記錄</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openDetail(item)}>
              <View style={styles.thumbWrap}>
                <Image source={{ uri: item.file_url }} style={styles.thumb} />
              </View>

              <View style={styles.cardBody}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{item.ponds?.pond_id || '未指定魚塘'}</Text>
                  <StatusBadge status={item.payment_status} />
                </View>

                <Text style={styles.cardMeta}>{fmtDate(item.submission_timestamp)} · {getPeriodLabel(item.period, periods)}</Text>

                {item.payment_amount ? <Text style={styles.amount}>HK$ {Number(item.payment_amount).toLocaleString()}</Text> : null}
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
                    {item.id === 'all' ? '所有魚塘' : `${item.pond_id} · ${item.name}`}
                  </Text>
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* 期別篩選 */}
      <Modal visible={periodModalVisible} animationType="slide" onRequestClose={() => setPeriodModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
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
        </SafeAreaView>
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
    marginTop: 10,
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

  filters: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  filterCard: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, padding: 12 },
  filterLabel: { color: '#6b7280', fontSize: 12 },
  filterValue: { marginTop: 6, fontSize: 14, fontWeight: '900', color: '#111827' },

  presetRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  presetBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, backgroundColor: '#F3F4F6', alignItems: 'center' },
  presetBtnActive: { backgroundColor: '#34D399' },
  presetText: { fontWeight: '900', color: '#111827' },
  presetTextActive: { color: '#065F46' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#6b7280' },

  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  thumbWrap: { width: 86, height: 86, backgroundColor: '#F3F4F6' },
  thumb: { width: '100%', height: '100%' },
  cardBody: { flex: 1, padding: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#111827' },
  cardMeta: { marginTop: 6, color: '#6b7280', fontSize: 12 },
  amount: { marginTop: 6, fontWeight: '900', color: '#111827' },

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
