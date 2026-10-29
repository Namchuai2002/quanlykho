import React, { useEffect, useMemo, useState } from 'react';
import { MockBackend } from '../services/mockBackend';
import { analyzeBusinessData } from '../services/geminiService';
import { DebtService } from '../services/debtService';
import { Product, Order, OrderStatus, ImportRecord, ExportRecord, PaymentRecord } from '../types';
import {
  DollarSign, ShoppingBag, AlertTriangle, Sparkles, TrendingUp,
  Loader2, CheckCircle, Package, ArrowDownToLine, ArrowRight, Boxes,
  Wallet, HandCoins, RefreshCw, Plus, FileText, ClipboardList,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Legend, Cell,
} from 'recharts';

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#4f46e5', '#0ea5e9'];

/** Ngưỡng cảnh báo tồn kho thấp (dùng thống nhất toàn hệ thống). */
const LOW_STOCK_THRESHOLD = 10;

type RangeKey = 'today' | '7d' | 'month' | 'year';

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Hôm nay',
  '7d': '7 ngày qua',
  month: 'Tháng này',
  year: 'Năm nay',
};

const DAY_MS = 24 * 60 * 60 * 1000;

const formatMoney = (n: number) => `${Math.round(n || 0).toLocaleString('vi-VN')} ₫`;

