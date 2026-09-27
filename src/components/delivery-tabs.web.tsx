import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';

import { CustomTabList, TabButton } from './app-tabs.web';

// Delivery role tabs (Web) — only "รายการจัดส่ง" and "บัญชี".
export default function DeliveryTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="delivery-orders" href="/delivery/orders" asChild>
            <TabButton icon="🚚">รายการจัดส่ง</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="👤">บัญชี</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}