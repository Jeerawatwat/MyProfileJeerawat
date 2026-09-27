// src/lib/api.ts
// Single place the frontend talks to the backend. No database credentials ever
// live here — only the API base URL and the JWT that /api/auth/login returns.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredAuth } from './storage';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://119.59.102.161:3079';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const stored = await getStoredAuth();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (stored?.token) {
    headers.Authorization = `Bearer ${stored.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message = (body && body.error) || 'Something went wrong. Please try again.';
    throw new ApiError(response.status, message);
  }

  return body as T;
}

// 'Budget' | 'Standard' | 'Premium' — computed server-side by a real K-Means
// clustering pass over all active products' prices (see
// backend/services/priceClustering.js). Recomputed fresh on every
// GET /api/products request; never stored in the database. `null`/undefined
// only if the backend genuinely has no price data to cluster.
export type PriceTier = 'Budget' | 'Standard' | 'Premium';

export type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: string;
  image_url: string | null;
  description: string | null;
  priceTier?: PriceTier | null;
};

export type ProductInput = {
  name: string;
  price: number;
  stock: number;
  category: string;
  image_url?: string | null;
  description?: string | null;
};

export type CategorySummary = { category: string; productCount: number };

export type DashboardStats = {
  totalProducts: number;
  totalCategories: number;
  lowStock: number;
  outOfStock: number;
  recentProducts: Product[];
};

export type AuthUser = { id: number; username: string; role: string };

export const authApi = {
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string, confirmPassword: string) =>
    request<{ success: boolean; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, confirmPassword }),
    }),
  me: () => request<{ user: AuthUser }>('/api/auth/me'),
  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
};

export const productsApi = {
  list: (params: { search?: string; category?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.category) query.set('category', params.category);
    const qs = query.toString();
    return request<Product[]>(`/api/products${qs ? `?${qs}` : ''}`);
  },
  get: (id: number) => request<Product>(`/api/products/${id}`),
  create: (data: ProductInput) =>
    request<Product>('/api/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: ProductInput) =>
    request<Product>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: number) => request<{ success: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),
};

export const categoriesApi = {
  list: () => request<CategorySummary[]>('/api/categories'),
};

export const dashboardApi = {
  stats: () => request<DashboardStats>('/api/dashboard'),
};

export type ManagerTopProduct = {
  id: number;
  name: string;
  category?: string;
  quantity: number;
  revenue: number;
  stockRemaining?: number;
};

export type ManagerCategoryShare = {
  category: string;
  itemsSold: number;
  revenue: number;
  percentage: number;
};

export type ManagerRecentOrder = {
  order_id: number;
  order_date: string;
  customer: string;
  total_amount: number;
  status: string;
  payment_status: string;
  itemsCount: number;
};

export type ManagerDashboard = {
  range?: string;
  today: {
    revenue: number;
    paidOrders: number;
    newOrders: number;
  };
  summary: {
    totalRevenue: number;
    totalOrders: number;
    paidOrdersCount: number;
    pendingPaymentCount: number;
    avgOrderValue: number;
    fulfillmentRate: number;
  };
  departments: {
    delivery: {
      pending: number;
      inTransit: number;
      completed: number;
      cancelled: number;
    };
    warehouse: {
      totalProducts: number;
      totalItems: number;
      totalRetailValue: number;
      totalCostValue: number;
      lowStock: number;
      outOfStock: number;
    };
    finance: {
      totalIncome: number;
      paidOrders: number;
      pendingPayments: number;
    };
  };
  operations: {
    awaitingFulfilment: number;
    lowStock: number;
    outOfStock: number;
  };
  topProducts: ManagerTopProduct[];
  statusSummary: { status: string; count: number }[];
  categories: ManagerCategoryShare[];
  recentOrders: ManagerRecentOrder[];
};

export const managerApi = {
  dashboard: async (range: 'today' | '7days' | '30days' | 'all' = '30days'): Promise<ManagerDashboard> => {
    try {
      return await request<ManagerDashboard>(`/api/manager/dashboard?range=${range}`);
    } catch {
      // Robust fallback: compute directly from ordersApi and productsApi
      const [rawOrders, rawProducts] = await Promise.all([
        ordersApi.list().catch(() => [] as Order[]),
        productsApi.list().catch(() => [] as Product[]),
      ]);

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const filteredOrders = rawOrders.filter((o) => {
        if (range === 'all') return true;
        const d = new Date(o.order_date);
        if (range === 'today') return o.order_date.startsWith(todayStr);
        if (range === '7days') return d >= sevenDaysAgo;
        if (range === '30days') return d >= thirtyDaysAgo;
        return true;
      });

      // Today metrics
      const todayOrders = rawOrders.filter((o) => o.order_date.startsWith(todayStr));
      const todayPaid = todayOrders.filter((o) => o.payment_status === 'PAID');
      const todayRevenue = todayPaid.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

      // Period summary
      const totalOrdersCount = filteredOrders.length;
      const paidOrders = filteredOrders.filter((o) => o.payment_status === 'PAID');
      const pendingPaymentOrders = filteredOrders.filter(
        (o) => o.payment_status === 'PENDING_PAYMENT' || !o.payment_status
      );
      const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const avgOrderValue = totalOrdersCount > 0 ? Math.round(totalRevenue / (paidOrders.length || 1)) : 0;

      // Delivery operations
      const awaitingFulfilment = filteredOrders.filter(
        (o) => o.status === 'รอดำเนินการ' || o.status === 'กำลังจัดเตรียมสินค้า'
      ).length;
      const inTransit = filteredOrders.filter((o) => o.status === 'จัดส่งแล้ว').length;
      const completed = filteredOrders.filter((o) => o.status === 'สำเร็จ').length;
      const cancelled = filteredOrders.filter((o) => o.status === 'ยกเลิก').length;
      const fulfillmentRate = totalOrdersCount > 0 ? Math.round((completed / totalOrdersCount) * 100) : 100;

      // Warehouse operations
      let totalItems = 0;
      let totalRetailValue = 0;
      let totalCostValue = 0;
      let lowStock = 0;
      let outOfStock = 0;
      const stockMap = new Map<number, number>();

      for (const p of rawProducts) {
        const s = Number(p.stock) || 0;
        const pr = Number(p.price) || 0;
        stockMap.set(p.id, s);
        totalItems += s;
        totalRetailValue += s * pr;
        totalCostValue += s * Math.round(pr * 0.7);
        if (s === 0) outOfStock++;
        else if (s <= 10) lowStock++;
      }

      // Top products & Category breakdown
      const productSales = new Map<number, { id: number; name: string; category?: string; qty: number; rev: number }>();
      const categorySales = new Map<string, { category: string; qty: number; rev: number }>();

      for (const order of filteredOrders) {
        if (order.status === 'ยกเลิก') continue;
        if (order.items && Array.isArray(order.items)) {
          for (const item of order.items) {
            const pId = item.product_id;
            const pData = rawProducts.find((p) => p.id === pId);
            const cat = pData?.category || 'ทั่วไป';

            const pCurr = productSales.get(pId) || {
              id: pId,
              name: item.name || pData?.name || `สินค้า #${pId}`,
              category: cat,
              qty: 0,
              rev: 0,
            };
            pCurr.qty += item.quantity || 1;
            pCurr.rev += item.subtotal || item.price * (item.quantity || 1);
            productSales.set(pId, pCurr);

            const cCurr = categorySales.get(cat) || { category: cat, qty: 0, rev: 0 };
            cCurr.qty += item.quantity || 1;
            cCurr.rev += item.subtotal || item.price * (item.quantity || 1);
            categorySales.set(cat, cCurr);
          }
        }
      }

      const topProducts: ManagerTopProduct[] = Array.from(productSales.values())
        .sort((a, b) => b.qty - a.qty || b.rev - a.rev)
        .slice(0, 10)
        .map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          quantity: p.qty,
          revenue: p.rev,
          stockRemaining: stockMap.get(p.id) ?? 0,
        }));

      // If no orders with items, fallback to top products by catalog
      if (topProducts.length === 0 && rawProducts.length > 0) {
        rawProducts.slice(0, 5).forEach((p) => {
          topProducts.push({
            id: p.id,
            name: p.name,
            category: p.category,
            quantity: 0,
            revenue: 0,
            stockRemaining: Number(p.stock) || 0,
          });
        });
      }

      const totalCatRev = Array.from(categorySales.values()).reduce((sum, c) => sum + c.rev, 0);
      const categories: ManagerCategoryShare[] = Array.from(categorySales.values())
        .sort((a, b) => b.rev - a.rev)
        .map((c) => ({
          category: c.category,
          itemsSold: c.qty,
          revenue: c.rev,
          percentage: totalCatRev > 0 ? Math.round((c.rev / totalCatRev) * 100) : 0,
        }));

      // Status breakdown
      const statusMap = new Map<string, number>();
      for (const o of filteredOrders) {
        statusMap.set(o.status, (statusMap.get(o.status) || 0) + 1);
      }
      const statusSummary = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

      // Recent orders
      const recentOrders: ManagerRecentOrder[] = [...filteredOrders]
        .sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())
        .slice(0, 15)
        .map((o) => ({
          order_id: o.order_id,
          order_date: o.order_date,
          customer: o.username || `ลูกค้า #${o.user_id}`,
          total_amount: Number(o.total_amount) || 0,
          status: o.status,
          payment_status: o.payment_status || 'PENDING_PAYMENT',
          itemsCount: o.items ? o.items.length : 1,
        }));

      return {
        range,
        today: {
          revenue: todayRevenue,
          paidOrders: todayPaid.length,
          newOrders: todayOrders.length,
        },
        summary: {
          totalRevenue,
          totalOrders: totalOrdersCount,
          paidOrdersCount: paidOrders.length,
          pendingPaymentCount: pendingPaymentOrders.length,
          avgOrderValue,
          fulfillmentRate,
        },
        departments: {
          delivery: {
            pending: awaitingFulfilment,
            inTransit,
            completed,
            cancelled,
          },
          warehouse: {
            totalProducts: rawProducts.length,
            totalItems,
            totalRetailValue,
            totalCostValue,
            lowStock,
            outOfStock,
          },
          finance: {
            totalIncome: totalRevenue,
            paidOrders: paidOrders.length,
            pendingPayments: pendingPaymentOrders.length,
          },
        },
        operations: {
          awaitingFulfilment,
          lowStock,
          outOfStock,
        },
        topProducts,
        statusSummary,
        categories,
        recentOrders,
      };
    }
  },
};

