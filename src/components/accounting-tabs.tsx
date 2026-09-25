import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

// Accounting-role bottom tabs (native). Same "only two dedicated tab icons
// ship with this project" situation as app-tabs.tsx — the web tab bar
// (accounting-tabs.web.tsx) is the primary target and has its own icons.
export default function AccountingTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="accounting">
        <NativeTabs.Trigger.Label>รายงาน</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/home.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="accounting-orders">
        <NativeTabs.Trigger.Label>ออเดอร์</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/explore.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="accounting-payments">
        <NativeTabs.Trigger.Label>ชำระเงิน</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/explore.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="accounting-refunds">
        <NativeTabs.Trigger.Label>คืนเงิน</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/explore.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="accounting-expenses">
        <NativeTabs.Trigger.Label>รับ/จ่าย</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/explore.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>บัญชี</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/home.png')} renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
