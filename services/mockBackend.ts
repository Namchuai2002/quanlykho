import { Product, Order, OrderStatus, User, Category, Customer, ImportRecord, ExportRecord, PaymentRecord } from '../types';
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
  IMPORTS: 'app_imports',
  EXPORTS: 'app_exports',
  PAYMENTS: 'app_payments',
  AUTH: 'app_auth',
};

// --- HELPER FUNCTIONS ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};
const getAuthConfig = () => {
  const raw = localStorage.getItem(STORAGE_KEYS.AUTH);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { username: string; passwordHash: string; updatedAt: string };
  } catch {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    return null;
  }
};

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
  hasAdminAccount: () => !!getAuthConfig(),
  setupAdminAccount: async (username: string, password: string) => {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) throw new Error('Vui lòng nhập tài khoản quản trị');
    if (password.length < 3) throw new Error('Mật khẩu phải có ít nhất 3 ký tự');
    const passwordHash = await sha256(password);
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify({
      username: normalizedUsername,
      passwordHash,
      updatedAt: new Date().toISOString()
    }));
    return { username: normalizedUsername };
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const auth = getAuthConfig();
    if (!auth) throw new Error('Chưa có tài khoản quản trị');
    const currentHash = await sha256(currentPassword);
    if (currentHash !== auth.passwordHash) throw new Error('Mật khẩu hiện tại không đúng');
    if (newPassword.length < 3) throw new Error('Mật khẩu mới phải có ít nhất 3 ký tự');
    const passwordHash = await sha256(newPassword);
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify({
      ...auth,
      passwordHash,
      updatedAt: new Date().toISOString()
    }));
    return true;
  },
  
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
        const online = await readPath<Product>('products', 12000);
        if (online && online.length > 0) return online;
        const local = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
        return local ? JSON.parse(local) : [];
      } catch (e) { 
        const local = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
        return local ? JSON.parse(local) : [];
      }
    } else {
      const data = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      return data ? JSON.parse(data) : [];
    }
  },

  // --- IMPORTS (STOCK IN) ---
  getImports: async (): Promise<ImportRecord[]> => {
    if (MockBackend.isOnlineMode()) {
      try {
        const list = await readPath<ImportRecord>('imports', 12000) as any[];
        if (!list || list.length === 0) {
          const local = localStorage.getItem(STORAGE_KEYS.IMPORTS);
          const l = local ? JSON.parse(local) : [];
          return l.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } catch (e) {
        const local = localStorage.getItem(STORAGE_KEYS.IMPORTS);
        const l = local ? JSON.parse(local) : [];
        return l.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } else {
      const data = localStorage.getItem(STORAGE_KEYS.IMPORTS);
      const list = data ? JSON.parse(data) : [];
      return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  getExports: async (): Promise<ExportRecord[]> => {
    if (MockBackend.isOnlineMode()) {
      try {
        const list = await readPath<ExportRecord>('exports', 12000) as any[];
        if (!list || list.length === 0) {
          const local = localStorage.getItem(STORAGE_KEYS.EXPORTS);
          const l = local ? JSON.parse(local) : [];
          return l.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } catch (e) {
        const local = localStorage.getItem(STORAGE_KEYS.EXPORTS);
        const l = local ? JSON.parse(local) : [];
        return l.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } else {
      const data = localStorage.getItem(STORAGE_KEYS.EXPORTS);
      const list = data ? JSON.parse(data) : [];
      return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },
  
  getPayments: async (): Promise<PaymentRecord[]> => {
    let firebaseList: PaymentRecord[] = [];
    if (MockBackend.isOnlineMode()) {
      try {
        firebaseList = await readPath<PaymentRecord>('payments', 12000) as any[];
      } catch (e) {
        console.error("Firebase getPayments failed, using local fallback", e);
      }
    }
    
    const local = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
    const localList = local ? JSON.parse(local) : [];
    
    // Merge: Ưu tiên Firebase, thêm local nếu ID chưa có
    const map = new Map<string, PaymentRecord>();
    localList.forEach((p: PaymentRecord) => map.set(p.id, p));
    firebaseList.forEach((p: PaymentRecord) => map.set(p.id, p));
    
    const combined = Array.from(map.values());
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  importStock: async (productId: string, quantity: number, unitCost?: number, note?: string, supplierName?: string, paidNow?: boolean): Promise<ImportRecord> => {
    if (quantity <= 0) throw new Error('Số lượng nhập phải > 0');
    const products = await MockBackend.getProducts();
    const product = products.find(p => p.id === productId);
    if (!product) throw new Error('Sản phẩm không tồn tại');
    const id = `IMP${Date.now().toString().slice(-8)}`;
    const record: ImportRecord = {
      id,
      productId,
      sku: product.sku,
      name: product.name,
      quantity,
      unitCost,
      totalCost: unitCost ? unitCost * quantity : undefined,
      createdAt: new Date().toISOString(),
      note,
      supplierName: supplierName || note
    };

    const offlineWrite = async () => {
      const list = await MockBackend.getImports();
      localStorage.setItem(STORAGE_KEYS.IMPORTS, JSON.stringify([record, ...list]));
      const newProducts = products.map(p => p.id === product.id ? { ...p, stock: (p.stock || 0) + quantity, importDate: new Date().toISOString() } : p);
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(newProducts));
    };

    if (MockBackend.isOnlineMode()) {
      try {
        const updates: any = {};
        updates['imports/' + id] = record;
        updates['products/' + product.id + '/stock'] = (product.stock || 0) + quantity;
        updates['products/' + product.id + '/importDate'] = new Date().toISOString();
        await withTimeout(update(ref(db), updates));
        if (paidNow && unitCost) {
          const paymentId = `PAY${Date.now().toString().slice(-8)}`;
          const pay: PaymentRecord = {
            id: paymentId,
            kind: 'payable',
            importId: id,
            amount: unitCost * quantity,
            method: 'bank',
            createdAt: new Date().toISOString(),
            note,
            supplierName: record.supplierName
          };
          await withTimeout(set(ref(db, 'payments/' + paymentId), pay));
        }
      } catch (e) {
        try {
          await offlineWrite();
        } catch {
          throw e;
        }
      }
    } else {
      await offlineWrite();
      if (paidNow && unitCost) {
        const payments = await MockBackend.getPayments();
        const paymentId = `PAY${Date.now().toString().slice(-8)}`;
        const pay: PaymentRecord = {
          id: paymentId,
          kind: 'payable',
          importId: id,
          amount: unitCost * quantity,
          method: 'bank',
          createdAt: new Date().toISOString(),
          note,
          supplierName: record.supplierName
        };
        localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([pay, ...payments]));
      }
    }
    return record;
  },
  
  addOrderPayment: async (orderId: string, amount: number, method: PaymentRecord['method'], note?: string): Promise<PaymentRecord> => {
    const id = `PAY${Date.now().toString().slice(-8)}`;
    const now = new Date().toISOString();
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Số tiền thu phải > 0');
    }
    if (MockBackend.isOnlineMode()) {
      try {
        const orderSnap = await withTimeout(get(ref(db, `orders/${orderId}`)));
        if (!orderSnap || !(orderSnap as any).exists || !(orderSnap as any).exists()) {
          throw new Error('Đơn hàng không tồn tại');
        }
        const order = (orderSnap as any).val() as Order;
        if (order.status !== OrderStatus.COMPLETED) {
          throw new Error('Đơn hàng chưa hoàn thành, không thể thu tiền');
        }
        const paid = (order.paidAmount || 0) + amount;
        if (paid > order.totalAmount) {
          throw new Error('Số tiền thu vượt quá tổng đơn');
        }
        const payment: PaymentRecord = { id, kind: 'receivable', orderId, amount, method, createdAt: now, note, customerName: order.customerName };
        const updates: any = {};
        updates[`orders/${orderId}/paidAmount`] = paid;
        updates[`orders/${orderId}/lastPaidAt`] = now;
        updates[`payments/${id}`] = payment;
        await withTimeout(update(ref(db), updates));
        
        // Cập nhật luôn local storage để đồng bộ ngay lập tức
        const localOrders = await MockBackend.getOrders();
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(localOrders.map(o => o.id === orderId ? { ...o, paidAmount: paid, lastPaidAt: now } : o)));
        const localPayments = await MockBackend.getPayments();
        localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([payment, ...localPayments.filter(p => p.id !== id)]));
        
        return payment;
      } catch (e) {
        const orders = await MockBackend.getOrders();
        const order = orders.find(o => o.id === orderId);
        if (!order) throw e;
        if (order.status !== OrderStatus.COMPLETED) {
          throw new Error('Đơn hàng chưa hoàn thành, không thể thu tiền');
        }
        const paid = (order.paidAmount || 0) + amount;
        if (paid > order.totalAmount) {
          throw new Error('Số tiền thu vượt quá tổng đơn');
        }
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders.map(o => o.id === orderId ? { ...o, paidAmount: paid, lastPaidAt: now } : o)));
        const payments = await MockBackend.getPayments();
        const payment: PaymentRecord = { id, kind: 'receivable', orderId, amount, method, createdAt: now, note, customerName: order.customerName };
        localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([payment, ...payments]));
        return payment;
      }
    } else {
      const orders = await MockBackend.getOrders();
      const order = orders.find(o => o.id === orderId);
      if (!order) throw new Error('Đơn hàng không tồn tại');
      if (order.status !== OrderStatus.COMPLETED) {
        throw new Error('Đơn hàng chưa hoàn thành, không thể thu tiền');
      }
      const paid = (order.paidAmount || 0) + amount;
      if (paid > order.totalAmount) {
        throw new Error('Số tiền thu vượt quá tổng đơn');
      }
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders.map(o => o.id === orderId ? { ...o, paidAmount: paid, lastPaidAt: now } : o)));
      const payments = await MockBackend.getPayments();
      const payment: PaymentRecord = { id, kind: 'receivable', orderId, amount, method, createdAt: now, note, customerName: order.customerName };
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([payment, ...payments]));
      return payment;
    }
  },
  
  addPayablePayment: async (importId: string, amount: number, method: PaymentRecord['method'], note?: string): Promise<PaymentRecord> => {
    const id = `PAY${Date.now().toString().slice(-8)}`;
    const now = new Date().toISOString();
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Số tiền thanh toán phải > 0');
    }
    const imports = await MockBackend.getImports();
    const imp = imports.find(i => i.id === importId);
    if (!imp || typeof imp.totalCost !== 'number') throw new Error('Phiếu nhập không hợp lệ');
    const existingPayments = await MockBackend.getPayments();
    const paidSum = existingPayments
      .filter(p => p.kind === 'payable' && p.importId === importId)
      .reduce((s, p) => s + p.amount, 0);
    if (paidSum + amount > imp.totalCost) {
      throw new Error('Số tiền thanh toán vượt quá tổng phải trả');
    }
    const payment: PaymentRecord = { id, kind: 'payable', importId, amount, method, createdAt: now, note, supplierName: imp.supplierName || imp.note };
    if (MockBackend.isOnlineMode()) {
      try {
        const updates: any = {};
        updates[`payments/${id}`] = payment;
        await withTimeout(update(ref(db), updates));
      } catch (e) {
        localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([payment, ...existingPayments]));
      }
    } else {
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([payment, ...existingPayments]));
    }
    return payment;
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

  // --- SYNC LOCAL DATA TO FIREBASE ---
  syncLocalDataToFirebase: async () => {
    if (!MockBackend.isOnlineMode()) return;
    
    try {
      const results = { orders: 0, payments: 0 };
      
      // 1. Sync Payments
      const localPayments = JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYMENTS) || '[]');
      const firebasePayments = await readPath<PaymentRecord>('payments', 12000);
      const fbIds = new Set(firebasePayments.map(p => p.id));
      
      const missingPayments = localPayments.filter((p: PaymentRecord) => !fbIds.has(p.id));
      if (missingPayments.length > 0) {
        const updates: any = {};
        missingPayments.forEach((p: PaymentRecord) => { updates[`payments/${p.id}`] = p; });
        await withTimeout(update(ref(db), updates));
        results.payments = missingPayments.length;
      }

      // 2. Sync Order paidAmount
      const localOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || '[]');
      const firebaseOrders = await readPath<Order>('orders', 12000);
      const fbOrderMap = new Map(firebaseOrders.map(o => [o.id, o]));
      
      const orderUpdates: any = {};
      localOrders.forEach((lo: Order) => {
        const fo = fbOrderMap.get(lo.id);
        if (fo) {
          const lPaid = lo.paidAmount || 0;
          const fPaid = fo.paidAmount || 0;
          if (lPaid > fPaid) {
            orderUpdates[`orders/${lo.id}/paidAmount`] = lPaid;
            if (lo.lastPaidAt) orderUpdates[`orders/${lo.id}/lastPaidAt`] = lo.lastPaidAt;
          }
        }
      });
      
      if (Object.keys(orderUpdates).length > 0) {
        await withTimeout(update(ref(db), orderUpdates));
        results.orders = Object.keys(orderUpdates).length;
      }
      
      console.log("Đồng bộ dữ liệu thành công:", results);
      return results;
    } catch (e) {
      console.error("Lỗi đồng bộ dữ liệu:", e);
      throw e;
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
    try {
      if (!MockBackend.isOnlineMode()) {
        // Offline handling: update local storage records only
        const ordersLocal = await MockBackend.getOrders();
        const currentOrder = ordersLocal.find(o => o.id === orderId);
        if (!currentOrder) throw new Error('Đơn hàng không tồn tại');
        const products = await MockBackend.getProducts();
        const payload: any = { status };
        if (status === OrderStatus.CANCELLED && cancelReason) payload.cancelReason = cancelReason;
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(ordersLocal.map(o => o.id === orderId ? { ...o, ...payload } : o)));
        if (status === OrderStatus.COMPLETED && currentOrder.status !== OrderStatus.COMPLETED) {
          const newProducts = products.map(p => {
            const item = currentOrder.items.find(it => it.productId === p.id);
            return item ? { ...p, stock: Math.max(0, (p.stock || 0) - item.quantity) } : p;
          });
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(newProducts));
          const exportsList = await MockBackend.getExports();
          currentOrder.items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
              const id = `EXP${Date.now().toString().slice(-8)}_${product.id}`;
              const record: ExportRecord = {
                id,
                productId: product.id,
                sku: product.sku,
                name: product.name,
                quantity: item.quantity,
                orderId,
                customerName: currentOrder.customerName,
                customerPhone: currentOrder.customerPhone,
                createdAt: new Date().toISOString(),
              };
              exportsList.unshift(record);
            }
          });
          localStorage.setItem(STORAGE_KEYS.EXPORTS, JSON.stringify(exportsList));
        }
        return;
      }
      // Online path
      const orderSnap = await withTimeout(get(ref(db, `orders/${orderId}`)));
      if (!orderSnap || !(orderSnap as any).exists || !(orderSnap as any).exists()) {
        throw new Error('Đơn hàng không tồn tại');
      }
      const currentOrder = (orderSnap as any).val() as Order;
      const payload: any = { status };
      if (status === OrderStatus.CANCELLED && cancelReason) payload.cancelReason = cancelReason;
      const updates: any = {};
      updates[`orders/${orderId}`] = { ...currentOrder, ...payload };
      
      if (status === OrderStatus.COMPLETED && currentOrder.status !== OrderStatus.COMPLETED) {
        const products = await MockBackend.getProducts();
        currentOrder.items.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            updates[`products/${product.id}/stock`] = Math.max(0, (product.stock || 0) - item.quantity);
            const id = `EXP${Date.now().toString().slice(-8)}_${product.id}`;
            const record: ExportRecord = {
              id,
              productId: product.id,
              sku: product.sku,
              name: product.name,
              quantity: item.quantity,
              orderId: orderId,
              customerName: currentOrder.customerName,
              customerPhone: currentOrder.customerPhone,
              createdAt: new Date().toISOString(),
            };
            updates[`exports/${id}`] = record;
          }
        });
      }
      
      await withTimeout(update(ref(db), updates));
    } catch (e) {
      // On online failure, attempt local fallback to ensure history exists
      try {
        const ordersLocal = await MockBackend.getOrders();
        const currentOrder = ordersLocal.find(o => o.id === orderId);
        if (currentOrder) {
          const products = await MockBackend.getProducts();
          localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(ordersLocal.map(o => o.id === orderId ? { ...o, status, cancelReason } : o)));
          if (status === OrderStatus.COMPLETED && currentOrder.status !== OrderStatus.COMPLETED) {
            const exportsList = await MockBackend.getExports();
            const newProducts = products.map(p => {
              const item = currentOrder.items.find(it => it.productId === p.id);
              return item ? { ...p, stock: Math.max(0, (p.stock || 0) - item.quantity) } : p;
            });
            localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(newProducts));
            currentOrder.items.forEach(item => {
              const product = products.find(p => p.id === item.productId);
              if (product) {
                const id = `EXP${Date.now().toString().slice(-8)}_${product.id}`;
                const record: ExportRecord = {
                  id,
                  productId: product.id,
                  sku: product.sku,
                  name: product.name,
                  quantity: item.quantity,
                  orderId,
                  customerName: currentOrder.customerName,
                  customerPhone: currentOrder.customerPhone,
                  createdAt: new Date().toISOString(),
                };
                exportsList.unshift(record);
              }
            });
            localStorage.setItem(STORAGE_KEYS.EXPORTS, JSON.stringify(exportsList));
          }
          return;
        }
      } catch {}
      throw e;
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
  
  deleteOrder: async (orderId: string) => {
    if (!MockBackend.isOnlineMode()) {
      throw new Error('Chỉ hỗ trợ online');
    }
    try {
      const orderSnap = await withTimeout(get(ref(db, `orders/${orderId}`)));
      if (!orderSnap || !(orderSnap as any).exists || !(orderSnap as any).exists()) {
        return;
      }
      const order = (orderSnap as any).val() as Order;
      const products = await MockBackend.getProducts();
      const updates: any = {};
      updates[`orders/${orderId}`] = null;
      order.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          updates[`products/${product.id}/stock`] = product.stock + item.quantity;
        }
      });
      await withTimeout(update(ref(db), updates));
    } catch (e) {
      throw e;
    }
  },
  
  // Auth Simulation
  login: async (username: string, password: string): Promise<User | null> => {
    await delay(500);
    const auth = getAuthConfig();
    if (!auth) return null;
    const normalizedUsername = username.trim();
    const passwordHash = await sha256(password);
    if (normalizedUsername === auth.username && passwordHash === auth.passwordHash) {
      const user: User = { username: auth.username, name: 'Chủ Cửa Hàng', role: 'admin' };
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
    if (!u) return null;
    try {
      const auth = getAuthConfig();
      if (!auth) {
        localStorage.removeItem(STORAGE_KEYS.USER);
        return null;
      }
      const parsed = JSON.parse(u) as User;
      if (parsed.username === auth.username && parsed.role === 'admin') {
        return parsed;
      }
      localStorage.removeItem(STORAGE_KEYS.USER);
      return null;
    } catch {
      localStorage.removeItem(STORAGE_KEYS.USER);
      return null;
    }
  },

  exportData: async () => {
    const products = await MockBackend.getProducts();
    const orders = await MockBackend.getOrders();
    const customers = await MockBackend.getCustomers();
    const categories = await MockBackend.getCategories();
    const imports = await MockBackend.getImports();
    const exports = await MockBackend.getExports();
    const payments = await MockBackend.getPayments();
    return JSON.stringify({ products, orders, customers, categories, imports, exports, payments });
  },

  importData: async (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      const productsArr: Product[] = Array.isArray(data.products) ? data.products : [];
      const ordersArr: Order[] = Array.isArray(data.orders) ? data.orders : [];
      const customersArr: Customer[] = Array.isArray(data.customers) ? data.customers : [];
      const categoriesArr: Category[] = Array.isArray(data.categories) ? data.categories : [];
      const importsArr: ImportRecord[] = Array.isArray(data.imports) ? data.imports : [];
      const exportsArr: ExportRecord[] = Array.isArray(data.exports) ? data.exports : [];
      const paymentsArr: PaymentRecord[] = Array.isArray(data.payments) ? data.payments : [];

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
        if (importsArr.length) {
          await withTimeout(set(ref(db, 'imports'), toKeyed(importsArr)));
        }
        if (exportsArr.length) {
          await withTimeout(set(ref(db, 'exports'), toKeyed(exportsArr)));
        }
        if (paymentsArr.length) {
          await withTimeout(set(ref(db, 'payments'), toKeyed(paymentsArr)));
        }
      } else {
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(productsArr));
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(ordersArr));
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customersArr));
        if (categoriesArr.length) {
          localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categoriesArr));
        }
        if (importsArr.length) {
          localStorage.setItem(STORAGE_KEYS.IMPORTS, JSON.stringify(importsArr));
        }
        if (exportsArr.length) {
          localStorage.setItem(STORAGE_KEYS.EXPORTS, JSON.stringify(exportsArr));
        }
        if (paymentsArr.length) {
          localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(paymentsArr));
        }
      }
      return true;
    } catch (e) {
      console.error("Import failed", e);
      return false;
    }
  },

  deleteAllData: async () => {
    let onlineError: any = null;
    if (MockBackend.isOnlineMode()) {
      try {
        // Database này dành riêng cho ứng dụng, nên xóa tận gốc để tránh sót payments/công nợ.
        await withTimeout(set(ref(db), null));
      } catch (e) {
        console.error("Clear Firebase data failed", e);
        onlineError = e;
      }
    }
    
    // Luôn xóa sạch LocalStorage liên quan đến app
    Object.values(STORAGE_KEYS).forEach(key => {
      if (key !== STORAGE_KEYS.USER) { // Giữ lại phiên đăng nhập nếu muốn, hoặc xóa hết
        localStorage.removeItem(key);
      }
    });
    
    if (onlineError) {
      throw onlineError;
    }

    return true;
  }
};