const formatCompact = (n: number) => {
  const abs = Math.abs(n || 0);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${Math.round(n || 0)}`;
};

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('7d');
  const [aiInsight, setAiInsight] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, o, im, ex, pay] = await Promise.all([
        MockBackend.getProducts(),
        MockBackend.getOrders(),
        MockBackend.getImports(),
        MockBackend.getExports(),
        MockBackend.getPayments(),
      ]);
      setProducts(Array.isArray(p) ? p : []);
      setOrders(Array.isArray(o) ? o : []);
      setImports(Array.isArray(im) ? im : []);
      setExports(Array.isArray(ex) ? ex : []);
      setPayments(Array.isArray(pay) ? pay : []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setLoadError('Không tải được dữ liệu tổng quan. Vui lòng kiểm tra kết nối và thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // --- Giá vốn gần nhất theo sản phẩm (từ phiếu nhập), fallback giá bán ---
  const costMap = useMemo(() => {
    const map = new Map<string, { cost: number; at: number }>();
    imports.forEach(imp => {
      const at = new Date(imp.createdAt).getTime();
      DebtService.getImportLineItems(imp).forEach(li => {
        const cur = map.get(li.productId);
        if (!cur || at > cur.at) map.set(li.productId, { cost: li.unitCost || 0, at });
      });
    });
    return map;
  }, [imports]);

  const costOf = (p: Product) => costMap.get(p.id)?.cost ?? p.price ?? 0;

  // --- Bộ lọc thời gian ---
  const buckets = useMemo(() => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const res: { label: string; start: number; end: number }[] = [];

    if (range === 'today') {
      const s = startOfDay(now);
      res.push({ label: 'Hôm nay', start: s.getTime(), end: s.getTime() + DAY_MS });
    } else if (range === '7d') {
      for (let i = 6; i >= 0; i--) {
        const s = startOfDay(new Date(now.getTime() - i * DAY_MS));
        res.push({
          label: s.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
          start: s.getTime(),
          end: s.getTime() + DAY_MS,
        });
      }
    } else if (range === 'month') {
      let d = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      while (d < end) {
        res.push({
          label: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
          start: d.getTime(),
          end: d.getTime() + DAY_MS,
        });
        d = new Date(d.getTime() + DAY_MS);
      }
    } else {
      for (let m = 0; m <= now.getMonth(); m++) {
        res.push({
          label: `T${m + 1}`,
          start: new Date(now.getFullYear(), m, 1).getTime(),
          end: new Date(now.getFullYear(), m + 1, 1).getTime(),
        });
      }
    }
    return res;
  }, [range]);

  const rangeStart = buckets.length ? buckets[0].start : 0;
  const rangeEnd = buckets.length ? buckets[buckets.length - 1].end : Date.now();
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= rangeStart && t < rangeEnd;
  };

  // --- Biểu đồ tổng hợp (nhập - xuất - doanh thu theo kỳ) ---
  const chartData = useMemo(
    () =>
      buckets.map(b => {
        const importQty = imports.reduce((s, imp) => {
          const t = new Date(imp.createdAt).getTime();
          if (t < b.start || t >= b.end) return s;
          return s + DebtService.getImportLineItems(imp).reduce((q, li) => q + (li.quantity || 0), 0);
        }, 0);
        const exportQty = exports.reduce((s, ex) => {
          const t = new Date(ex.createdAt).getTime();
          return t >= b.start && t < b.end ? s + (ex.quantity || 0) : s;
        }, 0);
        const revenue = orders.reduce((s, o) => {
          if (o.status === OrderStatus.CANCELLED) return s;
          const t = new Date(o.createdAt).getTime();
          return t >= b.start && t < b.end ? s + o.totalAmount : s;
        }, 0);
        return { name: b.label, importQty, exportQty, revenue };
      }),
    [buckets, imports, exports, orders],
  );

  // --- KPI ---
  const inventoryValue = useMemo(
    () => products.reduce((s, p) => s + (p.stock || 0) * costOf(p), 0),
    [products, costMap],
  );
  const lowStockProducts = useMemo(
    () => products.filter(p => (p.stock || 0) <= LOW_STOCK_THRESHOLD).sort((a, b) => (a.stock || 0) - (b.stock || 0)),
    [products],
  );
  const importsInRange = useMemo(() => imports.filter(i => inRange(i.createdAt)), [imports, rangeStart, rangeEnd]);
  const ordersInRange = useMemo(
    () => orders.filter(o => o.status !== OrderStatus.CANCELLED && inRange(o.createdAt)),
    [orders, rangeStart, rangeEnd],
  );
  const revenueInRange = useMemo(() => ordersInRange.reduce((s, o) => s + o.totalAmount, 0), [ordersInRange]);

  // --- Công nợ ---
  const receivables = useMemo(() => DebtService.computeReceivables(orders, payments), [orders, payments]);
  const payables = useMemo(() => DebtService.computePayables(imports, payments), [imports, payments]);
  const receivableSummary = useMemo(() => DebtService.computeReceivableSummary(receivables), [receivables]);
  const payableSummary = useMemo(() => DebtService.computePayableSummary(payables), [payables]);

  const debtAlerts = useMemo(() => {
    const orderById = new Map<string, Order>(orders.map(o => [o.id, o] as [string, Order]));
    const list = [
      ...receivables
        .filter(r => r.outstanding > 0)
        .map(r => ({
          key: `r_${r.id}`,
          type: 'receivable' as const,
          name: r.name,
          contact: r.phone,
          amount: r.outstanding,
          dueDate: orderById.get(r.id)?.dueDate,
        })),
      ...payables
        .filter(p => p.outstanding > 0)
        .map(p => ({
          key: `p_${p.id}`,
          type: 'payable' as const,
          name: p.name,
          contact: undefined as string | undefined,
          amount: p.outstanding,
          dueDate: undefined as string | undefined,
        })),
    ];
    return list.sort((a, b) => b.amount - a.amount).slice(0, 6);
  }, [receivables, payables, orders]);

  // --- Cơ cấu tồn kho theo danh mục ---
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach(p => {
      const key = (p.category || 'Khác').trim() || 'Khác';
      map.set(key, (map.get(key) || 0) + (p.stock || 0));
    });
    return Array.from(map, ([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [products]);

  const recentImports = useMemo(
    () => imports.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [imports],
  );
  const recentOrders = useMemo(
    () => orders.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [orders],
  );

  const handleGetInsight = async () => {
    setLoadingAi(true);
    try {
      const insight = await analyzeBusinessData(products, orders);
      setAiInsight(insight);
    } catch (e) {
      setAiInsight('Không thể tải phân tích AI lúc này.');
    } finally {
      setLoadingAi(false);
    }
  };

  const todayMs = new Date().setHours(0, 0, 0, 0);
  const go = (page: string) => onNavigate?.(page);

  const statusBadge = (status: OrderStatus) => {
    const map: Record<OrderStatus, { cls: string; dot: string; label: string }> = {
      [OrderStatus.COMPLETED]: { cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'Hoàn thành' },
      [OrderStatus.PENDING]: { cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', label: 'Chờ xử lý' },
      [OrderStatus.SHIPPING]: { cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500', label: 'Đang giao' },
      [OrderStatus.CANCELLED]: { cls: 'bg-red-50 text-red-700', dot: 'bg-red-500', label: 'Đã hủy' },
    };
    const m = map[status] || map[OrderStatus.PENDING];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${m.cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
        {m.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-160px)] gap-3">
        <Loader2 className="animate-spin text-blue-600" size={44} />
        <p className="text-sm text-gray-500">Đang tải dữ liệu tổng quan...</p>
      </div>
    );
  }

  const kpiCards = [
    {
      label: 'Tổng sản phẩm', value: `${products.length}`, sub: 'Mặt hàng trong hệ thống',
      icon: Package, tone: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Giá trị tồn kho', value: formatMoney(inventoryValue), sub: 'Theo giá vốn nhập gần nhất',
      icon: Boxes, tone: 'bg-indigo-50 text-indigo-600',
    },
    {
      label: 'Phiếu nhập', value: `${importsInRange.length}`, sub: RANGE_LABELS[range],
      icon: ArrowDownToLine, tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Đơn hàng bán', value: `${ordersInRange.length}`, sub: RANGE_LABELS[range],
      icon: ShoppingBag, tone: 'bg-purple-50 text-purple-600',
    },
    {
      label: 'Công nợ phải thu', value: formatMoney(receivableSummary.outstanding), sub: `${receivableSummary.debtCount} đơn còn nợ`,
      icon: HandCoins, tone: 'bg-red-50 text-red-600',
    },
    {
      label: 'Công nợ phải trả', value: formatMoney(payableSummary.outstanding), sub: `${payableSummary.debtCount} phiếu còn nợ`,
      icon: Wallet, tone: 'bg-amber-50 text-amber-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Tổng Quan</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bức tranh kinh doanh của cửa hàng — số liệu lấy trực tiếp từ hệ thống.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-white p-1 rounded-lg shadow-sm border border-gray-100">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  range === r ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          <button
            onClick={loadData}
            className="p-2 bg-white border border-gray-100 rounded-lg shadow-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Tải lại dữ liệu"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Lỗi tải dữ liệu</p>
            <p className="text-red-600">{loadError}</p>
          </div>
          <button onClick={loadData} className="font-bold underline hover:no-underline shrink-0">Thử lại</button>
        </div>
      )}

      {/* ===== Thao tác nhanh ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Nhập hàng', icon: ArrowDownToLine, page: 'inventory', tone: 'text-emerald-600 bg-emerald-50 group-hover:bg-emerald-100' },
          { label: 'Bán hàng', icon: ShoppingBag, page: 'orders', tone: 'text-blue-600 bg-blue-50 group-hover:bg-blue-100' },
          { label: 'Thêm sản phẩm', icon: Plus, page: 'inventory', tone: 'text-purple-600 bg-purple-50 group-hover:bg-purple-100' },
          { label: 'Xem báo cáo', icon: FileText, page: 'debts', tone: 'text-amber-600 bg-amber-50 group-hover:bg-amber-100' },
        ].map(a => (
          <button
            key={a.label}
            onClick={() => go(a.page)}
            className="group flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all text-left"
          >
            <span className={`p-2.5 rounded-lg transition-colors ${a.tone}`}>
              <a.icon size={20} />
            </span>
            <span className="font-semibold text-gray-700 text-sm">{a.label}</span>
          </button>
        ))}
      </div>

      {/* ===== KPI Cards ===== */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        {kpiCards.map(c => (
          <div key={c.label} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all">
            <div className={`inline-flex p-2 rounded-xl mb-3 ${c.tone}`}>
              <c.icon size={20} />
            </div>
            <p className="text-xs text-gray-500 font-medium">{c.label}</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5 truncate" title={c.value}>{c.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 truncate">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ===== Biểu đồ nhập - xuất + cơ cấu tồn kho ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-600" />
              Nhập – Xuất kho
            </h3>
            <span className="text-xs text-gray-400">Đơn vị: số lượng sản phẩm</span>
          </div>
          <div className="h-[300px] w-full">
            {chartData.some(d => d.importQty > 0 || d.exportQty > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)' }}
                    formatter={(v: any, n: any) => [v.toLocaleString('vi-VN'), n === 'importQty' ? 'Nhập kho' : 'Xuất kho']}
                  />
                  <Legend formatter={(v) => (v === 'importQty' ? 'Nhập kho' : 'Xuất kho')} />
                  <Bar dataKey="importQty" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="exportQty" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Chưa có dữ liệu nhập/xuất trong kỳ này
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Boxes size={18} className="text-indigo-600" />
            Cơ cấu tồn kho
          </h3>
          <div className="h-[260px] w-full">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)' }}
                    formatter={(v: any, n: any) => [`${Number(v).toLocaleString('vi-VN')} SP`, n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Chưa có dữ liệu tồn kho
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Biểu đồ doanh thu ===== */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-600" />
            Doanh thu theo {range === 'year' ? 'tháng' : 'ngày'}
          </h3>
          <div className="text-right">
            <p className="text-xs text-gray-400">{RANGE_LABELS[range]}</p>
            <p className="text-lg font-bold text-emerald-600">{formatMoney(revenueInRange)}</p>
          </div>
        </div>
        <div className="h-[260px] w-full">
          {chartData.some(d => d.revenue > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={formatCompact} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)' }}
                  formatter={(v: any) => [formatMoney(Number(v)), 'Doanh thu']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Chưa có doanh thu trong kỳ này
            </div>
          )}
        </div>
      </div>

      {/* ===== Cảnh báo tồn kho + công nợ ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" />
              Sản phẩm sắp hết hàng
            </h3>
            <button onClick={() => go('inventory')} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Kho hàng <ArrowRight size={13} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/70 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Mã SP</th>
                  <th className="px-5 py-3">Tên sản phẩm</th>
                  <th className="px-5 py-3 text-right">Tồn</th>
                  <th className="px-5 py-3 text-right">Tồn tối thiểu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lowStockProducts.slice(0, 6).map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => go('inventory')}>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.sku}</td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-800 max-w-[180px] truncate" title={p.name}>{p.name}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-bold ${(p.stock || 0) === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                        {p.stock || 0}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400 text-sm">{LOW_STOCK_THRESHOLD}</td>
                  </tr>
                ))}
                {lowStockProducts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                      <CheckCircle size={18} className="inline mr-1 text-emerald-500" />
                      Không có sản phẩm nào dưới ngưỡng tồn kho.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <HandCoins size={18} className="text-red-500" />
              Cảnh báo công nợ
            </h3>
            <button onClick={() => go('debts')} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Công nợ <ArrowRight size={13} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/70 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Đối tượng</th>
                  <th className="px-5 py-3">Loại</th>
                  <th className="px-5 py-3">Hạn TT</th>
                  <th className="px-5 py-3 text-right">Còn nợ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {debtAlerts.map(d => {
                  const overdue = d.dueDate ? new Date(d.dueDate).setHours(0, 0, 0, 0) < todayMs : false;
                  return (
                    <tr key={d.key} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => go('debts')}>
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-gray-800 max-w-[160px] truncate" title={d.name}>{d.name}</p>
                        {d.contact && <p className="text-[10px] text-gray-400">{d.contact}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          d.type === 'receivable' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {d.type === 'receivable' ? 'Phải thu' : 'Phải trả'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs">
                        {d.dueDate ? (
                          <span className={overdue ? 'text-red-600 font-bold' : 'text-gray-500'}>
                            {formatDate(d.dueDate)}{overdue ? ' (quá hạn)' : ''}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-800">{formatMoney(d.amount)}</td>
                    </tr>
                  );
                })}
                {debtAlerts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                      <CheckCircle size={18} className="inline mr-1 text-emerald-500" />
                      Không có khoản nợ nào cần theo dõi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== Phiếu nhập gần đây + Đơn hàng gần đây ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <ClipboardList size={18} className="text-emerald-600" />
              Phiếu nhập gần đây
            </h3>
            <button onClick={() => go('inventory')} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Xem tất cả <ArrowRight size={13} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/70 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Mã phiếu</th>
                  <th className="px-5 py-3">Nhà cung cấp</th>
                  <th className="px-5 py-3">Ngày nhập</th>
                  <th className="px-5 py-3 text-right">Tổng tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentImports.map(imp => (
                  <tr key={imp.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => go('inventory')}>
                    <td className="px-5 py-3 font-mono text-xs text-blue-600 font-bold">#{imp.id.slice(-6)}</td>
                    <td className="px-5 py-3 text-sm text-gray-800 max-w-[160px] truncate" title={imp.supplierName}>
                      {imp.supplierName || 'Nhà cung cấp'}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{formatDate(imp.createdAt)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-gray-800">
                      {formatMoney(imp.totalCost || 0)}
                    </td>
                  </tr>
                ))}
                {recentImports.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">Chưa có phiếu nhập nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <ShoppingBag size={18} className="text-purple-600" />
              Đơn hàng gần đây
            </h3>
            <button onClick={() => go('orders')} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Xem tất cả <ArrowRight size={13} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/70 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Mã đơn</th>
                  <th className="px-5 py-3">Khách hàng</th>
                  <th className="px-5 py-3">Ngày bán</th>
                  <th className="px-5 py-3 text-right">Tổng tiền</th>
                  <th className="px-5 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentOrders.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => go('orders')}>
                    <td className="px-5 py-3 font-mono text-xs text-blue-600 font-bold">#{o.id.slice(-6)}</td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-800 max-w-[140px] truncate" title={o.customerName}>{o.customerName}</p>
                      <p className="text-[10px] text-gray-400">{o.customerPhone}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{formatDate(o.createdAt)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-gray-800">{formatMoney(o.totalAmount)}</td>
                    <td className="px-5 py-3">{statusBadge(o.status)}</td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">Chưa có đơn hàng nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== Trợ lý AI ===== */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-lg">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Sparkles size={20} className="text-yellow-300 fill-yellow-300" />
            </div>
            <h3 className="text-xl font-bold">Trợ Lý AI Phân Tích</h3>
          </div>

          {aiInsight ? (
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiInsight}</p>
              <button onClick={() => setAiInsight('')} className="mt-4 text-xs font-bold text-blue-100 hover:text-white underline">
                Ẩn phân tích
              </button>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-md">
                <p className="text-blue-100 mb-4">
                  Dùng trí tuệ nhân tạo để phân tích xu hướng bán hàng, dự báo tồn kho và tối ưu lợi nhuận.
                </p>
                <button
                  onClick={handleGetInsight}
                  disabled={loadingAi}
                  className="px-6 py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-all shadow-lg flex items-center gap-2 disabled:opacity-70"
                >
                  {loadingAi ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                  {loadingAi ? 'Đang phân tích...' : 'Phân tích dữ liệu ngay'}
                </button>
              </div>
              <div className="hidden lg:block opacity-20 transform translate-x-10">
                <TrendingUp size={160} />
              </div>
            </div>
          )}
        </div>
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl" />
      </div>
    </div>
  );
};
