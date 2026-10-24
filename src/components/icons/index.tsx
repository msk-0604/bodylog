import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconProps = { size?: number; color: ColorValue; strokeWidth?: number };

/** Line icons on a 24×24 grid, 1.8 stroke, round caps — decorative (hidden from screen readers). */
function Base({
  size = 24,
  color,
  strokeWidth = 1.8,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="M3.5 10.5 12 3.8l8.5 6.7" />
    <Path d="M5.5 9v10.2c0 .6.4 1 1 1H10v-5.5h4v5.5h3.5c.6 0 1-.4 1-1V9" />
  </Base>
);

export const MealIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="M3.5 12h17" />
    <Path d="M4.5 12a7.5 7.5 0 0 0 15 0" />
    <Path d="M9 20h6" />
    <Path d="M9 8.5c0-1.2 1-1.5 1-2.7S9 4.3 9 3.5" />
    <Path d="M13.5 8.5c0-1.2 1-1.5 1-2.7s-1-1.5-1-2.3" />
  </Base>
);

export const RecordIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="M4 19.5h16" />
    <Path d="M4.5 15.5 9 11l3.5 3 7-7.5" />
    <Path d="M15.5 6.5h4v4" />
  </Base>
);

export const PersonIcon = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={12} cy={8.5} r={4} />
    <Path d="M4.5 20.5c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5" />
  </Base>
);

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="M12 5v14M5 12h14" />
  </Base>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </Base>
);

export const ScaleIcon = (p: IconProps) => (
  <Base {...p}>
    <Rect x={3.5} y={3.5} width={17} height={17} rx={4.5} />
    <Path d="M8.5 9.5a5 5 0 0 1 7 0" />
    <Path d="m12 11.5 1.5-2" />
  </Base>
);

export const FlameIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="M12 21c3.9 0 6.5-2.6 6.5-6.2 0-3.8-3-6.1-4.2-9.8-2.6 1.5-3.6 4-3.3 6.3-1-.5-1.8-1.5-2-2.8C7.3 10 5.5 12.3 5.5 14.8 5.5 18.4 8.1 21 12 21Z" />
  </Base>
);

export const DumbbellIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="M8 12h8" />
    <Rect x={4.5} y={7.5} width={3.5} height={9} rx={1.2} />
    <Rect x={16} y={7.5} width={3.5} height={9} rx={1.2} />
    <Path d="M2.5 10v4M21.5 10v4" />
  </Base>
);

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={10.5} cy={10.5} r={6.5} />
    <Path d="m15.5 15.5 5 5" />
  </Base>
);

export const StarIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.8Z" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <Circle cx={12} cy={12} r={8.5} />
    <Path d="M12 7.5V12l3 2" />
  </Base>
);

export const LayersIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" />
    <Path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
    <Path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
  </Base>
);

export const LockIcon = (p: IconProps) => (
  <Base {...p}>
    <Rect x={5} y={10.5} width={14} height={10} rx={2.5} />
    <Path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Base>
);

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <Path d="m6 6 12 12M18 6 6 18" />
  </Base>
);
