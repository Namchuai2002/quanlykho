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
