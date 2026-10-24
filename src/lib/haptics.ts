import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback helpers. Failures (unsupported device, web) are ignored —
 * haptics are an enhancement only.
 */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  selection() {
    if (enabled) Haptics.selectionAsync().catch(() => {});
  },
  light() {
    if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  success() {
    if (enabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  },
  warning() {
    if (enabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  },
};
