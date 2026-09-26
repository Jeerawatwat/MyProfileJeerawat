import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';

import { CustomTabList, TabButton } from './app-tabs.web';

// Web counterpart to manager-tabs.tsx. Expo chooses this custom tab bar on
// web and the platform-native bar on Android/iOS.
export default function ManagerTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="manager-dashboard" href="/manager/dashboard" asChild>
            <TabButton icon="📊">ภาพรวม</TabButton>
          </TabTrigger>
          <TabTrigger name="manager-reports" href="/manager/reports" asChild>
            <TabButton icon="📑">รายงาน</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="👤">บัญชี</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}