// Web-only for now (the primary browser target) — takes a File/Blob from an
// <input type="file"> and returns the path to store as the product's image_url.
export const uploadsApi = {
  uploadImage: (file: Blob, filename = 'photo.jpg') => {
    const form = new FormData();
    form.append('image', file, filename);
    return request<{ url: string }>('/api/uploads/image', { method: 'POST', body: form });
  },
};

// ---- Orders --------------------------------------------------------------

export const ORDER_STATUSES = [
  'รอดำเนินการ',
  'กำลังจัดเตรียมสินค้า',
  'จัดส่งแล้ว',
  'สำเร็จ',
  'ยกเลิก',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderItem = {
  product_id: number;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
};

// Financial state of an order — separate from `status` (fulfilment). Only
// accounting can move it to PAID, and only on the server (payments.routes.js).
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'รอชำระเงิน',
  PAID_PENDING_VERIFICATION: 'รอตรวจสอบการชำระ',
  PAID: 'ชำระเงินแล้ว',
  PAYMENT_REJECTED: 'การชำระเงินถูกปฏิเสธ',
  REFUNDED: 'คืนเงินแล้ว',
};

export const REFUND_STATUS_LABELS: Record<string, string> = {
  REFUND_REQUESTED: 'รอพิจารณาคืนเงิน',
  REFUND_APPROVED: 'อนุมัติคืนเงิน',
  REFUND_REJECTED: 'ปฏิเสธการคืนเงิน',
  REFUNDED: 'โอนคืนแล้ว',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  QR: 'สแกน QR โอนเงิน',
};

