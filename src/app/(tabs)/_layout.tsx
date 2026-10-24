import { Tabs } from 'expo-router/js-tabs';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeIcon, MealIcon, PersonIcon, RecordIcon } from '@/components/icons';
import { useTheme } from '@/theme';

const TAB_ICON_SIZE = 22;
/**
 * The default bar (49pt + inset) leaves ~11pt for the label under the 28pt icon box,
 * which clips Japanese glyphs. Add a little room; the bottom inset is still applied as padding.
 */
const TAB_BAR_HEIGHT = 56;

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarHideOnKeyboard: Platform.OS === 'android',
        tabBarLabelStyle: styles.label,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: TAB_BAR_HEIGHT + insets.bottom,
        },
        sceneStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: ({ color }) => <HomeIcon color={color} size={TAB_ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          title: '食事',
          tabBarButtonTestID: 'tab-meals',
          tabBarIcon: ({ color }) => <MealIcon color={color} size={TAB_ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: '記録',
          tabBarButtonTestID: 'tab-records',
          tabBarIcon: ({ color }) => <RecordIcon color={color} size={TAB_ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: 'マイページ',
          tabBarButtonTestID: 'tab-mypage',
          tabBarIcon: ({ color }) => <PersonIcon color={color} size={TAB_ICON_SIZE} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
});
