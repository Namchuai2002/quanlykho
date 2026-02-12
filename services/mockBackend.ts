import { Product, Order, OrderStatus, User, Category, Customer } from '../types';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, child, update, push } from 'firebase/database';

const sanitizeUrl = (url: string) => url.trim().replace(/[\)\s]+$/, '').replace(/\/+$/, '');

// --- CẤU HÌNH FIREBASE ---
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCggaZuyAmA5z2DuLTnrNeJJ_Ma9ZlLeqs",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "quan-ly-kho-hang-bd3af.firebaseapp.com",
  databaseURL: sanitizeUrl(process.env.FIREBASE_DATABASE_URL || "https://quan-ly-kho-hang-bd3af-default-rtdb.firebaseio.com"),
  projectId: process.env.FIREBASE_PROJECT_ID || "quan-ly-kho-hang-bd3af",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "quan-ly-kho-hang-bd3af.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "254934216285",
  appId: process.env.FIREBASE_APP_ID || "1:254934216285:web:3ebdedb5c0050dad2aa7b4",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-F488D82N4T"
};

// Check if Firebase is configured
const isOnline = firebaseConfig.apiKey && firebaseConfig.databaseURL;
let db: any = null;

if (isOnline) {
  try {
    const app = initializeApp(firebaseConfig);
    if (import.meta.env.PROD && firebaseConfig.measurementId) {
      import('firebase/analytics')
        .then(({ getAnalytics }) => { try { getAnalytics(app); } catch {} })
        .catch(() => {});
    }
    db = getDatabase(app);
    console.log("Kết nối Firebase thành công!");
  } catch (e) {
    console.error("Lỗi khởi tạo Firebase:", e);
  }
}

// --- INITIAL DATA (FALLBACK) ---
const INITIAL_CATEGORIES: Category[] = [
  { id: 'c1', name: 'Thời trang' },
  { id: 'c2', name: 'Điện tử' },
  { id: 'c3', name: 'Gia dụng' },
  { id: 'c4', name: 'Mỹ phẩm' }
];

const INITIAL_PRODUCTS: Product[] = [
  { 
    id: '1', 
    name: 'Áo Thun Basic', 
    sku: 'AT001', 
    price: 150000, 
    stock: 50, 
    category: 'Thời trang', 
    importDate: '2023-10-01',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=100&q=80'
  },
];

const INITIAL_ORDERS: Order[] = [
  { 
    id: 'DH001', 
    customerName: 'Khách Demo', 
    customerPhone: '0901234567', 
    address: '123 Đường Demo, Quận 1, TP.HCM',
    totalAmount: 150000, 
    status: OrderStatus.COMPLETED, 
    createdAt: new Date().toISOString(), 
    items: [{ productId: '1', quantity: 1, name: 'Áo Thun Basic', price: 150000 }]
  },
];

const STORAGE_KEYS = {
  PRODUCTS: 'app_products',
  CATEGORIES: 'app_categories',
  ORDERS: 'app_orders',
  CUSTOMERS: 'app_customers',
  USER: 'app_user',
};

// --- HELPER FUNCTIONS ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Wrapper to prevent hanging forever
const withTimeout = (promise: Promise<any>, ms: number = 8000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase Timeout")), ms))
    ]);
};

const withTimeoutRetry = async <T>(fn: () => Promise<T>, ms: number, retries: number) => {
  let lastErr: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await withTimeout(fn(), ms);
    } catch (e) {
      lastErr = e;
      await delay(500);
    }
  }
  throw lastErr;
};

const readPath = async <T>(path: string, ms: number): Promise<T[]> => {
  try {
    const snapshot = await withTimeoutRetry(() => get(child(ref(db), path)), ms, 2);
    if (snapshot && (snapshot as any).exists && (snapshot as any).exists()) {
      const data = (snapshot as any).val();
      return Object.values(data) as T[];
    }
    return [];
  } catch {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), ms);
      const res = await fetch(`${sanitizeUrl(firebaseConfig.databaseURL)}/${path}.json`, { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === 'object') return Object.values(json) as T[];
      }
      return [];
    } catch {
      return [];
    }
  }
};

