import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Card, LoadingView, ModalScreen, SwitchRow, TimeStepper } from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import { saveReminder } from '@/data/repo/settings';
import { formatTime, REMINDER_INFO, type ReminderSetting } from '@/domain/reminders';
import { useReminders } from '@/features/exercise/hooks';
import {
  applyReminders,
  ensureNotificationPermission,
  notificationsSupported,
  openSystemSettings,
} from '@/features/notifications/scheduler';
import { spacing } from '@/theme';

/** Per-reminder on/off and time. Settings are stored on this device only. */
export default function NotificationsScreen() {
  const { data } = useReminders();
  if (!data) return <LoadingView />;
  return <NotificationsForm initial={data} />;
}

function NotificationsForm({ initial }: { initial: ReminderSetting[] }) {
  const [settings, setSettings] = useState(initial);
  const supported = notificationsSupported();

  const commit = async (next: ReminderSetting) => {
    const all = settings.map((s) => (s.kind === next.kind ? next : s));
    setSettings(all);
    await writeLocal((db) => saveReminder(db, next));
    await applyReminders(all).catch(() => {});
  };

  const toggle = async (s: ReminderSetting, enabled: boolean) => {
    if (enabled) {
      const perm = await ensureNotificationPermission();
      if (perm !== 'granted') {
        Alert.alert(
          '通知がオフになっています',
          'リマインダーを受け取るには、端末の設定でBODYLOGの通知を許可してください。',
          [
            { text: 'あとで', style: 'cancel' },
            { text: '設定を開く', onPress: () => void openSystemSettings() },
          ],
        );
        return;
      }
    }
    await commit({ ...s, enabled });
  };

  return (
    <ModalScreen title="通知設定" cancelLabel="閉じる" testID="notifications-screen">
      {!supported ? (
        <AppText variant="subhead" color="textSecondary">
          この環境では通知を利用できません。iPhone・Androidのアプリでご利用ください。
        </AppText>
      ) : null}
      {settings.map((s) => {
        const info = REMINDER_INFO[s.kind];
        return (
          <Card key={s.kind} style={styles.card}>
            <SwitchRow
              title={info.label}
              subtitle={s.enabled ? `毎日 ${formatTime(s.hour, s.minute)}` : 'オフ'}
              value={s.enabled}
              onValueChange={(v) => void toggle(s, v)}
              disabled={!supported}
              testID={`reminder-switch-${s.kind}`}
            />
            {s.enabled ? (
              <View style={styles.time}>
                <TimeStepper
                  label={`${info.label}の時刻`}
                  hour={s.hour}
                  minute={s.minute}
                  onChange={(t) => void commit({ ...s, ...t })}
                  testID={`reminder-time-${s.kind}`}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
      <AppText variant="caption" color="textTertiary">
        通知の設定はこの端末にのみ保存されます。ログアウトすると通知は停止します。通知が届かない場合は、端末の設定でBODYLOGの通知が許可されているかご確認ください。
      </AppText>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, paddingVertical: spacing.sm },
  time: { paddingBottom: spacing.sm },
});