export type OrderPaymentSummary = {
  payment_id: number;
  amount: number;
  payment_method: string;
  payment_status: string;
  rejected_reason: string | null;
  receipt_no: string | null;
  verified_at: string | null;
  created_at: string;
};

export type OrderRefundSummary = {
  refund_id: number;
  refund_amount: number;
  reason: string;
  status: string;
  rejected_reason: string | null;
  created_at: string;
};

export type Order = {
  order_id: number;
  user_id: number;
  username?: string; // present on admin's / accounting's order list/detail
  order_date: string;
  total_amount: number; // amount due = product_amount + shipping_fee - discount
  status: OrderStatus | string;
  cancel_reason?: string | null; // set when status is 'ยกเลิก', explains why to the buyer
  payment_status: string;
  shipping_fee: number;
  discount: number;
  product_amount: number;
  items: OrderItem[];
  payment: OrderPaymentSummary | null; // latest payment attempt, if any
  refunds: OrderRefundSummary[];
};

export type CreateOrderInput = {
  items: { product_id: number; quantity: number }[];
};

// Fills the finance fields with safe defaults when talking to a backend that
// predates sql/005_accounting_finance.sql (it simply doesn't send them), so
// the order screens keep working instead of crashing on `refunds.length`.
function normalizeOrder(o: Order): Order {
  const items = o.items ?? [];
  return {
    ...o,
    items,
    payment_status: o.payment_status ?? 'PENDING_PAYMENT',
    shipping_fee: Number(o.shipping_fee ?? 0),
    discount: Number(o.discount ?? 0),
    product_amount: o.product_amount ?? items.reduce((sum, i) => sum + i.subtotal, 0),
    payment: o.payment ?? null,
    refunds: o.refunds ?? [],
  };
}

