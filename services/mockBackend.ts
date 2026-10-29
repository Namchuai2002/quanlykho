import { Product, Order, OrderStatus, User, Category, Customer, ImportRecord, ImportLineItem, ImportStockPayload, ImportPaymentStatus, ExportRecord, PaymentRecord, CartItem } from '../types';
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

const pendingImportIds = new Set<string>();

export interface AdminAuthConfig {
  username: string;
  passwordHash: string;
  updatedAt: string;
}

export interface SessionUser extends User {
  _authUpdatedAt: string;
}

const FIREBASE_AUTH_PATH = '_auth/admin';

// --- HELPER FUNCTIONS ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const getAuthConfigLocal = (): AdminAuthConfig | null => {
  const raw = localStorage.getItem(STORAGE_KEYS.AUTH);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminAuthConfig;
  } catch {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    return null;
  }
};

const setAuthConfigLocal = (cfg: AdminAuthConfig) => {
  localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(cfg));
};

const readSingleValue = async <T>(path: string, ms: number): Promise<T | null> => {
  try {
    const snapshot = await withTimeoutRetry(() => get(child(ref(db), path)), ms, 2);
    if (snapshot && (snapshot as any).exists && (snapshot as any).exists()) {
      return (snapshot as any).val() as T;
    }
    return null;
  } catch {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), ms);
      const res = await fetch(`${sanitizeUrl(firebaseConfig.databaseURL)}/${path}.json`, { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        const json = await res.json();
        return json as T | null;
      }
      return null;
    } catch {
      return null;
    }
  }
};

