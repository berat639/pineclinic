export interface DailyShiftTemplate {
  id: string
  name: string
  start: number
  end: number
  color?: string
}

export interface WeeklyDayPlan {
  active: boolean // true = çalışıyor, false = izinli
  startTime: string
  endTime: string
  templateName?: string
}

export interface WeeklyShiftTemplate {
  id: string
  name: string
  description?: string
  days: {
    0: WeeklyDayPlan // Pazartesi
    1: WeeklyDayPlan // Salı
    2: WeeklyDayPlan // Çarşamba
    3: WeeklyDayPlan // Perşembe
    4: WeeklyDayPlan // Cuma
    5: WeeklyDayPlan // Cumartesi
    6: WeeklyDayPlan // Pazar
  }
}

export interface MonthlyShiftTemplate {
  id: string
  name: string
  description?: string
  mode: 'weekly_rotation' | 'rule_based'
  weeklyRotation?: [string, string, string, string] // Hafta 1, 2, 3, 4 için weekly template id
  weekdayShift?: { active: boolean; startTime: string; endTime: string; shiftType: string }
  saturdayShift?: { active: boolean; startTime: string; endTime: string; shiftType: string }
  sundayShift?: { active: boolean; startTime: string; endTime: string; shiftType: string }
}

export const DEFAULT_DAILY_TEMPLATES: DailyShiftTemplate[] = [
  { id: 'dt-1', name: 'Sabahçı', start: 9, end: 19, color: '#3b82f6' },
  { id: 'dt-2', name: 'Öğlenci', start: 12, end: 20, color: '#f59e0b' },
  { id: 'dt-3', name: 'Tam Gün', start: 9, end: 20, color: '#10b981' },
  { id: 'dt-4', name: 'Nöbetçi', start: 18, end: 24, color: '#8b5cf6' },
]

export const DEFAULT_WEEKLY_TEMPLATES: WeeklyShiftTemplate[] = [
  {
    id: 'wt-1',
    name: 'Standart Hafta İçi (Pzt-Cum Sabah, Cmt Öğlen)',
    description: 'Pazartesi-Cuma 09:00-19:00, Cumartesi 12:00-20:00, Pazar İzinli',
    days: {
      0: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      1: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      2: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      3: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      4: { active: true, startTime: '09:00', endTime: '19:00', templateName: 'Sabahçı' },
      5: { active: true, startTime: '12:00', endTime: '20:00', templateName: 'Öğlenci' },
      6: { active: false, startTime: '09:00', endTime: '18:00', templateName: 'İzinli' },
    }
  },
  {
    id: 'wt-2',
    name: 'Tam Zamanlı Klinik (Pzt-Cmt Tam Gün)',
    description: 'Pazartesi-Cumartesi 09:00-20:00, Pazar İzinli',
    days: {
      0: { active: true, startTime: '09:00', endTime: '20:00', templateName: 'Tam Gün' },
      1: { active: true, startTime: '09:00', endTime: '20:00', templateName: 'Tam Gün' },
      2: { active: true, startTime: '09:00', endTime: '20:00', templateName: 'Tam Gün' },
      3: { active: true, startTime: '09:00', endTime: '20:00', templateName: 'Tam Gün' },
      4: { active: true, startTime: '09:00', endTime: '20:00', templateName: 'Tam Gün' },
      5: { active: true, startTime: '09:00', endTime: '20:00', templateName: 'Tam Gün' },
      6: { active: false, startTime: '09:00', endTime: '18:00', templateName: 'İzinli' },
    }
  },
  {
    id: 'wt-3',
    name: 'Öğlenci & Nöbetçi Planı (Pzt-Cmt Öğlen)',
    description: 'Pazartesi-Cumartesi 12:00-20:00, Pazar İzinli',
    days: {
      0: { active: true, startTime: '12:00', endTime: '20:00', templateName: 'Öğlenci' },
      1: { active: true, startTime: '12:00', endTime: '20:00', templateName: 'Öğlenci' },
      2: { active: true, startTime: '12:00', endTime: '20:00', templateName: 'Öğlenci' },
      3: { active: true, startTime: '12:00', endTime: '20:00', templateName: 'Öğlenci' },
      4: { active: true, startTime: '12:00', endTime: '20:00', templateName: 'Öğlenci' },
      5: { active: true, startTime: '12:00', endTime: '20:00', templateName: 'Öğlenci' },
      6: { active: false, startTime: '09:00', endTime: '18:00', templateName: 'İzinli' },
    }
  }
]

export const DEFAULT_MONTHLY_TEMPLATES: MonthlyShiftTemplate[] = [
  {
    id: 'mt-1',
    name: 'Aylık Standart Plan (4 Hafta Standart Düzen)',
    description: 'Tüm ay boyunca Standart Hafta İçi düzenini uygular.',
    mode: 'weekly_rotation',
    weeklyRotation: ['wt-1', 'wt-1', 'wt-1', 'wt-1'],
  },
  {
    id: 'mt-2',
    name: 'Dönüşümlü 2+2 Hafta (Sabahçı / Öğlenci)',
    description: '1. ve 3. Hafta Sabahçı, 2. ve 4. Hafta Öğlenci çalışma düzeni.',
    mode: 'weekly_rotation',
    weeklyRotation: ['wt-1', 'wt-3', 'wt-1', 'wt-3'],
  },
  {
    id: 'mt-3',
    name: 'Kural Tabanlı Tam Zamanlı Ay',
    description: 'Hafta içi 09:00-19:00, Cumartesi 10:00-17:00, Pazar İzinli',
    mode: 'rule_based',
    weekdayShift: { active: true, startTime: '09:00', endTime: '19:00', shiftType: 'Sabahçı' },
    saturdayShift: { active: true, startTime: '10:00', endTime: '17:00', shiftType: 'Cumartesi' },
    sundayShift: { active: false, startTime: '09:00', endTime: '18:00', shiftType: 'İzinli' },
  }
]

export const DAY_NAMES_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
export const DAY_SHORT_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
