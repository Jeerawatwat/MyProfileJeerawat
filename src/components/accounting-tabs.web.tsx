// src/components/accounting-tabs.web.tsx
// Bottom navigation for the "accounting" role — Reports / Orders / Payments /
// Refunds / Income-Expenses / Account. Same structure and look as
// app-tabs.web.tsx (Admin) and user-tabs.web.tsx (User); reuses their
// TabButton/CustomTabList so all three tab bars stay identical in style.
// Only ever rendered for role === 'accounting' — see _layout.tsx's AuthGate.
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';

import { CustomTabList, TabButton } from './app-tabs.web';

export default function AccountingTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="accounting" href="/accounting" asChild>
            <TabButton icon="📊">รายงาน</TabButton>
          </TabTrigger>
          <TabTrigger name="accounting-orders" href="/accounting-orders" asChild>
            <TabButton icon="🧾">ออเดอร์</TabButton>
          </TabTrigger>
          <TabTrigger name="accounting-payments" href="/accounting-payments" asChild>
            <TabButton icon="💳">ชำระเงิน</TabButton>
          </TabTrigger>
          <TabTrigger name="accounting-refunds" href="/accounting-refunds" asChild>
            <TabButton icon="↩️">คืนเงิน</TabButton>
          </TabTrigger>
          <TabTrigger name="accounting-expenses" href="/accounting-expenses" asChild>
            <TabButton icon="💰">รับ/จ่าย</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="👤">บัญชี</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}
