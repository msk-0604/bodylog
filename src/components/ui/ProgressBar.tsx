import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion, radius, useTheme } from '@/theme';

export type ProgressBarProps = {
  progress: number;
  color?: string;
  height?: number;
};

export function ProgressBar({ progress, color, height = 8 }: ProgressBarProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const clamped = Math.min(Math.max(progress, 0), 1);
  const value = useSharedValue(reduceMotion ? clamped : 0);

  useEffect(() => {
    value.value = reduceMotion
      ? clamped
      : withTiming(clamped, { duration: motion.slow, easing: Easing.out(Easing.cubic) });
  }, [clamped, reduceMotion, value]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));

  return (
    <View
      style={[styles.track, { height, backgroundColor: colors.track }]}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[styles.fill, { backgroundColor: color ?? colors.accent }, fillStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
