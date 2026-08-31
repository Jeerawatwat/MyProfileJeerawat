// src/lib/api.ts
// Single place the frontend talks to the backend. No database credentials ever
// live here — only the API base URL and the JWT that /api/auth/login returns.
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

export type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: string;
  image_url: string | null;
  description: string | null;
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

export type Order = {
  order_id: number;
  user_id: number;
  username?: string; // present on admin's order list/detail
  order_date: string;
  total_amount: number;
  status: OrderStatus | string;
  cancel_reason?: string | null; // set when status is 'ยกเลิก', explains why to the buyer
  items: OrderItem[];
};

export type CreateOrderInput = {
  items: { product_id: number; quantity: number }[];
};

export const ordersApi = {
  list: () => request<Order[]>('/api/orders'),
  get: (id: number) => request<Order>(`/api/orders/${id}`),
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
