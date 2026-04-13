import React, { useState, useEffect } from 'react';
import { MockBackend } from '../services/mockBackend';
import { analyzeBusinessData } from '../services/geminiService';
import { Product, Order, OrderStatus, Customer } from '../types';
import { 
  DollarSign, ShoppingBag, AlertTriangle, Sparkles, TrendingUp, 
  Loader2, CheckCircle, CalendarRange, Users, Package, 
  ArrowUpRight, ArrowDownRight, Clock, ChevronRight
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#4f46e5'];

export const Dashboard: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [timeRange, setTimeRange] = useState<'today'|'7d'|'30d'>('7d');

  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const [p, o, c] = await Promise.all([
          MockBackend.getProducts(),
          MockBackend.getOrders(),
          MockBackend.getCustomers()
        ]);
        setProducts(p);
        setOrders(o);
        setCustomers(c);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, []);

  // --- CALCULATIONS ---
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOf7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOf14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const getRangeOrders = (start: Date, end: Date = new Date()) => 
    orders.filter(o => {
      const d = new Date(o.createdAt);
      return d >= start && d < end && o.status !== OrderStatus.CANCELLED;
    });

  const todayOrders = getRangeOrders(startOfToday);
  const yesterdayOrders = getRangeOrders(startOfYesterday, startOfToday);
  const last7dOrders = getRangeOrders(startOf7d);
  const prev7dOrders = getRangeOrders(startOf14d, startOf7d);

  const todayRevenue = todayOrders.reduce((s, o) => s + o.totalAmount, 0);
  const yesterdayRevenue = yesterdayOrders.reduce((s, o) => s + o.totalAmount, 0);
  const last7dRevenue = last7dOrders.reduce((s, o) => s + o.totalAmount, 0);
  const prev7dRevenue = prev7dOrders.reduce((s, o) => s + o.totalAmount, 0);

  const revenueGrowth = prev7dRevenue > 0 ? ((last7dRevenue - prev7dRevenue) / prev7dRevenue) * 100 : 0;
  const orderGrowth = prev7dOrders.length > 0 ? ((last7dOrders.length - prev7dOrders.length) / prev7dOrders.length) * 100 : 0;

  const pendingOrders = orders.filter(o => o.status === OrderStatus.PENDING);
  const lowStockCount = products.filter(p => p.stock < 10).length;

  // Top Products Logic
  const topProducts = (() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number; sku: string }>();
    orders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      o.items.forEach(it => {
        const product = products.find(p => p.id === it.productId);
        const key = it.productId || it.name;
        const current = map.get(key) || { name: it.name, quantity: 0, revenue: 0, sku: product?.sku || 'N/A' };
        current.quantity += it.quantity;
        current.revenue += it.quantity * it.price;
        map.set(key, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  })();

  // Chart Data
  const getChartData = () => {
    const days = timeRange === 'today' ? 1 : (timeRange === '7d' ? 7 : 30);
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const dayOrders = orders.filter(o => 
        new Date(o.createdAt).toLocaleDateString('vi-VN') === d.toLocaleDateString('vi-VN') && 
        o.status !== OrderStatus.CANCELLED
      );
      data.push({
        name: dateStr,
        revenue: dayOrders.reduce((s, o) => s + o.totalAmount, 0),
        orders: dayOrders.length,
        products: dayOrders.reduce((sum, order) => {
          return sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
        }, 0),
        customers: customers.filter(
          (c) => new Date(c.createdAt).toLocaleDateString('vi-VN') === d.toLocaleDateString('vi-VN')
        ).length,
      });
    }
    return data;
  };

  const chartData = getChartData();

  const handleGetInsight = async () => {
    setLoadingAi(true);
    try {
      const insight = await analyzeBusinessData(products, orders);
      setAiInsight(insight);
    } catch (e) {
      setAiInsight("Không thể tải phân tích AI lúc này.");
    } finally {
      setLoadingAi(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Quick Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Tổng Quan Kinh Doanh</h2>
          <p className="text-sm text-gray-500 mt-1">Chào mừng trở lại! Dưới đây là tình hình cửa hàng của bạn.</p>
        </div>
        <div className="flex bg-white p-1 rounded-lg shadow-sm border border-gray-100">
          {(['today', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                timeRange === r ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {r === 'today' ? 'Hôm nay' : r === '7d' ? '7 ngày qua' : '30 ngày qua'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <DollarSign size={24} />
            </div>
            <div className={`flex items-center text-xs font-bold ${revenueGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {revenueGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(revenueGrowth).toFixed(1)}%
            </div>
          </div>
          <p className="text-sm text-gray-500 font-medium">Doanh thu (7 ngày)</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{last7dRevenue.toLocaleString()} ₫</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <ShoppingBag size={24} />
            </div>
            <div className={`flex items-center text-xs font-bold ${orderGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {orderGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(orderGrowth).toFixed(1)}%
            </div>
          </div>
          <p className="text-sm text-gray-500 font-medium">Đơn hàng mới</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{last7dOrders.length} đơn</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
              <Clock size={24} />
            </div>
            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-bold">Cần xử lý</span>
          </div>
          <p className="text-sm text-gray-500 font-medium">Chờ xác nhận</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{pendingOrders.length} đơn</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-red-50 text-red-600 rounded-xl">
              <AlertTriangle size={24} />
            </div>
            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold">Cảnh báo</span>
          </div>
          <p className="text-sm text-gray-500 font-medium">Sắp hết hàng</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{lowStockCount} sản phẩm</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-600" />
              Biểu đồ doanh thu
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `${v/1000000}M`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [value.toLocaleString() + ' ₫', 'Doanh thu']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products List */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Package size={18} className="text-purple-600" />
            Sản phẩm bán chạy
          </h3>
          <div className="space-y-5">
            {topProducts.map((p, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-sm font-bold text-gray-500">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500">SKU: {p.sku}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-600">{p.quantity}</p>
                  <p className="text-[10px] text-gray-400">Đã bán</p>
                </div>
              </div>
            ))}
            {topProducts.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Chưa có dữ liệu bán hàng</p>}
          </div>
          <button className="w-full mt-6 py-2.5 text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors flex items-center justify-center gap-1">
            Xem tất cả báo cáo
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Package size={18} className="text-purple-600" />
              Biểu đồ sản phẩm
            </h3>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorProducts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.14}/>
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [value, 'Sản phẩm đã bán']}
                />
                <Area type="monotone" dataKey="products" stroke="#7c3aed" strokeWidth={3} fillOpacity={1} fill="url(#colorProducts)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Users size={18} className="text-cyan-600" />
              Biểu đồ khách hàng
            </h3>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCustomers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0891b2" stopOpacity={0.14}/>
                    <stop offset="95%" stopColor="#0891b2" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [value, 'Khách hàng mới']}
                />
                <Area type="monotone" dataKey="customers" stroke="#0891b2" strokeWidth={3} fillOpacity={1} fill="url(#colorCustomers)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Insights Section */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-lg">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Sparkles size={20} className="text-yellow-300 fill-yellow-300" />
            </div>
            <h3 className="text-xl font-bold">Trợ Lý AI Phân Tích</h3>
          </div>
          
          {aiInsight ? (
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20 animate-in zoom-in duration-300">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiInsight}</p>
              <button 
                onClick={() => setAiInsight("")}
                className="mt-4 text-xs font-bold text-blue-100 hover:text-white underline"
              >
                Ẩn phân tích
              </button>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-md">
                <p className="text-blue-100 mb-4">Sử dụng trí tuệ nhân tạo để phân tích xu hướng bán hàng, dự báo tồn kho và tối ưu lợi nhuận cho cửa hàng của bạn.</p>
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
        
        {/* Background Decor */}
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl"></div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Clock size={18} className="text-blue-600" />
            Đơn hàng mới nhất
          </h3>
          <button className="text-sm font-bold text-blue-600 hover:text-blue-700">Xem tất cả</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/50 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Mã đơn</th>
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Thời gian</th>
                <th className="px-6 py-4">Số tiền</th>
                <th className="px-6 py-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.slice(0, 5).map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer">
                  <td className="px-6 py-4 font-mono text-xs text-blue-600 font-bold">#{order.id.slice(-6)}</td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gray-800">{order.customerName}</p>
                    <p className="text-[10px] text-gray-400">{order.customerPhone}</p>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-800">
                    {order.totalAmount.toLocaleString()} ₫
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      order.status === OrderStatus.COMPLETED ? 'bg-emerald-50 text-emerald-700' :
                      order.status === OrderStatus.PENDING ? 'bg-amber-50 text-amber-700' :
                      order.status === OrderStatus.SHIPPING ? 'bg-blue-50 text-blue-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      <div className={`w-1 h-1 rounded-full ${
                        order.status === OrderStatus.COMPLETED ? 'bg-emerald-500' :
                        order.status === OrderStatus.PENDING ? 'bg-amber-500' :
                        order.status === OrderStatus.SHIPPING ? 'bg-blue-500' :
                        'bg-red-500'
                      }`} />
                      {order.status === OrderStatus.COMPLETED ? 'Hoàn thành' :
                       order.status === OrderStatus.PENDING ? 'Chờ xử lý' :
                       order.status === OrderStatus.SHIPPING ? 'Đang giao' : 'Đã hủy'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Chưa có đơn hàng nào</p>}
        </div>
      </div>
    </div>
  );
};