const getAuthConfigFirebase = async (): Promise<AdminAuthConfig | null> => {
  if (!MockBackend.isOnlineMode()) return getAuthConfigLocal();
  try {
    const fbCfg = await readSingleValue<AdminAuthConfig>(FIREBASE_AUTH_PATH, 12000);
    if (fbCfg && fbCfg.username && fbCfg.passwordHash) {
      setAuthConfigLocal(fbCfg);
      return fbCfg;
    }
    const local = getAuthConfigLocal();
    // Migrate: nếu có auth cũ ở local mà Firebase chưa có → đẩy lên Firebase
    if (local) {
      try {
        await withTimeout(set(ref(db, FIREBASE_AUTH_PATH), local));
      } catch {}
    }
    return local;
  } catch {
    return getAuthConfigLocal();
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
  hasAdminAccount: () => !!getAuthConfigLocal(),
  hasAdminAccountAsync: async () => {
    const cfg = await getAuthConfigFirebase();
    return !!cfg;
  },
  refreshAuthCache: async () => {
    try {
      await getAuthConfigFirebase();
    } catch {}
  },
  setupAdminAccount: async (username: string, password: string) => {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) throw new Error('Vui lòng nhập tài khoản quản trị');
    if (password.length < 3) throw new Error('Mật khẩu phải có ít nhất 3 ký tự');
    const passwordHash = await sha256(password);
    const updatedAt = new Date().toISOString();
    const cfg: AdminAuthConfig = { username: normalizedUsername, passwordHash, updatedAt };

    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(set(ref(db, FIREBASE_AUTH_PATH), cfg));
      } catch (e) {
        // Fallback to local-only nếu Firebase lỗi
      }
    }
    setAuthConfigLocal(cfg);
    return { username: normalizedUsername };
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const auth = await getAuthConfigFirebase();
    if (!auth) throw new Error('Chưa có tài khoản quản trị');
    const currentHash = await sha256(currentPassword);
    if (currentHash !== auth.passwordHash) throw new Error('Mật khẩu hiện tại không đúng');
    if (newPassword.length < 3) throw new Error('Mật khẩu mới phải có ít nhất 3 ký tự');
    const passwordHash = await sha256(newPassword);
    const updatedAt = new Date().toISOString();
    const next: AdminAuthConfig = { ...auth, passwordHash, updatedAt };

    if (MockBackend.isOnlineMode()) {
      try {
        await withTimeout(set(ref(db, FIREBASE_AUTH_PATH), next));
      } catch (e) {
        throw new Error('Không thể cập nhật mật khẩu lên hệ thống online, kiểm tra kết nối.');
      }
    }
    setAuthConfigLocal(next);
    // Cập nhật session user hiện tại với authUpdatedAt mới để máy này không bị validateSession tự logout
    const rawUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (rawUser) {
      try {
        const session = JSON.parse(rawUser) as SessionUser;
        const nextUser: SessionUser = { ...session, _authUpdatedAt: updatedAt };
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(nextUser));
      } catch {}
    }
    return true;
  },
  updateCurrentUserName: async (name: string): Promise<User> => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Tên chủ cửa hàng không được để trống');
    const current = MockBackend.getCurrentUser();
    if (!current) throw new Error('Phiên đăng nhập đã hết hạn');
    const updatedUser: SessionUser = { ...(current as SessionUser), name: trimmedName };
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
    return { username: updatedUser.username, name: updatedUser.name, role: updatedUser.role };
  },
  validateSession: async (): Promise<{ valid: boolean; user: User | null }> => {
    const rawUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (!rawUser) {
      return { valid: false, user: null };
    }
    let session: SessionUser | null = null;
    try {
      session = JSON.parse(rawUser) as SessionUser;
    } catch {
      localStorage.removeItem(STORAGE_KEYS.USER);
      return { valid: false, user: null };
    }

    const authCfg = await getAuthConfigFirebase();
    if (!authCfg) {
      // Không có tài khoản admin nào tồn tại → logout
      localStorage.removeItem(STORAGE_KEYS.USER);
      return { valid: false, user: null };
    }

    // Kiểm tra username & role
    if (session.username !== authCfg.username || session.role !== 'admin') {
      localStorage.removeItem(STORAGE_KEYS.USER);
      return { valid: false, user: null };
    }

    // Kiểm tra phiên có cùng updatedAt với server auth không
    const sessionStamp = (session as any)._authUpdatedAt;
    if (sessionStamp && sessionStamp !== authCfg.updatedAt) {
      // Mật khẩu/tài khoản đã được đổi ở nơi khác (thời gian cập nhật khác) → logout
      localStorage.removeItem(STORAGE_KEYS.USER);
      return { valid: false, user: null };
    }

    // Stamp cũ (chưa có, phiên cũ): refresh stamp cho phiên này nếu không có, coi là hợp lệ nếu user trùng
    if (!sessionStamp) {
      const refreshed: SessionUser = { ...session, _authUpdatedAt: authCfg.updatedAt };
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(refreshed));
      return { valid: true, user: { username: refreshed.username, name: refreshed.name, role: refreshed.role } };
    }

    return { valid: true, user: { username: session.username, name: session.name, role: session.role } };
  },
  
  // Chuẩn hóa 1 bản ghi khách hàng (đảm bảo đủ trường, không làm mất dữ liệu gốc).
  normalizeCustomer: (raw: any): Customer | null => {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id ?? '').trim();
    if (!id) return null;
    return {
      ...raw,
      id,
      name: String(raw.name ?? ''),
      phone: String(raw.phone ?? ''),
      address: String(raw.address ?? ''),
      email: raw.email != null ? String(raw.email) : undefined,
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
    } as Customer;
  },

  // Khử trùng theo id: cùng id nghĩa là CÙNG MỘT bản ghi bị lưu lặp.
  // KHÔNG gộp các khách hàng khác nhau dù trùng tên (đó là người khác nhau).
  dedupeCustomers: (list: any[]): Customer[] => {
    const seenIds = new Set<string>();
    const out: Customer[] = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const c = MockBackend.normalizeCustomer(raw);
      if (!c) continue;
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      out.push(c);
    }
    return out;
  },

  // Khóa định danh khách hàng dùng để phát hiện trùng: ưu tiên số điện thoại,
  // nếu không có SĐT thì dùng tên đã chuẩn hóa.
  customerIdentityKey: (c: { name?: string; phone?: string }): string => {
    const phone = String(c.phone ?? '').replace(/[^0-9]/g, '');
    if (phone) return `phone:${phone}`;
    const name = String(c.name ?? '').trim().toLowerCase();
    return name ? `name:${name}` : '';
  },

  getCustomers: async () => {
    let list: any[] = [];
    if (MockBackend.isOnlineMode()) {
      try {
        list = await readPath<any>('customers', 12000);
      } catch (e) {
        list = [];
      }
    } else {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      list = data ? JSON.parse(data) : [];
    }
    // Luôn khử trùng theo id để danh sách không hiển thị lặp cùng một khách hàng.
    return MockBackend.dedupeCustomers(list);
  },
  addCustomer: async (name: string, phone: string, address: string = '', note: string = '', email: string = '') => {
    const trimmedName = (name || '').trim();
    const trimmedPhone = (phone || '').trim();
    const normPhone = trimmedPhone.replace(/[^0-9]/g, '');

    const existing = await MockBackend.getCustomers();

    // Chống trùng lặp: nếu đã tồn tại khách hàng cùng định danh (ưu tiên số điện thoại,
    // fallback tên khi cả hai đều chưa có SĐT) → trả về bản ghi cũ, KHÔNG tạo thêm.
    const duplicated = normPhone
      ? existing.find((c) => String(c.phone || '').replace(/[^0-9]/g, '') === normPhone)
      : existing.find(
          (c) => !String(c.phone || '').trim() && String(c.name || '').trim().toLowerCase() === trimmedName.toLowerCase(),
        );

    if (duplicated) {
      // Chỉ bổ sung thông tin còn thiếu, không ghi đè dữ liệu đã có.
      const patch: Record<string, string> = {};
      if (!duplicated.address && address) patch.address = address;
      if (!duplicated.email && email) patch.email = email;
      if (!duplicated.note && note) patch.note = note;
      if (Object.keys(patch).length > 0) {
        await MockBackend.updateCustomer(duplicated.id, patch);
      }
      return duplicated;
    }

    // Sinh id duy nhất: tránh trùng khi tạo liên tiếp trong cùng một mili-giây.
    const baseId = Date.now();
    const usedIds = new Set(existing.map((c) => c.id));
    let id = baseId.toString();
    let offset = 0;
    while (usedIds.has(id)) {
      offset += 1;
      id = (baseId + offset).toString();
    }

    const newCust = { id, name: trimmedName, phone: trimmedPhone, address, note, email, createdAt: new Date().toISOString() };
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

  importStock: async (payload: ImportStockPayload): Promise<ImportRecord> => {
    const supplier = (payload?.supplierName || '').trim();
    const paymentStatus = payload?.paymentStatus;
    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    const requestId = (payload?.requestId || '').trim();

    if (!supplier) throw new Error('Vui lòng nhập nhà cung cấp');
    if (paymentStatus !== 'paid' && paymentStatus !== 'unpaid') {
      throw new Error('Vui lòng chọn trạng thái thanh toán (Đã thanh toán hoặc Chưa thanh toán)');
    }
    if (rawItems.length === 0) throw new Error('Vui lòng chọn hàng hóa');

    const mergedQty = new Map<string, { quantity: number; unitCost: number }>();
    for (const it of rawItems) {
      if (!it?.productId) throw new Error('Thiếu mã hàng hóa');
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
        throw new Error('Số lượng nhập phải lớn hơn 0');
      }
      if (!Number.isFinite(it.unitCost) || it.unitCost < 0) {
        throw new Error('Giá nhập không hợp lệ');
      }
      const cur = mergedQty.get(it.productId);
      if (cur) {
        mergedQty.set(it.productId, {
          quantity: cur.quantity + Math.floor(it.quantity),
          unitCost: Math.floor(it.unitCost),
        });
      } else {
        mergedQty.set(it.productId, {
          quantity: Math.floor(it.quantity),
          unitCost: Math.floor(it.unitCost),
        });
      }
    }

    const lookupImport = async (importId: string): Promise<ImportRecord | undefined> => {
      try {
        const localRaw = localStorage.getItem(STORAGE_KEYS.IMPORTS);
        const localList: ImportRecord[] = localRaw ? JSON.parse(localRaw) : [];
        const localHit = localList.find((i) => i.id === importId);
        if (localHit) return localHit;
      } catch {}
      if (MockBackend.isOnlineMode()) {
        try {
          const snap = await withTimeout(get(ref(db, `imports/${importId}`)));
          if (snap && (snap as any).exists && (snap as any).exists()) {
            return (snap as any).val() as ImportRecord;
          }
        } catch {}
      }
      const list = await MockBackend.getImports();
      return list.find((i) => i.id === importId);
    };

    const id = requestId || `IMP${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(2, 5)}`;
    if (pendingImportIds.has(id)) {
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 80));
        const found = await lookupImport(id);
        if (found) return found;
      }
      throw new Error('Phiếu nhập đang được xử lý. Vui lòng không bấm xác nhận nhiều lần.');
    }
    pendingImportIds.add(id);

    try {
      const already = await lookupImport(id);
      if (already) return already;

      const products = await MockBackend.getProducts();
      const lineItems: ImportLineItem[] = [];
      const stockDelta = new Map<string, number>();

      for (const [productId, it] of mergedQty.entries()) {
        const product = products.find((p) => p.id === productId);
        if (!product) throw new Error(`Sản phẩm không tồn tại`);
        const totalCost = it.unitCost * it.quantity;
        lineItems.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: it.quantity,
          unitCost: it.unitCost,
          totalCost,
        });
        stockDelta.set(product.id, (stockDelta.get(product.id) || 0) + it.quantity);
      }

      const slipTotal = lineItems.reduce((s, l) => s + l.totalCost, 0);
      const first = lineItems[0];
      const now = new Date().toISOString();
      const paidNow = paymentStatus === 'paid';

      const record: ImportRecord = {
        id,
        productId: first.productId,
        sku: first.sku,
        name: lineItems.length > 1 ? `${first.name} (+${lineItems.length - 1})` : first.name,
        quantity: lineItems.reduce((s, l) => s + l.quantity, 0),
        unitCost: first.unitCost,
        totalCost: slipTotal,
        createdAt: now,
        supplierName: supplier,
        paidAmount: paidNow ? slipTotal : 0,
        paymentStatus,
        items: lineItems,
      };
      if (paidNow) record.lastPaidAt = now;

      const paymentId = `PAY${id.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`;
      const pay: PaymentRecord | null =
        paidNow && slipTotal > 0
          ? {
              id: paymentId,
              kind: 'payable',
              importId: id,
              amount: slipTotal,
              method: 'cash',
              createdAt: now,
              supplierName: supplier,
            }
          : null;

      const writeLocal = async () => {
        let list: ImportRecord[] = [];
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.IMPORTS);
          list = raw ? JSON.parse(raw) : [];
        } catch {
          list = [];
        }
        if (list.some((i) => i.id === id)) return;
        localStorage.setItem(STORAGE_KEYS.IMPORTS, JSON.stringify([record, ...list]));
        const latestProducts = await MockBackend.getProducts();
        const newProducts = latestProducts.map((p) => {
          const d = stockDelta.get(p.id);
          if (!d) return p;
          const snapshot = products.find((x) => x.id === p.id);
          const target = (snapshot?.stock || 0) + d;
          return { ...p, stock: target, importDate: now };
        });
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(newProducts));
        if (pay) {
          const payments = await MockBackend.getPayments();
          if (!payments.some((p) => p.id === pay.id)) {
            localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([pay, ...payments]));
          }
        }
      };

      if (MockBackend.isOnlineMode()) {
        try {
          const updates: any = {};
          updates['imports/' + id] = record;
          for (const p of products) {
            const d = stockDelta.get(p.id);
            if (d) {
              updates['products/' + p.id + '/stock'] = (p.stock || 0) + d;
              updates['products/' + p.id + '/importDate'] = now;
            }
          }
          if (pay) updates['payments/' + pay.id] = pay;
          await withTimeout(update(ref(db), updates));
          await writeLocal();
        } catch (e) {
          const afterFail = await lookupImport(id);
          if (afterFail) return afterFail;
          try {
            await writeLocal();
          } catch {
            throw e;
          }
        }
      } else {
        await writeLocal();
      }
      return record;
    } finally {
      pendingImportIds.delete(id);
    }
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

    const doWriteWith = async (ctx: { imp: ImportRecord; existingPayments: PaymentRecord[] }) => {
      const { imp, existingPayments } = ctx;
      if (!imp || typeof imp.totalCost !== 'number') throw new Error('Phiếu nhập không hợp lệ');
      const paidFromRecords = existingPayments
        .filter(p => p.kind === 'payable' && p.importId === importId)
        .reduce((s, p) => s + p.amount, 0);
      const paidBase = Math.max(paidFromRecords, imp.paidAmount || 0);
      if (paidBase + amount > (imp.totalCost as number)) {
        throw new Error('Số tiền thanh toán vượt quá tổng phải trả');
      }
      const paid = paidBase + amount;
      const paymentStatus = paid >= (imp.totalCost as number) ? 'paid' as const : 'unpaid' as const;
      const payment: PaymentRecord = { id, kind: 'payable', importId, amount, method, createdAt: now, note, supplierName: imp.supplierName || 'Nhà cung cấp' };
      return { payment, paid, paymentStatus };
    };

    // --- ONLINE (FIREBASE) PATH ---
    if (MockBackend.isOnlineMode()) {
      try {
        const impSnap = await withTimeout(get(ref(db, `imports/${importId}`)));
        if (!impSnap || !(impSnap as any).exists || !(impSnap as any).exists()) {
          throw new Error('Phiếu nhập không tồn tại');
        }
        const imp = (impSnap as any).val() as ImportRecord;
        const existingPayments = await MockBackend.getPayments();
        const { payment, paid, paymentStatus } = await doWriteWith({ imp, existingPayments });

        const updates: any = {};
        updates[`payments/${id}`] = payment;
        updates[`imports/${importId}/paidAmount`] = paid;
        updates[`imports/${importId}/lastPaidAt`] = now;
        updates[`imports/${importId}/paymentStatus`] = paymentStatus;
        await withTimeout(update(ref(db), updates));

        // Đồng bộ local storage
        const localImports = await MockBackend.getImports();
        localStorage.setItem(STORAGE_KEYS.IMPORTS, JSON.stringify(localImports.map(i => i.id === importId ? { ...i, paidAmount: paid, lastPaidAt: now, paymentStatus } : i)));
        const localPayments = await MockBackend.getPayments();
        localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([payment, ...localPayments.filter(p => p.id !== id)]));
        return payment;
      } catch (e) {
        // Fallback offline nếu Firebase lỗi
      }
    }

    // --- OFFLINE (LOCALSTORAGE) PATH ---
    const imports = await MockBackend.getImports();
    const imp = imports.find(i => i.id === importId);
    if (!imp) throw new Error('Phiếu nhập không tồn tại');
    const existingPayments = await MockBackend.getPayments();
    const { payment, paid, paymentStatus } = await doWriteWith({ imp, existingPayments });
    localStorage.setItem(STORAGE_KEYS.IMPORTS, JSON.stringify(imports.map(i => i.id === importId ? { ...i, paidAmount: paid, lastPaidAt: now, paymentStatus } : i)));
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([payment, ...existingPayments.filter(p => p.id !== id)]));
    return payment;
  },

  updateImport: async (
    importId: string,
    patch: Partial<Pick<ImportRecord, 'createdAt' | 'supplierName'>>,
  ) => {
    const buildSafePatch = (current: ImportRecord) => {
      const safePatch: any = {};
      if (typeof patch.supplierName === 'string') safePatch.supplierName = patch.supplierName;
      if (typeof patch.createdAt === 'string' && patch.createdAt.trim()) {
        const d = new Date(patch.createdAt);
        if (!Number.isNaN(d.getTime())) safePatch.createdAt = d.toISOString();
      }
      return safePatch;
    };

    const patchLocal = (merged: ImportRecord) => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.IMPORTS);
        const list: ImportRecord[] = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(list) ? list.slice() : [];
        const idx = next.findIndex((i) => i.id === importId);
        if (idx >= 0) next[idx] = merged;
        localStorage.setItem(STORAGE_KEYS.IMPORTS, JSON.stringify(next));
      } catch {}
    };

    if (!MockBackend.isOnlineMode()) {
      const importsLocal = await MockBackend.getImports();
      const idx = importsLocal.findIndex((i) => i.id === importId);
      if (idx === -1) throw new Error('Phiếu nhập không tồn tại');
      const current = importsLocal[idx];
      const merged = { ...current, ...buildSafePatch(current) };
      importsLocal[idx] = merged;
      localStorage.setItem(STORAGE_KEYS.IMPORTS, JSON.stringify(importsLocal));
      return merged;
    }

    const snap = await withTimeout(get(ref(db, `imports/${importId}`)));
    if (!snap || !(snap as any).exists || !(snap as any).exists()) {
      throw new Error('Phiếu nhập không tồn tại');
    }
    const current = (snap as any).val() as ImportRecord;
    const merged = { ...current, ...buildSafePatch(current) } as ImportRecord;
    const updates: any = {};
    updates[`imports/${importId}`] = merged;
    await withTimeout(update(ref(db), updates));
    patchLocal(merged);
    return merged;
  },

  // Chỉnh sửa toàn bộ phiếu nhập: NCC, ngày nhập, hàng hóa, số lượng, đơn giá, ghi chú, trạng thái TT.
  // Tồn kho được điều chỉnh theo chênh lệch (delta) để tránh cộng/trừ trùng lặp; công nợ được đối soát lại.
  editImport: async (
    importId: string,
    payload: {
      supplierName: string;
      createdAt: string;
      paymentStatus: ImportPaymentStatus;
      note?: string;
      items: { productId: string; quantity: number; unitCost: number }[];
    },
  ): Promise<ImportRecord> => {
    const supplier = (payload?.supplierName || '').trim();
    const paymentStatus = payload?.paymentStatus;
    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    const note = typeof payload?.note === 'string' ? payload.note.trim() : '';

    if (!supplier) throw new Error('Vui lòng nhập nhà cung cấp');
    if (paymentStatus !== 'paid' && paymentStatus !== 'unpaid') {
      throw new Error('Vui lòng chọn trạng thái thanh toán (Đã thanh toán hoặc Chưa thanh toán)');
    }
    if (rawItems.length === 0) throw new Error('Vui lòng chọn hàng hóa');

    const createdDate = payload?.createdAt ? new Date(payload.createdAt) : new Date();
    if (Number.isNaN(createdDate.getTime())) throw new Error('Ngày nhập không hợp lệ');
    const createdAtISO = createdDate.toISOString();

    const mergedQty = new Map<string, { quantity: number; unitCost: number }>();
    for (const it of rawItems) {
      if (!it?.productId) throw new Error('Thiếu mã hàng hóa');
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
        throw new Error('Số lượng nhập phải lớn hơn 0');
      }
      if (!Number.isFinite(it.unitCost) || it.unitCost < 0) {
        throw new Error('Giá nhập không hợp lệ');
      }
      const q = Math.floor(it.quantity);
      const c = Math.floor(it.unitCost);
      const cur = mergedQty.get(it.productId);
      if (cur) mergedQty.set(it.productId, { quantity: cur.quantity + q, unitCost: c });
      else mergedQty.set(it.productId, { quantity: q, unitCost: c });
    }

    const imports = await MockBackend.getImports();
    const current = imports.find((i) => i.id === importId);
    if (!current) throw new Error('Phiếu nhập không tồn tại');

    const products = await MockBackend.getProducts();

    const lineItems: ImportLineItem[] = [];
    const newQtyByProduct = new Map<string, number>();
    for (const [productId, it] of mergedQty.entries()) {
      const product = products.find((p) => p.id === productId);
      if (!product) throw new Error('Sản phẩm không tồn tại trong hệ thống');
      const totalCost = it.unitCost * it.quantity;
      lineItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: it.quantity,
        unitCost: it.unitCost,
        totalCost,
      });
      newQtyByProduct.set(product.id, (newQtyByProduct.get(product.id) || 0) + it.quantity);
    }

    const qtyByProductOf = (imp: ImportRecord): Map<string, number> => {
      const map = new Map<string, number>();
      const items = Array.isArray(imp.items) && imp.items.length > 0 ? imp.items : null;
      if (items) {
        items.forEach((x) => {
          if (!x?.productId) return;
          map.set(x.productId, (map.get(x.productId) || 0) + (x.quantity || 0));
        });
      } else if (imp.productId) {
        map.set(imp.productId, imp.quantity || 0);
      }
      return map;
    };
    const oldQtyByProduct = qtyByProductOf(current);

    const stockDelta = new Map<string, number>();
    const allProductIds = new Set<string>([...oldQtyByProduct.keys(), ...newQtyByProduct.keys()]);
    allProductIds.forEach((pid) => {
      const d = (newQtyByProduct.get(pid) || 0) - (oldQtyByProduct.get(pid) || 0);
      if (d !== 0) stockDelta.set(pid, d);
    });

    const newTotalCost = lineItems.reduce((s, l) => s + l.totalCost, 0);
    const totalQty = lineItems.reduce((s, l) => s + l.quantity, 0);
    const first = lineItems[0];
    const now = new Date().toISOString();
    const autoPayId = `PAY${importId.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`;

    const allPayments = await MockBackend.getPayments();
    const relatedPayments = allPayments.filter(
      (p) => p.kind === 'payable' && p.importId === importId,
    );
    const existingAutoPay = relatedPayments.find((p) => p.id === autoPayId) || null;
    const manualSum = relatedPayments
      .filter((p) => p.id !== autoPayId)
      .reduce((s, p) => s + (p.amount || 0), 0);

    const autoPayAmount = paymentStatus === 'paid' ? Math.max(0, newTotalCost - manualSum) : 0;
    const nextAutoPay: PaymentRecord | null =
      autoPayAmount > 0
        ? {
            id: autoPayId,
            kind: 'payable',
            importId,
            amount: autoPayAmount,
            method: existingAutoPay?.method || 'cash',
            createdAt: existingAutoPay?.createdAt || now,
            supplierName: supplier,
          }
        : null;

    const updatedRecord: ImportRecord = {
      id: importId,
      productId: first.productId,
      sku: first.sku,
      name: lineItems.length > 1 ? `${first.name} (+${lineItems.length - 1})` : first.name,
      quantity: totalQty,
      unitCost: first.unitCost,
      totalCost: newTotalCost,
      createdAt: createdAtISO,
      supplierName: supplier,
      paidAmount: paymentStatus === 'paid' ? newTotalCost : 0,
      paymentStatus,
      items: lineItems,
    };
    if (note) updatedRecord.note = note;
    if (paymentStatus === 'paid') updatedRecord.lastPaidAt = existingAutoPay?.createdAt || now;

    const readList = <T>(key: string): T[] => {
      try {
        const raw = localStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    };

    const applyLocal = () => {
      const importsLocal = readList<ImportRecord>(STORAGE_KEYS.IMPORTS);
      localStorage.setItem(
        STORAGE_KEYS.IMPORTS,
        JSON.stringify(importsLocal.map((i) => (i.id === importId ? updatedRecord : i))),
      );

      const paymentsLocal = readList<PaymentRecord>(STORAGE_KEYS.PAYMENTS).filter(
        (p) => p.id !== autoPayId,
      );
      if (nextAutoPay) paymentsLocal.unshift(nextAutoPay);
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(paymentsLocal));

      if (stockDelta.size > 0) {
        const productsLocal = readList<Product>(STORAGE_KEYS.PRODUCTS);
        const nextProducts = productsLocal.map((p) => {
          const d = stockDelta.get(p.id);
          if (!d) return p;
          return { ...p, stock: Math.max(0, (p.stock || 0) + d), importDate: now };
        });
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(nextProducts));
      }
    };

    if (!MockBackend.isOnlineMode()) {
      applyLocal();
      return updatedRecord;
    }

    try {
      const updates: Record<string, any> = {};
      updates[`imports/${importId}`] = updatedRecord;
      stockDelta.forEach((d, pid) => {
        const product = products.find((p) => p.id === pid);
        if (!product) return;
        updates[`products/${pid}/stock`] = Math.max(0, (product.stock || 0) + d);
        updates[`products/${pid}/importDate`] = now;
      });
      updates[`payments/${autoPayId}`] = nextAutoPay;
      await withTimeout(update(ref(db), updates));
      applyLocal();
      return updatedRecord;
    } catch (e) {
      try {
        applyLocal();
        return updatedRecord;
      } catch {
        throw e;
      }
    }
  },

  deleteImport: async (importId: string) => {
    const qtyByProductOf = (imp: ImportRecord | null): Map<string, number> => {
      const map = new Map<string, number>();
      if (!imp) return map;
      const items = Array.isArray(imp.items) && imp.items.length > 0 ? imp.items : null;
      if (items) {
        items.forEach((it) => {
          if (!it?.productId) return;
          map.set(it.productId, (map.get(it.productId) || 0) + (it.quantity || 0));
        });
      } else if (imp.productId) {
        map.set(imp.productId, imp.quantity || 0);
      }
      return map;
    };

    const applyLocalDelete = (imp: ImportRecord | null) => {
      const readList = <T>(key: string): T[] => {
        try {
          const raw = localStorage.getItem(key);
          const list = raw ? JSON.parse(raw) : [];
          return Array.isArray(list) ? list : [];
        } catch {
          return [];
        }
      };

      const importsLocal = readList<ImportRecord>(STORAGE_KEYS.IMPORTS);
      localStorage.setItem(
        STORAGE_KEYS.IMPORTS,
        JSON.stringify(importsLocal.filter((i) => i.id !== importId)),
      );

      const paymentsLocal = readList<PaymentRecord>(STORAGE_KEYS.PAYMENTS);
      localStorage.setItem(
        STORAGE_KEYS.PAYMENTS,
        JSON.stringify(paymentsLocal.filter((p) => p.importId !== importId)),
      );

      // Đảo ngược tồn kho đã cộng khi nhập
      const qtyByProduct = qtyByProductOf(imp);
      if (qtyByProduct.size > 0) {
        const productsLocal = readList<Product>(STORAGE_KEYS.PRODUCTS);
        const nextProducts = productsLocal.map((p) => {
          const qty = qtyByProduct.get(p.id);
          return qty ? { ...p, stock: Math.max(0, (p.stock || 0) - qty) } : p;
        });
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(nextProducts));
      }
    };

    const [payments, products] = await Promise.all([
      MockBackend.getPayments(),
      MockBackend.getProducts(),
    ]);
    const relatedPayments = payments.filter((p) => p.kind === 'payable' && p.importId === importId);

    if (!MockBackend.isOnlineMode()) {
      const importsLocal = await MockBackend.getImports();
      const imp = importsLocal.find((i) => i.id === importId) || null;
      applyLocalDelete(imp);
      return;
    }

    try {
      const snap = await withTimeout(get(ref(db, `imports/${importId}`)));
      const firebaseImp =
        snap && (snap as any).exists && (snap as any).exists()
          ? ((snap as any).val() as ImportRecord)
          : null;
      const localImports = await MockBackend.getImports();
      const imp = firebaseImp || localImports.find((i) => i.id === importId) || null;

      const updates: Record<string, any> = {};
      updates[`imports/${importId}`] = null;
      relatedPayments.forEach((p) => {
        updates[`payments/${p.id}`] = null;
      });
      qtyByProductOf(imp).forEach((qty, productId) => {
        const product = products.find((p) => p.id === productId);
        if (product) updates[`products/${product.id}/stock`] = Math.max(0, (product.stock || 0) - qty);
      });

      await withTimeout(update(ref(db), updates));
      applyLocalDelete(imp);
    } catch (e) {
      try {
        const importsLocal = await MockBackend.getImports();
        const imp = importsLocal.find((i) => i.id === importId) || null;
        applyLocalDelete(imp);
        return;
      } catch {}
      throw e;
    }
  },

  getDebtBundle: async () => {
    const [orders, imports, payments] = await Promise.all([
      MockBackend.getOrders(),
      MockBackend.getImports(),
      MockBackend.getPayments(),
    ]);
    return { orders, imports, payments };
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
      const results = { orders: 0, imports: 0, payments: 0 };
      
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

      // 3. Sync Import paidAmount
      const localImports = JSON.parse(localStorage.getItem(STORAGE_KEYS.IMPORTS) || '[]');
      const firebaseImports = await readPath<ImportRecord>('imports', 12000);
      const fbImportMap = new Map(firebaseImports.map(i => [i.id, i]));
      
      const importUpdates: any = {};
      localImports.forEach((li: ImportRecord) => {
        const fi = fbImportMap.get(li.id);
        if (fi) {
          const lPaid = li.paidAmount || 0;
          const fPaid = fi.paidAmount || 0;
          if (lPaid > fPaid) {
            importUpdates[`imports/${li.id}/paidAmount`] = lPaid;
            if (li.lastPaidAt) importUpdates[`imports/${li.id}/lastPaidAt`] = li.lastPaidAt;
          }
        }
      });
      
      if (Object.keys(importUpdates).length > 0) {
        await withTimeout(update(ref(db), importUpdates));
        results.imports = Object.keys(importUpdates).length;
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

  createOrder: async (orderData: Omit<Order, 'id' | 'createdAt'> & { createdAt?: string }) => {
    const products = await MockBackend.getProducts();

    // Check stock locally first
    for (const item of orderData.items) {
      const product = products.find(p => p.id === item.productId);
      if (!product || product.stock < item.quantity) {
        throw new Error(`Sản phẩm ${item.name} không đủ hàng.`);
      }
    }

    const createdAt = MockBackend.normalizeOrderDate(orderData.createdAt);

    const newOrderId = `DH${Date.now().toString().slice(-6)}`;
    const newOrder: Order = {
      ...orderData,
      id: newOrderId,
      createdAt,
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

  normalizeOrderDate: (value?: string) => {
    const raw = (value || '').trim();
    const d = raw ? new Date(raw) : new Date();
    if (Number.isNaN(d.getTime())) throw new Error('Ngày đơn hàng không hợp lệ');
    return d.toISOString();
  },

  updateOrder: async (
    orderId: string,
    patch: Partial<Pick<Order, 'customerName' | 'customerPhone' | 'address' | 'totalAmount' | 'discountPercent' | 'createdAt'>> & {
      items?: CartItem[];
    },
  ) => {
    const applyCreatedAtSideEffects = (orderIdToSync: string, createdAt: string) => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.EXPORTS);
        const list: ExportRecord[] = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list) && list.some((e) => e.orderId === orderIdToSync)) {
          localStorage.setItem(
            STORAGE_KEYS.EXPORTS,
            JSON.stringify(list.map((e) => (e.orderId === orderIdToSync ? { ...e, createdAt } : e))),
          );
        }
      } catch {}
    };

    const patchLocalOrder = (merged: Order) => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
        const list: Order[] = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(list) ? list.slice() : [];
        const idx = next.findIndex((o) => o.id === orderId);
        if (idx >= 0) next[idx] = merged;
        else next.unshift(merged);
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(next));
      } catch {}
    };

    const buildSafePatch = (current: Order) => {
      const safePatch: any = {};
      if (typeof patch.customerName === 'string') safePatch.customerName = patch.customerName;
      if (typeof patch.customerPhone === 'string') safePatch.customerPhone = patch.customerPhone;
      if (typeof patch.address === 'string') safePatch.address = patch.address;
      if (typeof patch.totalAmount === 'number') safePatch.totalAmount = patch.totalAmount;
      if (typeof patch.discountPercent === 'number') safePatch.discountPercent = patch.discountPercent;
      if (typeof patch.createdAt === 'string' && patch.createdAt.trim()) {
        safePatch.createdAt = MockBackend.normalizeOrderDate(patch.createdAt);
      }
      if (patch.items && current.status !== OrderStatus.COMPLETED) {
        safePatch.items = patch.items;
      }
      return safePatch;
    };

    if (!MockBackend.isOnlineMode()) {
      const ordersLocal = await MockBackend.getOrders();
      const idx = ordersLocal.findIndex(o => o.id === orderId);
      if (idx === -1) throw new Error('Đơn hàng không tồn tại');
      const current = ordersLocal[idx];
      const safePatch = buildSafePatch(current);
      const merged = { ...current, ...safePatch };
      ordersLocal[idx] = merged;
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(ordersLocal));
      if (safePatch.createdAt && safePatch.createdAt !== current.createdAt) {
        applyCreatedAtSideEffects(orderId, safePatch.createdAt);
      }
      return merged;
    }

    const orderSnap = await withTimeout(get(ref(db, `orders/${orderId}`)));
    if (!orderSnap || !(orderSnap as any).exists || !(orderSnap as any).exists()) {
      throw new Error('Đơn hàng không tồn tại');
    }
    const current = (orderSnap as any).val() as Order;
    const safePatch = buildSafePatch(current);
    const merged = { ...current, ...safePatch } as Order;
    const updates: any = {};
    updates[`orders/${orderId}`] = merged;

    if (safePatch.createdAt && safePatch.createdAt !== current.createdAt) {
      const exportsList = await MockBackend.getExports();
      exportsList
        .filter((e) => e.orderId === orderId)
        .forEach((e) => {
          updates[`exports/${e.id}`] = { ...e, createdAt: safePatch.createdAt };
        });
    }

    await withTimeout(update(ref(db), updates));
    patchLocalOrder(merged);
    if (safePatch.createdAt && safePatch.createdAt !== current.createdAt) {
      applyCreatedAtSideEffects(orderId, safePatch.createdAt);
    }
    return merged;
  },
  
  deleteOrder: async (orderId: string) => {
    const applyLocalDelete = (order: Order | null) => {
      const readList = <T>(key: string): T[] => {
        try {
          const raw = localStorage.getItem(key);
          const list = raw ? JSON.parse(raw) : [];
          return Array.isArray(list) ? list : [];
        } catch {
          return [];
        }
      };

      const ordersLocal = readList<Order>(STORAGE_KEYS.ORDERS);
      localStorage.setItem(
        STORAGE_KEYS.ORDERS,
        JSON.stringify(ordersLocal.filter((o) => o.id !== orderId)),
      );

      const paymentsLocal = readList<PaymentRecord>(STORAGE_KEYS.PAYMENTS);
      localStorage.setItem(
        STORAGE_KEYS.PAYMENTS,
        JSON.stringify(paymentsLocal.filter((p) => p.orderId !== orderId)),
      );

      const exportsLocal = readList<ExportRecord>(STORAGE_KEYS.EXPORTS);
      localStorage.setItem(
        STORAGE_KEYS.EXPORTS,
        JSON.stringify(exportsLocal.filter((e) => e.orderId !== orderId)),
      );

      if (order?.status === OrderStatus.COMPLETED && Array.isArray(order.items)) {
        const qtyByProduct = new Map<string, number>();
        order.items.forEach((item) => {
          if (!item?.productId) return;
          qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + (item.quantity || 0));
        });
        if (qtyByProduct.size > 0) {
          const productsLocal = readList<Product>(STORAGE_KEYS.PRODUCTS);
          const nextProducts = productsLocal.map((p) => {
            const qty = qtyByProduct.get(p.id);
            return qty ? { ...p, stock: (p.stock || 0) + qty } : p;
          });
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(nextProducts));
        }
      }
    };

    const [payments, exportsList, products] = await Promise.all([
      MockBackend.getPayments(),
      MockBackend.getExports(),
      MockBackend.getProducts(),
    ]);
    const relatedPayments = payments.filter((p) => p.kind === 'receivable' && p.orderId === orderId);
    const relatedExports = exportsList.filter((e) => e.orderId === orderId);

    if (!MockBackend.isOnlineMode()) {
      const ordersLocal = await MockBackend.getOrders();
      const order = ordersLocal.find((o) => o.id === orderId) || null;
      applyLocalDelete(order);
      return;
    }

    try {
      const orderSnap = await withTimeout(get(ref(db, `orders/${orderId}`)));
      const firebaseOrder =
        orderSnap && (orderSnap as any).exists && (orderSnap as any).exists()
          ? ((orderSnap as any).val() as Order)
          : null;
      const localOrders = await MockBackend.getOrders();
      const order = firebaseOrder || localOrders.find((o) => o.id === orderId) || null;

      const updates: Record<string, any> = {};
      updates[`orders/${orderId}`] = null;
      relatedPayments.forEach((p) => {
        updates[`payments/${p.id}`] = null;
      });
      relatedExports.forEach((e) => {
        updates[`exports/${e.id}`] = null;
      });

      // Chỉ hoàn kho khi đơn đã hoàn thành (khi đó mới trừ tồn và ghi phiếu xuất)
      if (order?.status === OrderStatus.COMPLETED && Array.isArray(order.items)) {
        const qtyByProduct = new Map<string, number>();
        order.items.forEach((item) => {
          if (!item?.productId) return;
          qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + (item.quantity || 0));
        });
        qtyByProduct.forEach((qty, productId) => {
          const product = products.find((p) => p.id === productId);
          if (product) updates[`products/${product.id}/stock`] = (product.stock || 0) + qty;
        });
      }

      await withTimeout(update(ref(db), updates));
      applyLocalDelete(order);
    } catch (e) {
      try {
        const ordersLocal = await MockBackend.getOrders();
        const order = ordersLocal.find((o) => o.id === orderId) || null;
        applyLocalDelete(order);
        return;
      } catch {}
      throw e;
    }
  },
  
  // Auth Simulation
  login: async (username: string, password: string): Promise<User | null> => {
    await delay(300);
    const auth = await getAuthConfigFirebase();
    if (!auth) return null;
    const normalizedUsername = username.trim();
    const passwordHash = await sha256(password);
    if (normalizedUsername === auth.username && passwordHash === auth.passwordHash) {
      const baseUser: SessionUser = {
        username: auth.username,
        name: 'Chủ Cửa Hàng',
        role: 'admin',
        _authUpdatedAt: auth.updatedAt,
      };
      // Giữ lại name cũ nếu user đã từng đổi tên chủ cửa hàng (nếu có phiên cũ)
      const rawOld = localStorage.getItem(STORAGE_KEYS.USER);
      if (rawOld) {
        try {
          const old = JSON.parse(rawOld) as any;
          if (old.name && typeof old.name === 'string') {
            baseUser.name = old.name;
          }
        } catch {}
      }
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(baseUser));
      return { username: baseUser.username, name: baseUser.name, role: baseUser.role };
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
      const auth = getAuthConfigLocal();
      const parsed = JSON.parse(u) as User;
      if (parsed.role !== 'admin') {
        localStorage.removeItem(STORAGE_KEYS.USER);
        return null;
      }
      // Nếu có cached auth local thì check username; nếu chưa (ví dụ offline + lần đầu sau clear storage)
      // thì trả về parsed nếu username hợp lệ (phần validate chính thức sẽ qua validateSession async)
      if (auth && parsed.username !== auth.username) {
        localStorage.removeItem(STORAGE_KEYS.USER);
        return null;
      }
      return { username: parsed.username, name: parsed.name, role: parsed.role };
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

  deleteAllData: async (options: { keepAdminAccount?: boolean } = {}): Promise<{
    firebaseDeletedNodes: string[];
    firebaseFailedNodes: { path: string; error: string }[];
    localCleared: boolean;
    adminAccountKept: boolean;
  }> => {
    const keepAdmin = options.keepAdminAccount !== false;
    const firebaseDeletedNodes: string[] = [];
    const firebaseFailedNodes: { path: string; error: string }[] = [];

    // Danh sách các node data cần xóa (luôn luôn)
    const dataNodes = ['products', 'orders', 'customers', 'categories', 'imports', 'exports', 'payments'];
    const allPathsToClear = [...dataNodes];
    if (!keepAdmin) allPathsToClear.push('_auth');

    if (MockBackend.isOnlineMode()) {
      // 1. Cách 1: dùng update() để xóa từng node riêng biệt cùng lúc → an toàn hơn set(ref(db), null)
      // (rules có thể chặn set() ở root nhưng cho phép update() từng child)
      try {
        const batch: Record<string, null> = {};
        allPathsToClear.forEach((p) => { batch[p] = null as any; });
        await withTimeout(update(ref(db), batch), 30 * 1000);
        firebaseDeletedNodes.push(...allPathsToClear);
      } catch (e0: any) {
        // Nếu batch xóa cùng lúc lỗi (ví dụ rules chặn bulk), thử xóa từng node từng cái
        for (const path of allPathsToClear) {
          try {
            await withTimeout(set(ref(db, path), null), 15 * 1000);
            firebaseDeletedNodes.push(path);
          } catch (e1: any) {
            const msg = (e1 && e1.message) ? String(e1.message) : (String(e1) || 'Lỗi không xác định');
            firebaseFailedNodes.push({ path, error: msg });
          }
        }
      }

      // 2. Fallback cuối: nếu cách trên vẫn sót dữ liệu → thử xóa root (nếu user đồng ý xóa cả tài khoản)
      //    Giữ lại root xóa khi keepAdmin=false và có node thất bại
      if (!keepAdmin && firebaseFailedNodes.length > 0) {
        try {
          await withTimeout(set(ref(db), null), 40 * 1000);
          firebaseDeletedNodes.length = 0;
          firebaseFailedNodes.length = 0;
          firebaseDeletedNodes.push('(root)');
        } catch (e2: any) {
          // Nếu vẫn thất bại → giữ nguyên danh sách failedNodes
        }
      }
    }

    // 3. Xóa local (LocalStorage) — keepAdmin true thì giữ lại AUTH + USER
    const keysToRemove: string[] = [
      STORAGE_KEYS.PRODUCTS,
      STORAGE_KEYS.CATEGORIES,
      STORAGE_KEYS.ORDERS,
      STORAGE_KEYS.CUSTOMERS,
      STORAGE_KEYS.IMPORTS,
      STORAGE_KEYS.EXPORTS,
      STORAGE_KEYS.PAYMENTS,
    ];
    if (!keepAdmin) {
      keysToRemove.push(STORAGE_KEYS.AUTH, STORAGE_KEYS.USER);
    } else {
      // Để an toàn: giữ USER session nếu tài khoản admin được keep (tránh logout đột ngột)
      // xóa USER session nếu không muốn giữ: bỏ STORAGE_KEYS.USER ra khỏi keep list
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // 4. Nếu Firebase còn lỗi → throw một lỗi tổng hợp nhưng vẫn trả về kết quả chi tiết
    if (firebaseFailedNodes.length > 0) {
      const err = new Error(
        `Không xóa được ${firebaseFailedNodes.length} mục trên Firebase: ` +
        firebaseFailedNodes.map((x) => `${x.path} (${x.error})`).join(', '),
      );
      (err as any).detail = {
        firebaseDeletedNodes,
        firebaseFailedNodes,
        localCleared: true,
        adminAccountKept: keepAdmin,
      };
      throw err;
    }

    return {
      firebaseDeletedNodes,
      firebaseFailedNodes,
      localCleared: true,
      adminAccountKept: keepAdmin,
    };
  }
};
