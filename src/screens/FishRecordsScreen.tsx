import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { fetchSubmissions, type Submission, type SubmissionCategory } from '../lib/submissions';
import type { AppMode, RootStackParamList } from '../navigation/AppNavigator';
import { handleAuthError } from '../lib/autoReSignIn';
import { getCurrentPhaseLabel, getPhaseOptions, getCurrentProjectYearNumber, getPhaseDateRange, type PhaseOption } from '../lib/projectYear';
import { FixedTabBar } from '../components/FixedTabBar';

type Props = NativeStackScreenProps<RootStackParamList, 'FishRecords'>;

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
  period: PeriodOption;
  hasUploaded: boolean;
  isApproved: boolean;
  submissions: Submission[];
};

export function FishRecordsScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { userPonds, signOut, autoReSignIn } = useAuth();

  const phaseOptions = useMemo(() => getPhaseOptions(), []);
  const [selectedPhase, setSelectedPhase] = useState(getCurrentProjectYearNumber());
  const [phaseModalVisible, setPhaseModalVisible] = useState(false);
  const [mode, setMode] = useState<AppMode>('fish');
  const [isLoading, setIsLoading] = useState(true);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [selectedPondId, setSelectedPondId] = useState<string | null>(null);
  const [pondModalVisible, setPondModalVisible] = useState(false);

  const periods = useMemo(() => mode === 'fish' ? FISH_PERIODS : BIRD_PERIODS, [mode]);
  const category: SubmissionCategory = useMemo(() => mode === 'fish' ? '魚塘相片' : '雀鳥相片', [mode]);
  const title = useMemo(() => mode === 'fish' ? '魚塘記錄' : '雀鳥記錄', [mode]);

  // 选择第一个魚塘作为默认值
  useEffect(() => {
    if (userPonds.length > 0 && !selectedPondId) {
      setSelectedPondId(userPonds[0].id);
    }
  }, [userPonds, selectedPondId]);

  // 获取所有提交记录
  useEffect(() => {
    const load = async () => {
      if (!selectedPondId) return;

      const range = getPhaseDateRange(selectedPhase);
      setIsLoading(true);
      try {
        const data = await fetchSubmissions({
          category,
          pondFilter: selectedPondId,
          periodFilter: 'all',
          startIso: range?.startIso,
          endIso: range?.endIso,
        });
        setAllSubmissions(data || []);
      } catch (e: unknown) {
        await handleAuthError(e, autoReSignIn, signOut, async () => {
          const range = getPhaseDateRange(selectedPhase);
          const data = await fetchSubmissions({
            category,
            pondFilter: selectedPondId || undefined,
            periodFilter: 'all',
            startIso: range?.startIso,
            endIso: range?.endIso,
          });
          setAllSubmissions(data || []);
        });
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [category, selectedPondId, selectedPhase, signOut]);

  // 计算每个阶段的状态
  const periodStatuses = useMemo<PeriodStatus[]>(() => {
    return periods.map((period) => {
      const submissions = allSubmissions.filter((s) => s.period === period.id);
      const hasUploaded = submissions.length > 0;
      const isApproved = submissions.length > 0 && submissions.every((s) => s.payment_status === 'approved');

      return {
        period,
        hasUploaded,
        isApproved,
        submissions,
      };
    });
  }, [periods, allSubmissions]);

  const selectedPond = useMemo(() =>
    userPonds.find((p) => p.id === selectedPondId),
    [userPonds, selectedPondId]
  );

  const statusBarHeight = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : insets.top;

  const viewPeriodSubmissions = (periodId: string) => {
    if (mode === 'fish') {
      navigation.navigate('FishGallery', {
        pondId: selectedPondId || undefined,
        periodId: periodId
      });
    } else {
      navigation.navigate('BirdGallery', {
        pondId: selectedPondId || undefined,
        periodId: periodId
      });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="rgba(0, 153, 153)" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: statusBarHeight + 16 }]}>
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Main', { screen: 'Records' });
            }
          }}
          style={[styles.backButton, { marginTop: statusBarHeight + 16 }]}
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

      <ScrollView style={styles.content}>
        {/* 魚塘选择 */}
        <View style={styles.section}>
          <Pressable style={styles.pondSelector} onPress={() => setPondModalVisible(true)}>
            <Text style={styles.pondSelectorText}>
              {selectedPond?.pond_id || '請選擇魚塘'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#6B7280" />
          </Pressable>
        </View>

        {/* 类别标题 */}
        <View style={styles.section}>
          <Text style={styles.categoryTitle}>{category}</Text>
        </View>

        {/* 阶段时间范围 */}
        <View style={styles.section}>
          <Pressable style={styles.phaseSelector} onPress={() => setPhaseModalVisible(true)}>
            <Text style={styles.phaseSelectorText}>
              {phaseOptions.find((p) => p.phase === selectedPhase)?.label || getCurrentPhaseLabel()}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#6B7280" />
          </Pressable>
        </View>

        {/* 阶段状态表格 */}
        <View style={styles.tableContainer}>
          {/* 表头 */}
          <View style={styles.tableHeader}>
            <View style={styles.tableCol1}>
              <Text style={styles.tableHeaderText}>降水工作{'\n'}階段相片</Text>
            </View>
            <View style={styles.tableCol2}>
              <Text style={styles.tableHeaderText}>上傳{'\n'}完成</Text>
            </View>
            <View style={styles.tableCol3}>
              <Text style={styles.tableHeaderText}>審核{'\n'}完成</Text>
            </View>
            <View style={styles.tableCol4}>
              <Text style={styles.tableHeaderText}>檢視</Text>
            </View>
          </View>

          {/* 表格内容 */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator />
            </View>
          ) : (
            periodStatuses.map((status, index) => (
              <View key={status.period.id}>
                <View style={styles.tableRow}>
                  <View style={styles.tableCol1}>
                    <Text style={styles.tableCellText}>{status.period.label}</Text>
                  </View>
                  <View style={styles.tableCol2}>
                    {status.hasUploaded ? (
                      <View style={styles.checkCircle}>
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={styles.emptyCircle} />
                    )}
                  </View>
                  <View style={styles.tableCol3}>
                    {status.isApproved ? (
                      <View style={styles.checkCircle}>
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={styles.emptyCircle} />
                    )}
                  </View>
                  <View style={styles.tableCol4}>
                    <Pressable
                      style={[styles.viewButton, !status.hasUploaded && styles.viewButtonDisabled]}
                      onPress={() => viewPeriodSubmissions(status.period.id)}
                      disabled={!status.hasUploaded}
                    >
                      <Ionicons
                        name="search"
                        size={20}
                        color={status.hasUploaded ? "#065F46" : "#D1D5DB"}
                      />
                    </Pressable>
                  </View>
                </View>
                {/* 水平分隔线 */}
                {index < periodStatuses.length - 1 && (
                  <View style={styles.horizontalDivider} />
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* 魚塘选择 Modal */}
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
            data={userPonds}
            keyExtractor={(p) => p.id}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const active = item.id === selectedPondId;
              return (
                <Pressable
                  style={[styles.modalItem, active && styles.modalItemActive]}
                  onPress={() => {
                    setSelectedPondId(item.id);
                    setPondModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>
                    {item.pond_id}
                  </Text>
                  {active && <Ionicons name="checkmark" size={20} color="#059669" />}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      {/* 項目年度選擇 Modal */}
      <Modal visible={phaseModalVisible} animationType="slide" onRequestClose={() => setPhaseModalVisible(false)}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇項目年度</Text>
            <Pressable onPress={() => setPhaseModalVisible(false)}>
              <Text style={styles.modalClose}>關閉</Text>
            </Pressable>
          </View>

          <FlatList
            data={phaseOptions}
            keyExtractor={(p) => String(p.phase)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const active = item.phase === selectedPhase;
              return (
                <Pressable
                  style={[styles.modalItem, active && styles.modalItemActive]}
                  onPress={() => {
                    setSelectedPhase(item.phase);
                    setPhaseModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>
                    {item.label}
                  </Text>
                  {active && <Ionicons name="checkmark" size={20} color="#059669" />}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

      {/* 固定的 Tab Bar */}
      <FixedTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

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

  content: {
    flex: 1,
  },

  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  pondSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  pondSelectorText: {
    fontSize: 16,
    color: '#111827',
  },

  phaseSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  phaseSelectorText: {
    fontSize: 16,
    color: '#065F46',
    fontWeight: '600',
  },

  categoryTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },

  phaseInfo: {
    fontSize: 14,
    color: '#6B7280',
  },

  tableContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 2,
    borderBottomColor: '#D1D5DB',
    minHeight: 48,
  },
  tableCol1: {
    flex: 2,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#D1D5DB',
  },
  tableCol2: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#D1D5DB',
  },
  tableCol3: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#D1D5DB',
  },
  tableCol4: {
    width: 60,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },

  tableRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    minHeight: 48,
  },
  tableCellText: {
    fontSize: 14,
    color: '#111827',
  },

  horizontalDivider: {
    height: 1,
    backgroundColor: '#D1D5DB',
    width: '100%',
  },

  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1D5DB',
  },

  viewButton: {
    padding: 4,
  },
  viewButtonDisabled: {
    opacity: 0.5,
  },

  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },

  // Modal styles
  modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 16, color: '#059669', fontWeight: '600' },
  sep: { height: 1, backgroundColor: '#E5E7EB' },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  modalItemActive: { backgroundColor: '#F0FDF4' },
  modalItemText: { fontSize: 16, color: '#111827' },
  modalItemTextActive: { color: '#059669', fontWeight: '600' },
});
