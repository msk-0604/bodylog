export const REMINDER_KINDS = ['weigh_in', 'breakfast', 'lunch', 'dinner', 'daily_review'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type ReminderSetting = {
  kind: ReminderKind;
  enabled: boolean;
  hour: number;
  minute: number;
};

export const REMINDER_INFO: Record<
  ReminderKind,
  { label: string; defaultHour: number; defaultMinute: number; title: string; body: string }
> = {
  weigh_in: {
    label: '朝の体重測定',
    defaultHour: 7,
    defaultMinute: 0,
    title: '体重を記録しましょう',
    body: '毎朝同じタイミングで測ると、変化がわかりやすくなります。',
  },
  breakfast: {
    label: '朝食の記録',
    defaultHour: 8,
    defaultMinute: 30,
    title: '朝食を記録しましょう',
    body: 'よく食べるものはお気に入りからすぐに追加できます。',
  },
  lunch: {
    label: '昼食の記録',
    defaultHour: 12,
    defaultMinute: 30,
    title: '昼食を記録しましょう',
    body: '食べたものを忘れないうちに記録しておきましょう。',
  },
  dinner: {
    label: '夕食の記録',
    defaultHour: 19,
    defaultMinute: 30,
    title: '夕食を記録しましょう',
    body: 'テンプレートを使うとまとめて記録できます。',
  },
  daily_review: {
    label: '1日の振り返り',
    defaultHour: 21,
    defaultMinute: 30,
    title: '今日の記録を振り返りましょう',
    body: '今日のカロリーとPFCバランスを確認できます。',
  },
};

export function defaultReminders(): ReminderSetting[] {
  return REMINDER_KINDS.map((kind) => ({
    kind,
    enabled: false,
    hour: REMINDER_INFO[kind].defaultHour,
    minute: REMINDER_INFO[kind].defaultMinute,
  }));
}

export function isValidTime(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour < 24 &&
    minute >= 0 &&
    minute < 60
  );
}

/** Steps a time by `deltaMinutes`, wrapping around midnight. */
export function stepTime(
  hour: number,
  minute: number,
  deltaMinutes: number,
): { hour: number; minute: number } {
  const total = (((hour * 60 + minute + deltaMinutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export const formatTime = (hour: number, minute: number) =>
  `${hour}:${String(minute).padStart(2, '0')}`;
