import React, { useState, useEffect } from 'react';
import { MockBackend } from '../services/mockBackend';
import { analyzeBusinessData } from '../services/geminiService';
import { Product, Order, OrderStatus, Customer } from '../types';
import { DollarSign, ShoppingBag, AlertTriangle, Sparkles, TrendingUp, Loader2, CheckCircle, CalendarRange, Users } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const Dashboard: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [timeRange, setTimeRange] = useState<'today'|'7d'|'30d'|'month'|'year'>('7d');
  const [customers, setCustomers] = useState<Customer[]>([]);

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

  const totalRevenue = orders.filter(o => o.status !== OrderStatus.CANCELLED && (o.paidAmount || 0) >= o.totalAmount).reduce((sum, order) => sum + order.totalAmount, 0);
  const totalOrders = orders.length;
  const lowStockProducts = products.filter(p => p.stock < 10);
  const todayStr = new Date().toLocaleDateString('vi-VN');
  const revenueToday = orders
    .filter(o => new Date(o.createdAt).toLocaleDateString('vi-VN') === todayStr && o.status !== OrderStatus.CANCELLED && (o.paidAmount || 0) >= o.totalAmount)
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const completedCount = orders.filter(o => o.status === OrderStatus.COMPLETED).length;
  const completionRate = totalOrders > 0 ? Math.round((completedCount * 100) / totalOrders) : 0;
  const topProducts = (() => {
    const map = new Map<string, { name: string; quantity: number }>();
    orders.forEach(o => {
      o.items.forEach(it => {
        const key = it.productId || it.name;
        const current = map.get(key) || { name: it.name, quantity: 0 };
        current.quantity += it.quantity;
        map.set(key, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  })();

  const handleGetInsight = async () => {
    setLoadingAi(true);
    const insight = await analyzeBusinessData(products, orders);
    setAiInsight(insight);
    setLoadingAi(false);
  };

  // Prepare chart data (Revenue by Day)
  const chartData = orders.filter(o => o.status !== OrderStatus.CANCELLED && (o.paidAmount || 0) >= o.totalAmount).reduce((acc: any[], order) => {
    const date = new Date(order.createdAt).toLocaleDateString('vi-VN');
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.revenue += order.totalAmount;
    } else {
      acc.push({ date, revenue: order.totalAmount });
    }
    return acc;
  }, []).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);

  const inRange = (createdAt: string) => {
    const d = new Date(createdAt);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (timeRange === 'today') return d >= startOfDay;
    if (timeRange === '7d') return d >= new Date(now.getTime() - 7*24*60*60*1000);
    if (timeRange === '30d') return d >= new Date(now.getTime() - 30*24*60*60*1000);
    if (timeRange === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (timeRange === 'year') return d.getFullYear() === now.getFullYear();
    return true;
  };
  const filteredOrders = orders.filter(o => o.status !== OrderStatus.CANCELLED && inRange(o.createdAt));
  const revenueFiltered = filteredOrders.reduce((s, o) => s + o.totalAmount, 0);
  const ordersFiltered = filteredOrders.length;

  const calcGrowth = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };
  const yesterdayRevenue = orders.filter(o => {
    const d = new Date(o.createdAt);
    const y = new Date();
    y.setDate(y.getDate()-1);
    return d.toLocaleDateString('vi-VN') === y.toLocaleDateString('vi-VN') && o.status !== OrderStatus.CANCELLED;
  }).reduce((s,o)=>s+o.totalAmount,0);
  const todayGrowth = calcGrowth(revenueToday, yesterdayRevenue);

  const monthRevenue = orders.filter(o => {
    const d = new Date(o.createdAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && o.status !== OrderStatus.CANCELLED;
  }).reduce((s,o)=>s+o.totalAmount,0);
  const prevMonthRevenue = orders.filter(o => {
    const d = new Date(o.createdAt);
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth()-1, 1);
    return d.getFullYear() === prevMonth.getFullYear() && d.getMonth() === prevMonth.getMonth() && o.status !== OrderStatus.CANCELLED;
  }).reduce((s,o)=>s+o.totalAmount,0);
  const monthGrowth = calcGrowth(monthRevenue, prevMonthRevenue);

  const thisWeekOrders = orders.filter(o => {
    const d = new Date(o.createdAt);
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // CN = 0
    const end = new Date(start); end.setDate(start.getDate()+7);
    return d >= start && d < end;
  }).length;
  const lastWeekOrders = orders.filter(o => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() - 7);
    const end = new Date(start); end.setDate(start.getDate()+7);
    const d = new Date(o.createdAt);
    return d >= start && d < end;
  }).length;
  const weekGrowth = calcGrowth(thisWeekOrders, lastWeekOrders);

  const outStockCount = products.filter(p => p.stock === 0).length;
  const lowStockCount = products.filter(p => p.stock > 0 && p.stock < 10).length;
  const uniqueCustomers = new Set(customers.map(c => c.phone)).size;
  const newCustomersToday = customers.filter(c => new Date(c.createdAt).toLocaleDateString('vi-VN') === todayStr).length;
  const topCustomers = (() => {
    const map = new Map<string, { name: string; total: number }>();
    orders.forEach(o => {
      const key = o.customerPhone || o.customerName;
      const val = map.get(key) || { name: o.customerName, total: 0 };
      val.total += o.totalAmount;
      map.set(key, val);
    });
    return Array.from(map.values()).sort((a,b)=>b.total-a.total).slice(0,3);
  })();

  if (loadingData) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Tổng Quan Kinh Doanh</h2>
          <p className="text-gray-500">Chào mừng trở lại! Đây là tình hình cửa hàng hôm nay.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-2">
            <CalendarRange className="text-gray-600 mr-2" size={16} />
            <select 
              value={timeRange}
              onChange={(e)=>setTimeRange(e.target.value as any)}
              className="text-sm bg-transparent outline-none"
            >
              <option value="today">Hôm nay</option>
              <option value="7d">7 ngày</option>
              <option value="30d">30 ngày</option>
              <option value="month">Tháng này</option>
              <option value="year">Năm nay</option>
            </select>
          </div>
        <button 
          onClick={handleGetInsight}
          disabled={loadingAi}
          className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg shadow-md hover:opacity-90 transition-all disabled:opacity-50"
        >
          {loadingAi ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
          <span>{loadingAi ? 'Đang phân tích...' : 'Hỏi Trợ Lý AI'}</span>
        </button>
        </div>
      </div>

      {aiInsight && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 relative">
           <div className="absolute top-0 left-0 bg-indigo-600 text-white text-xs px-2 py-1 rounded-br-lg rounded-tl-lg font-bold">GỢI Ý</div>
           <p className="text-indigo-900 mt-2 leading-relaxed whitespace-pre-line">{aiInsight}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg">
            <DollarSign size={28} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Tổng Doanh Thu</p>
            <h3 className="text-2xl font-bold text-gray-800">{totalRevenue.toLocaleString()} ₫</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <ShoppingBag size={28} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Tổng Đơn Hàng</p>
            <h3 className="text-2xl font-bold text-gray-800">{totalOrders}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
            <TrendingUp size={28} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Doanh Thu Hôm Nay</p>
            <h3 className="text-2xl font-bold text-gray-800">{revenueToday.toLocaleString()} ₫</h3>
            <span className={`text-xs ${todayGrowth>=0?'text-emerald-600':'text-red-600'}`}>{todayGrowth>=0?'🔼':'🔽'} {Math.abs(todayGrowth)}%</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
            <CheckCircle size={28} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Tỷ Lệ Hoàn Thành</p>
            <h3 className="text-2xl font-bold text-gray-800">{completionRate}%</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Doanh thu {timeRange === 'today' ? 'hôm nay' : 'đã chọn'}</p>
          <h3 className="text-2xl font-bold text-gray-800">{revenueFiltered.toLocaleString()} ₫</h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Tăng trưởng tháng</p>
          <h3 className="text-2xl font-bold text-gray-800">{monthRevenue.toLocaleString()} ₫ <span className={`${monthGrowth>=0?'text-emerald-600':'text-red-600'} text-sm`}>{monthGrowth>=0?'🔼':'🔽'} {Math.abs(monthGrowth)}%</span></h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Đơn tuần này</p>
          <h3 className="text-2xl font-bold text-gray-800">{thisWeekOrders} <span className={`${weekGrowth>=0?'text-emerald-600':'text-red-600'} text-sm`}>{weekGrowth>=0?'🔼':'🔽'} {Math.abs(weekGrowth)}%</span></h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-500" />
            Biểu Đồ 7 Ngày
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(value) => `${value/1000}k`} />
                <Tooltip 
                  formatter={(value: number) => [`${value.toLocaleString()} ₫`, 'Doanh thu']}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Top Sản Phẩm</h3>
          <div className="space-y-4">
            {topProducts.length === 0 ? (
              <p className="text-gray-500 text-sm italic">Chưa có dữ liệu bán hàng.</p>
            ) : (
              topProducts.map(tp => (
                <div key={tp.name} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="font-medium text-gray-800 text-sm">{tp.name}</p>
                  <div className="text-right">
                    <span className="block text-xl font-bold text-blue-600">{tp.quantity}</span>
                    <span className="text-[10px] text-blue-400">đã bán</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Đơn Hàng Gần Đây</h3>
          <div className="space-y-3">
            {orders.length === 0 ? (
              <p className="text-gray-500 text-sm italic">Chưa có đơn hàng.</p>
            ) : (
              orders.slice(0, 6).map(o => (
                <div key={o.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{o.id}</p>
                    <p className="text-xs text-gray-500">{new Date(o.createdAt).toLocaleString('vi-VN')}</p>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-bold text-blue-600">{o.totalAmount.toLocaleString()} ₫</span>
                    <span className="text-[10px] text-gray-500">{o.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Chỉ Số Kho</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs text-amber-700">Sắp hết (&lt;10)</p>
                <p className="text-xl font-bold text-amber-700">{lowStockCount}</p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                <p className="text-xs text-red-700">Hết hàng</p>
                <p className="text-xl font-bold text-red-700">{outStockCount}</p>
              </div>
            </div>
            <div className="space-y-2">
              {lowStockProducts.slice(0, 6).map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                  <p className="font-medium text-gray-800 text-sm">{p.name}</p>
                  <span className="text-sm font-bold text-red-600">{p.stock}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Users size={18} className="text-indigo-600" />Phân Tích Khách Hàng</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-indigo-50 border border-indigo-100 rounded p-3">
              <p className="text-xs text-indigo-700">Tổng khách</p>
              <p className="text-xl font-bold text-indigo-700">{uniqueCustomers}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded p-3">
              <p className="text-xs text-emerald-700">Khách mới hôm nay</p>
              <p className="text-xl font-bold text-emerald-700">{newCustomersToday}</p>
            </div>
          </div>
          <div className="space-y-2">
            {topCustomers.length === 0 ? (
              <p className="text-gray-500 text-sm italic">Chưa có dữ liệu.</p>
            ) : (
              topCustomers.map(tc => (
                <div key={tc.name} className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                  <p className="font-medium text-gray-800 text-sm">{tc.name}</p>
                  <span className="text-sm font-bold text-indigo-700">{tc.total.toLocaleString()} ₫</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
