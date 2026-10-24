import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { motion } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Trigger a light selection haptic on press. */
  haptic?: boolean;
  scaleTo?: number;
};

/**
 * Pressable with a subtle scale-down feedback. Respects the OS "Reduce Motion" setting
 * (falls back to an opacity change).
 */
export function PressableScale({
  style,
  haptic = false,
  scaleTo = motion.pressScale,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: 1 - pressed.value * 0.3 }
      : { transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }] },
  );

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: motion.fast });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: motion.fast });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) haptics.selection();
        onPress?.(e);
      }}
      style={[style, animatedStyle, disabled && { opacity: 0.45 }]}
    />
  );
}
