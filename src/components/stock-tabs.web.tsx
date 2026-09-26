import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';

import { CustomTabList, TabButton } from './app-tabs.web';

// Warehouse / Stock role tabs (Web) — คลังสินค้า, ประวัติสต็อก, บัญชี
export default function StockTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="stock-inventory" href="/stock/inventory" asChild>
            <TabButton icon="📦">คลังสินค้า</TabButton>
          </TabTrigger>
          <TabTrigger name="stock-history" href="/stock/history" asChild>
            <TabButton icon="🕒">ประวัติสต็อก</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="👤">บัญชี</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}
