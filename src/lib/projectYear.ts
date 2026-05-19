/**
 * 根據當前日期自動計算項目年度資訊
 *
 * 年度對照表：
 * - 第一期：2025年2月至2026年1月
 * - 第二期：2026年2月至2027年1月
 * - 第三期：2027年2月至2028年1月
 */

export const PHASE_INFO: Record<number, { label: string; yearStart: number; yearEnd: number }> = {
  1: { label: '第一期', yearStart: 2025, yearEnd: 2026 },
  2: { label: '第二期', yearStart: 2026, yearEnd: 2027 },
  3: { label: '第三期', yearStart: 2027, yearEnd: 2028 },
};

export type PhaseOption = { phase: number; label: string; startIso: string; endIso: string };

export function getPhaseOptions(): PhaseOption[] {
  return Object.entries(PHASE_INFO).map(([phase, info]) => ({
    phase: Number(phase),
    label: `${info.label}（${info.yearStart}年3月至${info.yearEnd}年2月）`,
    startIso: `${info.yearStart}-03-01T00:00:00`,
    endIso: `${info.yearEnd}-02-28T23:59:59`,
  }));
}

export function getPhaseDateRange(phase: number): { startIso: string; endIso: string } | null {
  const info = PHASE_INFO[phase];
  if (!info) return null;
  return {
    startIso: `${info.yearStart}-03-01T00:00:00`,
    endIso: `${info.yearEnd}-02-28T23:59:59`,
  };
}

// 魚塘階段選項（降水工作流程）
export type PeriodOption = { id: string; label: string };

const FISH_PERIODS_CORE: PeriodOption[] = [
  { id: 'before_drawdown', label: '降水前' },
  { id: 'after_basic_day1', label: '基本降水後第1天' },
  { id: 'after_drying_day1', label: '乾塘後第1天' },
  { id: 'after_basic_day7', label: '基本降水後第7天' },
  { id: 'after_drying_day7', label: '乾塘後第7天' },
];

// 雀鳥階段選項
const BIRD_PERIODS_CORE: PeriodOption[] = [
  { id: 'non_drawdown_drying', label: '非降水乾塘時' },
  { id: 'after_drying', label: '乾塘後' },
  { id: 'after_basic', label: '基本降水後' },
];

function getCurrentProjectYear(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  // 根據 API 通知的規則：
  // 2026/03 之前 → project_year = 1
  // 2026/03 ~ 2027/02 → project_year = 2
  // 2027/03 之後 → project_year = 3
  const phase = month >= 3 ? year - 2024 : year - 2025;
  return Math.min(Math.max(phase, 1), 3);
}

export function getCurrentPhaseLabel(): string {
  const phase = getCurrentProjectYear();
  const info = PHASE_INFO[phase];
  return `${info.label}（${info.yearStart}年3月至${info.yearEnd}年2月）`;
}

export function getCurrentProjectYearNumber(): number {
  return getCurrentProjectYear();
}

/**
 * 獲取魚塘階段選項（帶項目年度標籤）
 * 根據當前階段動態顯示所有階段
 */
export function getFishPeriodsWithYearLabel(): PeriodOption[] {
  const currentPhase = getCurrentProjectYear();
  const result: PeriodOption[] = [];

  // 顯示所有階段：1, 2, 3
  for (let phase = 1; phase <= 3; phase++) {
    const info = PHASE_INFO[phase];
    FISH_PERIODS_CORE.forEach((period) => {
      result.push({
        id: `phase${phase}_${period.id}`,
        label: `${info.label} - ${period.label}`,
      });
    });
  }

  return result;
}

/**
 * 獲取雀鳥階段選項（帶項目年度標籤）
 */
export function getBirdPeriodsWithYearLabel(): PeriodOption[] {
  const result: PeriodOption[] = [];

  for (let phase = 1; phase <= 3; phase++) {
    const info = PHASE_INFO[phase];
    BIRD_PERIODS_CORE.forEach((period) => {
      result.push({
        id: `phase${phase}_${period.id}`,
        label: `${info.label} - ${period.label}`,
      });
    });
  }

  return result;
}

/**
 * 獲取魚塘原始階段選項（不帶年度標籤）
 */
export function getFishPeriods(): PeriodOption[] {
  return FISH_PERIODS_CORE;
}

/**
 * 獲取雀鳥原始階段選項（不帶年度標籤）
 */
export function getBirdPeriods(): PeriodOption[] {
  return BIRD_PERIODS_CORE;
}
