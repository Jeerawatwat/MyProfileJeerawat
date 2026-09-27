import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// Delivery home is now directly at /delivery/orders
export default function DeliveryDashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/delivery/orders');
  }, [router]);
  return null;
}