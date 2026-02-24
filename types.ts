export enum OrderStatus {
  PENDING = 'Chờ xử lý',
  SHIPPING = 'Đang giao',
  COMPLETED = 'Hoàn thành',
  CANCELLED = 'Đã hủy',
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category: string;
  importDate: string;
  image?: string; 
}

export interface CartItem {
  productId: string;
  quantity: number;
  name: string;
  price: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  cancelReason?: string;
  note?: string;
  items: CartItem[];
  paidAmount?: number;
  dueDate?: string;
}

export interface User {
  username: string;
  name: string;
  role: 'admin';
}

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  lowStockCount: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  createdAt: string;
  note?: string;
}

export interface ImportRecord {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  createdAt: string;
  note?: string;
  supplierName?: string;
}

export interface ExportRecord {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  orderId: string;
  customerName: string;
  customerPhone: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  kind: 'receivable' | 'payable';
  orderId?: string;
  importId?: string;
  amount: number;
  method: 'cod' | 'bank' | 'wallet' | 'cash' | 'other';
  createdAt: string;
  note?: string;
  customerName?: string;
  supplierName?: string;
}