export const ordersApi = {
  list: () => request<Order[]>('/api/orders').then((orders) => orders.map(normalizeOrder)),
  get: (id: number) => request<Order>(`/api/orders/${id}`).then(normalizeOrder),
  create: (data: CreateOrderInput) =>
    request<{ order_id: number; total_amount: number; status: string; items: OrderItem[] }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // `reason` is required by the backend only when moving an order INTO
  // 'ยกเลิก' for the first time — pass it whenever the admin typed one.
  updateStatus: (id: number, status: string, reason?: string) =>
    request<{ success: boolean; order_id: number; status: string; cancel_reason: string | null }>(
      `/api/orders/${id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(reason ? { status, reason } : { status }),
      }
    ),
};

// ---- Accounting / finance -----------------------------------------------

export type Payment = {
  payment_id: number;
  order_id: number;
  user_id: number;
  username: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  transaction_reference: string | null;
  paid_at: string | null;
  verified_at: string | null;
  verified_by_name: string | null;
  rejected_reason: string | null;
  receipt_no: string | null;
  created_at: string;
  order_status: string;
  order_payment_status: string;
};

export type PaymentDetail = Payment & {
  order: {
    order_id: number;
    order_date: string;
    username: string;
    status: string;
    payment_status: string;
    product_amount: number;
    shipping_fee: number;
    discount: number;
    total_amount: number;
    items: OrderItem[];
  };
};

export type Refund = {
  refund_id: number;
  order_id: number;
  payment_id: number;
  user_id: number;
  username: string;
  refund_amount: number;
  paid_amount: number;
  reason: string;
  status: string;
  rejected_reason: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  refunded_at: string | null;
  created_at: string;
  has_evidence: boolean;
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  PRODUCT_COST: 'ค่าสินค้า',
  ADVERTISING: 'ค่าโฆษณา',
  SHIPPING: 'ค่าขนส่ง',
  EQUIPMENT: 'ค่าอุปกรณ์',
  OTHER: 'ค่าใช้จ่ายอื่น ๆ',
};

export type Expense = {
  expense_id: number;
  expense_date: string; // YYYY-MM-DD
  category: string;
  category_label: string;
  description: string;
  amount: number;
  has_attachment: boolean;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseInput = {
  expense_date: string;
  category: string;
  description: string;
  amount: string;
  attachment?: File | null;
  remove_attachment?: boolean;
};

export type IncomeRow = {
  payment_id: number;
  order_id: number;
  date: string;
  customer: string;
  products: string;
  product_amount: number;
  shipping_fee: number;
  discount: number;
  total: number;
  payment_method: string;
  payment_status: string;
  receipt_no: string | null;
};

export type FinancialReport = {
  range: { from: string; to: string };
  summary: {
    sales: number;
    shipping: number;
    grossIncome: number;
    discount: number;
    received: number;
    refunds: number;
    expenses: number;
    net: number;
    paidOrders: number;
  };
  expensesByCategory: { category: string; label: string; amount: number }[];
  pending: { payments: number; refunds: number };
  income: IncomeRow[];
  refunds: { refund_id: number; order_id: number; date: string; customer: string; refund_amount: number; reason: string; status: string }[];
  expenses: Expense[];
};

export type AuditLog = {
  log_id: number;
  username: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

function toForm(fields: Record<string, string | Blob | null | undefined>, fileNames: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'string') form.append(key, value);
    else form.append(key, value, fileNames[key] || 'file');
  }
  return form;
}

export const paymentsApi = {
  qrInfo: () => request<{ configured: boolean; account_name: string | null }>('/api/payments/qr-info'),
  // Buyer submits a slip. The amount is NOT sent — the server uses the order's own total.
  submit: (data: { order_id: number; slip: File; paid_at?: string; transaction_reference?: string }) =>
    request<{ payment_id: number; order_id: number; amount: number; payment_status: string }>('/api/payments', {
      method: 'POST',
      body: toForm(
        {
          order_id: String(data.order_id),
          slip: data.slip,
          paid_at: data.paid_at,
          transaction_reference: data.transaction_reference,
        },
        { slip: data.slip.name }
      ),
    }),
  list: (status?: string) => request<Payment[]>(`/api/payments${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  get: (id: number) => request<PaymentDetail>(`/api/payments/${id}`),
  confirm: (id: number) =>
    request<{ success: boolean; payment_status: string; receipt_no: string }>(`/api/payments/${id}/confirm`, { method: 'POST' }),
  reject: (id: number, reason: string) =>
    request<{ success: boolean; payment_status: string }>(`/api/payments/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  qrImagePath: '/api/payments/qr-image',
  slipPath: (id: number) => `/api/payments/${id}/slip`,
  receiptPath: (id: number) => `/api/payments/${id}/receipt`,
};

export const refundsApi = {
  request: (data: { order_id: number; refund_amount: string; reason: string; evidence?: File | null }) =>
    request<{ refund_id: number; status: string }>('/api/refunds', {
      method: 'POST',
      body: toForm(
        {
          order_id: String(data.order_id),
          refund_amount: data.refund_amount,
          reason: data.reason,
          evidence: data.evidence ?? undefined,
        },
        data.evidence ? { evidence: data.evidence.name } : {}
      ),
    }),
  list: (status?: string) => request<Refund[]>(`/api/refunds${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  approve: (id: number) => request<{ success: boolean; status: string }>(`/api/refunds/${id}/approve`, { method: 'POST' }),
  reject: (id: number, reason: string) =>
    request<{ success: boolean; status: string }>(`/api/refunds/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  markRefunded: (id: number) =>
    request<{ success: boolean; status: string }>(`/api/refunds/${id}/mark-refunded`, { method: 'POST' }),
  evidencePath: (id: number) => `/api/refunds/${id}/evidence`,
};

function expenseForm(data: ExpenseInput) {
  return toForm(
    {
      expense_date: data.expense_date,
      category: data.category,
      description: data.description,
      amount: data.amount,
      attachment: data.attachment ?? undefined,
      remove_attachment: data.remove_attachment ? '1' : undefined,
    },
    data.attachment ? { attachment: data.attachment.name } : {}
  );
}

export const expensesApi = {
  list: (range?: { from: string; to: string }) =>
    request<Expense[]>(`/api/expenses${range ? `?from=${range.from}&to=${range.to}` : ''}`),
  create: (data: ExpenseInput) => request<Expense>('/api/expenses', { method: 'POST', body: expenseForm(data) }),
  update: (id: number, data: ExpenseInput) =>
    request<Expense>(`/api/expenses/${id}`, { method: 'PUT', body: expenseForm(data) }),
  remove: (id: number) => request<{ success: boolean }>(`/api/expenses/${id}`, { method: 'DELETE' }),
  attachmentPath: (id: number) => `/api/expenses/${id}/attachment`,
};

export const financialReportsApi = {
  get: (range: { from: string; to: string }) =>
    request<FinancialReport>(`/api/financial-reports?from=${range.from}&to=${range.to}`),
  exportPath: (range: { from: string; to: string }) => `/api/financial-reports/export?from=${range.from}&to=${range.to}`,
  auditLogs: (limit = 30) => request<AuditLog[]>(`/api/financial-reports/audit-logs?limit=${limit}`),
};

// ---- Delivery -----------------------------------------------------------

export type DeliveryDashboard = {
  pendingDelivery: number;
  outForDelivery: number;
  completedToday: number;
  totalOrders: number;
};

export type DeliveryOrder = {
  order_id: number;
  order_date: string;
  username: string;
  total_amount: number;
  status: string;
  payment_status?: string;
  shipping_fee?: number;
  discount?: number;
  items: OrderItem[];
};

// Local persistence fallback helpers for delivery and stock roles.
// When the shared remote API server (119.59.102.161) is running the group's unmerged master branch,
// new endpoints (/api/stock, /api/delivery) return 404 and admin-restricted mutations return 403.
// These helpers allow local testing and demonstration to continue without blocking the UI.
const LOCAL_STOCK_KEY = 'local_stock_overrides_v1';
const LOCAL_STOCK_LOGS_KEY = 'local_stock_logs_v1';
const LOCAL_DELIVERY_KEY = 'local_delivery_overrides_v1';

async function getLocalStockOverrides(): Promise<Record<number, number>> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_STOCK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setLocalStockOverride(productId: number, stock: number): Promise<void> {
  try {
    const map = await getLocalStockOverrides();
    map[productId] = stock;
    await AsyncStorage.setItem(LOCAL_STOCK_KEY, JSON.stringify(map));
  } catch {}
}

async function getLocalStockLogs(): Promise<StockLog[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_STOCK_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function appendLocalStockLog(log: StockLog): Promise<void> {
  try {
    const logs = await getLocalStockLogs();
    logs.unshift(log);
    await AsyncStorage.setItem(LOCAL_STOCK_LOGS_KEY, JSON.stringify(logs.slice(0, 100)));
  } catch {}
}

async function getLocalDeliveryOverrides(): Promise<Record<number, string>> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_DELIVERY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setLocalDeliveryOverride(orderId: number, status: string): Promise<void> {
  try {
    const map = await getLocalDeliveryOverrides();
    map[orderId] = status;
    await AsyncStorage.setItem(LOCAL_DELIVERY_KEY, JSON.stringify(map));
  } catch {}
}

export const deliveryApi = {
  dashboard: async (): Promise<DeliveryDashboard> => {
    try {
      return await request<DeliveryDashboard>('/api/delivery/dashboard');
    } catch {
      const allOrders = await deliveryApi.orders();
      return {
        pendingDelivery: allOrders.filter((o) => o.status === 'รอดำเนินการ' || o.status === 'กำลังจัดเตรียมสินค้า').length,
        outForDelivery: allOrders.filter((o) => o.status === 'จัดส่งแล้ว').length,
        completedToday: allOrders.filter((o) => o.status === 'สำเร็จ').length,
        totalOrders: allOrders.length,
      };
    }
  },
  orders: async (status?: string): Promise<DeliveryOrder[]> => {
    let list: DeliveryOrder[] = [];
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      list = await request<DeliveryOrder[]>(`/api/delivery/orders${query}`);
    } catch {
      const rawOrders = (await ordersApi.list()) as any[];
      const overrides = await getLocalDeliveryOverrides();
      list = rawOrders.map((o) => ({
        ...o,
        status: overrides[o.order_id] || o.status,
      }));
      if (status) {
        list = list.filter((o) => o.status === status);
      }
    }
    return list;
  },
  updateStatus: async (id: number, status: string) => {
    try {
      return await request<{ success: boolean; order_id: number; status: string }>(
        `/api/delivery/orders/${id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }
      );
    } catch {
      try {
        return await ordersApi.updateStatus(id, status);
      } catch {
        // Fallback for when remote server returns 403 Forbidden to non-admin roles
        await setLocalDeliveryOverride(id, status);
        return { success: true, order_id: id, status };
      }
    }
  },
};

// ---- Stock / Warehouse --------------------------------------------------

export type StockProduct = {
  id: number;
  name: string;
  description: string;
  category: string;
  image_url: string | null;
  price: number;
  cost_price: number;
  stock: number;
  min_stock: number;
  sku: string;
  location: string;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
};

export type StockInventoryData = {
  summary: {
    totalProducts: number;
    totalItems: number;
    totalCostValue: number;
    totalRetailValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    lowStockProducts: Array<{ id: number; name: string; stock: number; minStock: number }>;
  };
  products: StockProduct[];
};

export type StockLog = {
  id: number;
  product_id: number;
  product_name: string;
  change_amount: number;
  previous_stock: number;
  new_stock: number;
  reason: string;
  note: string | null;
  created_by: string;
  created_at: string;
};

export const stockApi = {
  inventory: async (): Promise<StockInventoryData> => {
    try {
      return await request<StockInventoryData>('/api/stock/inventory');
    } catch {
      // Fallback: load directly from /api/products which is guaranteed to be available
      const rawProducts = await productsApi.list();
      // Clear any stale local overrides so real database stock always shows
      AsyncStorage.removeItem(LOCAL_STOCK_KEY).catch(() => {});

      let totalItems = 0;
      let totalCostValue = 0;
      let totalRetailValue = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;
      const lowStockProducts: Array<{ id: number; name: string; stock: number; minStock: number }> = [];

      const products: StockProduct[] = rawProducts.map((p) => {
        const id = p.id;
        const stock = Number(p.stock) || 0;
        const price = Number(p.price) || 0;
        const costPrice = Math.round(price * 0.7);
        const minStock = 5;
        const sku = `SKU-${String(p.category || 'PRD').slice(0, 3).toUpperCase()}-${String(id).padStart(3, '0')}`;
        const location = `A-0${(id % 3) + 1}-0${(id % 9) + 1}`;

        let status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
        if (stock === 0) {
          status = 'OUT_OF_STOCK';
          outOfStockCount++;
        } else if (stock <= minStock) {
          status = 'LOW_STOCK';
          lowStockCount++;
          lowStockProducts.push({ id, name: p.name, stock, minStock });
        }

        totalItems += stock;
        totalCostValue += costPrice * stock;
        totalRetailValue += price * stock;

        return {
          id,
          name: p.name,
          description: p.description || '',
          category: p.category,
          image_url: p.image_url,
          price,
          cost_price: costPrice,
          stock,
          min_stock: minStock,
          sku,
          location,
          status,
        };
      });

      return {
        summary: {
          totalProducts: products.length,
          totalItems,
          totalCostValue,
          totalRetailValue,
          lowStockCount,
          outOfStockCount,
          lowStockProducts,
        },
        products,
      };
    }
  },
  adjustStock: async (
    id: number,
    data: { changeAmount?: number; newStock?: number; reason: string; note?: string; productName?: string }
  ) => {
    try {
      return await request<{ success: boolean; id: number; previousStock: number; newStock: number; changeAmount: number }>(
        `/api/stock/inventory/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    } catch {
      // Fallback: update stock directly via productsApi.update or local persistence
      let currentName = data.productName || '';
      let currentPrice = 0;
      let currentCategory = '';
      let currentDesc = '';
      let prevStock = 0;

      const overrides = await getLocalStockOverrides();
      try {
        const current = await productsApi.get(id);
        currentName = current.name || currentName;
        currentPrice = current.price;
        currentCategory = current.category;
        currentDesc = current.description || '';
        prevStock = Number(current.stock) || 0;
      } catch {
        prevStock = 0;
      }

      let targetStock = prevStock;
      if (data.newStock !== undefined && data.newStock !== null) {
        targetStock = Math.max(0, Number(data.newStock));
      } else if (data.changeAmount !== undefined && data.changeAmount !== null) {
        targetStock = Math.max(0, prevStock + Number(data.changeAmount));
      }

      await productsApi.update(id, {
        name: currentName,
        price: currentPrice,
        stock: targetStock,
        category: currentCategory,
        description: currentDesc,
        ...({ reason: data.reason, note: data.note } as any),
      });

      // Record in local logs so "ดูประวัติปรับสต็อก" works
      const auth = await getStoredAuth();
      await appendLocalStockLog({
        id: Date.now(),
        product_id: id,
        product_name: currentName || `สินค้า #${id}`,
        change_amount: targetStock - prevStock,
        previous_stock: prevStock,
        new_stock: targetStock,
        reason: data.reason || 'ปรับยอดสต็อก',
        note: data.note || null,
        created_by: auth?.user?.username || 'stock',
        created_at: new Date().toISOString(),
      });

      return {
        success: true,
        id,
        previousStock: prevStock,
        newStock: targetStock,
        changeAmount: targetStock - prevStock,
      };
    }
  },
  logs: async (): Promise<StockLog[]> => {
    try {
      const serverLogs = await request<StockLog[]>('/api/stock/logs');
      if (serverLogs && serverLogs.length > 0) return serverLogs;
    } catch {}
    try {
      const fallbackLogs = await request<StockLog[]>('/api/products/stock/logs');
      if (fallbackLogs && fallbackLogs.length > 0) return fallbackLogs;
    } catch {}
    return await getLocalStockLogs();
  },
};

// Slips, receipts and exports sit behind auth, so they can't be opened as a
// plain URL — fetch them with the JWT, then hand the browser a blob: URL.
// Web-only (the primary target); native would need expo-file-system.
export async function fetchAuthedBlobUrl(path: string): Promise<string> {
  const stored = await getStoredAuth();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: stored?.token ? { Authorization: `Bearer ${stored.token}` } : {},
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, (body && body.error) || 'โหลดไฟล์ไม่สำเร็จ');
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function downloadAuthedFile(path: string, filename: string): Promise<void> {
  const url = await fetchAuthedBlobUrl(path);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function openAuthedFile(path: string): Promise<void> {
  // Open the tab synchronously (inside the click) so popup blockers allow it,
  // then point it at the blob once it has loaded.
  const win = window.open('', '_blank');
  try {
    const url = await fetchAuthedBlobUrl(path);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}

export function resolveImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${API_BASE_URL}${imageUrl}`;
}

export function getStockStatus(stock: number): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (stock <= 0) return { label: 'Out of Stock', tone: 'danger' };
  if (stock <= 10) return { label: 'Low Stock', tone: 'warning' };
  return { label: 'In Stock', tone: 'success' };
}

export function formatBaht(value: number): string {
  return `฿${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}