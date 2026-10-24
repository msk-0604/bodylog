import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  LoadingView,
  ModalScreen,
  SwitchRow,
  TimeStepper,
} from '@/components/ui';
import { writeLocal } from '@/data/hooks';
import { saveReminder, savePreferences } from '@/data/repo/settings';
import { formatTime, REMINDER_INFO, type ReminderSetting } from '@/domain/reminders';
import { describeReminder, deviceTimeZone, type WeighInReminder } from '@/domain/weighIn';
import { usePreferences, useReminders } from '@/features/exercise/hooks';
import { useRecordedToday } from '@/features/notifications/useWeighIn';
import { registerPushToken } from '@/features/notifications/weighIn';
import { isLocalMode } from '@/lib/config';
import {
  applyReminders,
  ensureNotificationPermission,
  notificationsSupported,
  openSystemSettings,
} from '@/features/notifications/scheduler';
import { spacing } from '@/theme';

/**
 * Weigh-in reminder (server push, synced between devices) + local meal / review reminders
 * (this device only).
 */
export default function NotificationsScreen() {
  const { data } = useReminders();
  const prefs = usePreferences().data;
  if (!data || !prefs) return <LoadingView />;
  return <NotificationsForm initial={data} initialWeighIn={prefs.weighIn} />;
}

const DENIED_TITLE = '通知がオフになっています';
const DENIED_BODY = 'リマインダーを受け取るには、端末の設定でBODYLOGの通知を許可してください。';

function askToOpenSettings() {
  Alert.alert(DENIED_TITLE, DENIED_BODY, [
    { text: 'あとで', style: 'cancel' },
    { text: '設定を開く', onPress: () => void openSystemSettings() },
  ]);
}

function useNotificationPermission() {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    if (!notificationsSupported()) return;
    let alive = true;
    void Notifications.getPermissionsAsync()
      .then((p) => alive && setGranted(p.granted))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return [granted, setGranted] as const;
}

function WeighInSection({ initial }: { initial: WeighInReminder }) {
  const [reminder, setReminder] = useState(initial);
  const [granted, setGranted] = useNotificationPermission();
  const recorded = useRecordedToday().data;
  const supported = notificationsSupported();
  const local = isLocalMode();

  const save = async (next: WeighInReminder) => {
    setReminder(next);
    await writeLocal((db, uid) =>
      savePreferences(db, uid, { weighIn: next, timeZone: deviceTimeZone() }),
    );
  };

  const toggle = async (enabled: boolean) => {
    // Saved even without permission: other devices of the account and the in-app prompt
    // still work; this device just can't show the notification.
    await save({ ...reminder, enabled });
    if (!enabled || !supported) return;
    const perm = await ensureNotificationPermission();
    setGranted(perm === 'granted');
    if (perm === 'granted') void registerPushToken();
    else askToOpenSettings();
  };

  return (
    <Card style={styles.card} testID="weigh-in-card">
      <SwitchRow
        title="体重の記録リマインダー"
        subtitle={describeReminder(reminder)}
        value={reminder.enabled}
        onValueChange={(v) => void toggle(v)}
        testID="weigh-in-switch"
      />
      {reminder.enabled ? (
        <View style={styles.time}>
          <TimeStepper
            label="体重の記録リマインダーの時刻"
            hour={reminder.hour}
            minute={reminder.minute}
            minuteStep={5}
            onChange={(t) => void save({ ...reminder, ...t })}
            testID="weigh-in-time"
          />
        </View>
      ) : null}
      {recorded !== undefined ? (
        <AppText
          variant="subhead"
          color={recorded ? 'success' : 'textSecondary'}
          testID="weigh-in-today"
        >
          {recorded
            ? '今日の体重：記録済み（今日は通知されません）'
            : '今日の体重：まだ記録されていません'}
        </AppText>
      ) : null}
      {reminder.enabled && supported && granted === false ? (
        <View style={styles.warning} testID="weigh-in-permission-warning">
          <AppText variant="footnote" color="warning">
            この端末では通知が許可されていないため、お知らせは届きません。今日の記録状況はこの画面とホームで確認できます。
          </AppText>
          <Button
            label="端末の設定を開く"
            variant="secondary"
            size="md"
            onPress={() => void openSystemSettings()}
          />
        </View>
      ) : null}
      <AppText variant="caption" color="textTertiary">
        設定した時刻に、今日の体重がまだ記録されていない場合だけ、1日1回お知らせします。この設定は同じアカウントの端末で共有されます。オフラインで記録した体重は同期されるまでサーバーに届かないため、その間にお知らせが届くことがあります。
        {local ? '（開発用ローカルモードでは通知は送信されず、アプリ内の表示のみです）' : ''}
      </AppText>
    </Card>
  );
}

function NotificationsForm({
  initial,
  initialWeighIn,
}: {
  initial: ReminderSetting[];
  initialWeighIn: WeighInReminder;
}) {
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
        askToOpenSettings();
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
      <WeighInSection initial={initialWeighIn} />
      <AppText variant="footnote" color="textSecondary" style={styles.groupLabel}>
        食事と振り返り（この端末のみ）
      </AppText>
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
        食事と振り返りの通知の設定はこの端末にのみ保存されます。ログアウトすると通知は停止します。通知が届かない場合は、端末の設定でBODYLOGの通知が許可されているかご確認ください。
      </AppText>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, paddingVertical: spacing.sm },
  time: { paddingBottom: spacing.sm },
  warning: { gap: spacing.sm },
  groupLabel: { marginTop: spacing.md },
});