// --- DATA SERVICE ---
export const MockBackend = {
  // Check Status
  isOnlineMode: () => !!(isOnline && db),
  
  getCustomers: async () => {
    if (MockBackend.isOnlineMode()) {
      try {
        return await readPath<any>('customers', 12000);
      } catch (e) {
        return [];
      }
    } else {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      return data ? JSON.parse(data) : [];
    }
  },
  addCustomer: async (name: string, phone: string, address: string = '', note: string = '') => {
    const newCust = { id: Date.now().toString(), name, phone, address, note, createdAt: new Date().toISOString() };
    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(set(ref(db, 'customers/' + newCust.id), newCust));
      } catch (e) {
        throw e;
      }
    } else {
      const list = await MockBackend.getCustomers();
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([newCust, ...list]));
    }
    return newCust;
  },
  updateCustomer: async (id: string, patch: any) => {
    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(update(ref(db, 'customers/' + id), patch));
      } catch (e) {
        throw e;
      }
    } else {
      const list = await MockBackend.getCustomers();
      const updated = list.map((c: any) => c.id === id ? { ...c, ...patch } : c);
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(updated));
    }
  },
  deleteCustomer: async (id: string) => {
    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(set(ref(db, 'customers/' + id), null));
      } catch (e) {
        throw e;
      }
    } else {
      const list = await MockBackend.getCustomers();
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(list.filter((c: any) => c.id !== id)));
    }
  },

  // --- CATEGORIES ---
  getCategories: async (): Promise<Category[]> => {
    if (MockBackend.isOnlineMode()) {
      try {
        return await readPath<Category>('categories', 12000);
      } catch (e) {
        return [];
      }
    } else {
      return [];
    }
  },

  addCategory: async (name: string) => {
    const newCat: Category = { id: `cat_${Date.now()}`, name };
    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(set(ref(db, 'categories/' + newCat.id), newCat));
      } catch (e) { throw e; }
    } else {
      throw new Error('Chỉ hỗ trợ online');
    }
    return newCat;
  },

  deleteCategory: async (id: string) => {
    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(set(ref(db, 'categories/' + id), null));
      } catch(e) { throw e; }
    } else {
      throw new Error('Chỉ hỗ trợ online');
    }
  },

  // --- PRODUCTS ---
  getProducts: async (): Promise<Product[]> => {
    if (MockBackend.isOnlineMode()) {
      try {
        return await readPath<Product>('products', 12000);
      } catch (e) { 
        return [];
      }
    } else {
      const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      return data ? JSON.parse(data) : [];
    }
  },

  addProduct: async (product: Omit<Product, 'id' | 'importDate'>) => {
    const newProduct: Product = {
      ...product,
      id: Date.now().toString(),
      importDate: new Date().toISOString(),
    };

    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(set(ref(db, 'products/' + newProduct.id), newProduct));
      } catch (e) {
        throw e;
      }
    } else {
      throw new Error('Chỉ hỗ trợ online');
    }
    return newProduct;
  },

  // Bulk Import Products (Excel)
  importProductsBulk: async (products: Omit<Product, 'id' | 'importDate'>[]) => {
    const timestamp = new Date().toISOString();
    const newProducts = products.map((p, index) => ({
      ...p,
      id: `${Date.now()}_${index}`,
      importDate: timestamp
    }));

    if (MockBackend.isOnlineMode()) {
      try {
        const updates: any = {};
        newProducts.forEach(p => {
          updates['products/' + p.id] = p;
        });
        await withTimeout(update(ref(db), updates));
      } catch (e) {
        throw e;
      }
    } else {
      throw new Error('Chỉ hỗ trợ online');
    }
    return newProducts.length;
  },

  updateProduct: async (updatedProduct: Product) => {
    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(update(ref(db, 'products/' + updatedProduct.id), updatedProduct));
      } catch(e) { throw e; }
    } else {
      throw new Error('Chỉ hỗ trợ online');
    }
  },

  deleteProduct: async (id: string) => {
    if (MockBackend.isOnlineMode()) {
      try {
         await withTimeout(set(ref(db, 'products/' + id), null));
      } catch(e) { throw e; }
    } else {
      throw new Error('Chỉ hỗ trợ online');
    }
  },

  // --- ORDERS ---
  getOrders: async (): Promise<Order[]> => {
    if (MockBackend.isOnlineMode()) {
      try {
        const list = await readPath<Order>('orders', 12000) as any[];
        return list.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ) as Order[];
      } catch (e) { 
        return [];
      }
    } else {
      const data = localStorage.getItem(STORAGE_KEYS.ORDERS);
      const list = data ? JSON.parse(data) : [];
      return list.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ) as Order[];
    }
  },

  createOrder: async (orderData: Omit<Order, 'id' | 'createdAt'>) => {
    const products = await MockBackend.getProducts();

    // Check stock locally first
    for (const item of orderData.items) {
      const product = products.find(p => p.id === item.productId);
      if (!product || product.stock < item.quantity) {
        throw new Error(`Sản phẩm ${item.name} không đủ hàng.`);
      }
    }

    const newOrderId = `DH${Date.now().toString().slice(-6)}`;
    const newOrder: Order = {
      ...orderData,
      id: newOrderId,
      createdAt: new Date().toISOString(),
    };

    if (MockBackend.isOnlineMode()) {
      try {
        const updates: any = {};
        updates['orders/' + newOrderId] = newOrder;
        
        orderData.items.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            updates['products/' + product.id + '/stock'] = product.stock - item.quantity;
          }
        });
        
        await withTimeout(update(ref(db), updates));
      } catch(e) {
         throw e;
      }

    } else {
      throw new Error('Chỉ hỗ trợ online');
    }
    return newOrder;
  },

  updateOrderStatus: async (orderId: string, status: OrderStatus, cancelReason?: string) => {
    if (MockBackend.isOnlineMode()) {
      try {
        const payload: any = { status };
        if (status === OrderStatus.CANCELLED && cancelReason) payload.cancelReason = cancelReason;
        await withTimeout(update(ref(db, `orders/${orderId}`), payload));
      } catch (e) { 
        throw e; 
      }
    } else {
      throw new Error('Chỉ hỗ trợ online');
    }
  },
  
  updateOrderNote: async (orderId: string, note: string) => {
    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(update(ref(db, `orders/${orderId}`), { note }));
      } catch (e) {
        throw e;
      }
    } else {
      throw new Error('Chỉ hỗ trợ online');
    }
  },
  
  // Auth Simulation
  login: async (username: string, password: string): Promise<User | null> => {
    await delay(500); 
    if (username === 'admin' && password === '123456') {
      const user: User = { username: 'admin', name: 'Chủ Cửa Hàng', role: 'admin' };
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      return user;
    }
    return null;
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEYS.USER);
  },

  getCurrentUser: (): User | null => {
    const u = localStorage.getItem(STORAGE_KEYS.USER);
    return u ? JSON.parse(u) : null;
  },

  exportData: async () => {
    const products = await MockBackend.getProducts();
    const orders = await MockBackend.getOrders();
    const customers = await MockBackend.getCustomers();
    const categories = await MockBackend.getCategories();
    return JSON.stringify({ products, orders, customers, categories });
  },

  importData: async (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      const productsArr: Product[] = Array.isArray(data.products) ? data.products : [];
      const ordersArr: Order[] = Array.isArray(data.orders) ? data.orders : [];
      const customersArr: Customer[] = Array.isArray(data.customers) ? data.customers : [];
      const categoriesArr: Category[] = Array.isArray(data.categories) ? data.categories : [];

      const toKeyed = <T extends { id: string }>(arr: T[]) =>
        arr.reduce((acc: Record<string, T>, item) => {
          acc[item.id] = item;
          return acc;
        }, {});

      if (MockBackend.isOnlineMode()) {
        await withTimeout(set(ref(db, 'products'), toKeyed(productsArr)));
        await withTimeout(set(ref(db, 'orders'), toKeyed(ordersArr)));
        await withTimeout(set(ref(db, 'customers'), toKeyed(customersArr)));
        if (categoriesArr.length) {
          await withTimeout(set(ref(db, 'categories'), toKeyed(categoriesArr)));
        }
      } else {
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(productsArr));
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(ordersArr));
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customersArr));
        if (categoriesArr.length) {
          localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categoriesArr));
        }
      }
      return true;
    } catch (e) {
      console.error("Import failed", e);
      return false;
    }
  }
};
