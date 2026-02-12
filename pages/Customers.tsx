import React, { useEffect, useState } from 'react';
import { MockBackend } from '../services/mockBackend';
import { Customer, Order, OrderStatus } from '../types';
import { Search, UserPlus, Edit2, Trash2, Loader2, Eye, CheckCircle, Truck, XCircle, Clock, Banknote } from 'lucide-react';
import { Modal } from '../components/Modal';

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', phone: '', address: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [list, ords] = await Promise.all([
      MockBackend.getCustomers(),
      MockBackend.getOrders()
    ]);
    setCustomers(list);
    setOrders(ords);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const openNew = () => { setForm({ id: '', name: '', phone: '', address: '', note: '' }); setIsModalOpen(true); };
  const openEdit = (c: Customer) => { setForm({ id: c.id, name: c.name, phone: c.phone, address: c.address || '', note: c.note || '' }); setIsModalOpen(true); };
  const close = () => { setIsModalOpen(false); };
  const closeDetail = () => setDetailCustomer(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (!form.name.trim() || !form.phone.trim()) { setSaving(false); return; }
    if (form.id) {
      await MockBackend.updateCustomer(form.id, { name: form.name, phone: form.phone, address: form.address, note: form.note });
    } else {
      await MockBackend.addCustomer(form.name, form.phone, form.address, form.note);
    }
    await loadData();
    setSaving(false);
    setIsModalOpen(false);
  };

  const remove = async (id: string) => {
    await MockBackend.deleteCustomer(id);
    await loadData();
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Khách Hàng</h2>
        <button 
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm transition-all"
        >
          <UserPlus size={18} />
          <span>Thêm Khách Hàng</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Tìm tên hoặc số điện thoại..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {(() => {
        const totalCustomers = customers.length;
        const totalSpentAll = orders.reduce((sum, o) => sum + o.totalAmount, 0);
        const pendingCount = orders.filter(o => o.status === OrderStatus.PENDING).length;
        const completedCount = orders.filter(o => o.status === OrderStatus.COMPLETED).length;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs text-gray-600">Tổng khách</p>
              <p className="text-lg font-bold text-blue-700">{totalCustomers}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <p className="text-xs text-gray-600">Tổng chi tiêu</p>
              <p className="text-lg font-bold text-emerald-700">{totalSpentAll.toLocaleString()} ₫</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
              <p className="text-xs text-gray-600">Đơn đang xử lý</p>
              <p className="text-lg font-bold text-yellow-700">{pendingCount}</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-lg p-3">
              <p className="text-xs text-gray-600">Đơn đã thanh toán</p>
              <p className="text-lg font-bold text-green-700">{completedCount}</p>
            </div>
          </div>
        );
      })()}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Tên</th>
                <th className="px-6 py-4">Số Điện Thoại</th>
                <th className="px-6 py-4">Chú Thích</th>
                <th className="px-6 py-4">Ngày Tạo</th>
                <th className="px-6 py-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-800">{c.name}</td>
                  <td className="px-6 py-4 text-gray-700">{c.phone}</td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{c.note || '—'}</td>
                  <td className="px-6 py-4 text-gray-500 text-sm">{new Date(c.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setDetailCustomer(c)} className="p-1.5 text-gray-700 hover:bg-gray-50 rounded-md" title={c.note ? `Chú thích: ${c.note}` : 'Xem chi tiết'}>
                        <Eye size={16} />
                      </button>
                      <button onClick={() => openEdit(c)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => remove(c.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">Không có khách hàng.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={close} title={form.id ? 'Cập Nhật Khách Hàng' : 'Thêm Khách Hàng'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên</label>
            <input 
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Số Điện Thoại</label>
            <input 
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Địa Chỉ</label>
            <input 
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chú Thích</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <button 
              type="submit" 
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {saving ? 'Đang Lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>
      
      <Modal isOpen={!!detailCustomer} onClose={closeDetail} title="Chi Tiết Khách Hàng">
        {detailCustomer && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Tên</p>
                <p className="font-medium text-gray-800">{detailCustomer.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Số điện thoại</p>
                <p className="font-medium text-gray-800">{detailCustomer.phone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Địa chỉ</p>
                <p className="font-medium text-gray-800">{detailCustomer.address || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Ngày tạo</p>
                <p className="font-medium text-gray-800">{new Date(detailCustomer.createdAt).toLocaleDateString('vi-VN')}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Chú thích</p>
              <p className="text-sm bg-gray-50 border border-gray-200 rounded-lg p-3">{detailCustomer.note || '—'}</p>
            </div>
            {(() => {
              const custOrders = orders.filter(o => o.customerPhone === detailCustomer.phone || o.customerName === detailCustomer.name);
              const total = custOrders.length;
              const completed = custOrders.filter(o => o.status === OrderStatus.COMPLETED).length;
              const pending = custOrders.filter(o => o.status === OrderStatus.PENDING).length;
              const shipping = custOrders.filter(o => o.status === OrderStatus.SHIPPING).length;
              const cancelled = custOrders.filter(o => o.status === OrderStatus.CANCELLED).length;
              const totalSpent = custOrders.reduce((sum, o) => sum + o.totalAmount, 0);
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Tổng đơn đã mua</p>
                    <p className="text-lg font-bold text-gray-800">{total}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Đã thanh toán</p>
                    <p className="text-lg font-bold text-emerald-700">{completed}</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                    <p className="text-xs text-gray-700">Đang xử lý</p>
                    <p className="text-lg font-bold text-yellow-700">{pending}</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Đang giao</p>
                    <p className="text-lg font-bold text-indigo-700">{shipping}</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Đã hủy</p>
                    <p className="text-lg font-bold text-red-700">{cancelled}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 col-span-2 sm:col-span-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-emerald-700">Tổng chi tiêu</p>
                      <p className="text-xl font-extrabold text-emerald-700">{totalSpent.toLocaleString()} ₫</p>
                    </div>
                    <Banknote className="text-emerald-600" size={24} />
                  </div>
                </div>
              );
            })()}
            {(() => {
              const custOrders = orders
                .filter(o => o.customerPhone === detailCustomer.phone || o.customerName === detailCustomer.name)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 5);
              const statusBadge = (s: OrderStatus) => {
                switch (s) {
                  case OrderStatus.COMPLETED:
                    return <span className="flex items-center gap-1 text-green-600 bg-green-100 px-2 py-0.5 rounded-md text-[10px] font-bold"><CheckCircle size={12}/> Hoàn thành</span>;
                  case OrderStatus.SHIPPING:
                    return <span className="flex items-center gap-1 text-blue-600 bg-blue-100 px-2 py-0.5 rounded-md text-[10px] font-bold"><Truck size={12}/> Đang giao</span>;
                  case OrderStatus.CANCELLED:
                    return <span className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-0.5 rounded-md text-[10px] font-bold"><XCircle size={12}/> Đã hủy</span>;
                  default:
                    return <span className="flex items-center gap-1 text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-md text-[10px] font-bold"><Clock size={12}/> Chờ xử lý</span>;
                }
              };
              return (
                <div className="bg-white border border-gray-100 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-bold text-gray-800">5 đơn gần nhất</p>
                  {custOrders.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Chưa có lịch sử đơn hàng.</p>
                  ) : (
                    custOrders.map(o => (
                      <div key={o.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md border border-gray-200">
                        <div>
                          <p className="font-mono text-xs text-blue-700">{o.id}</p>
                          <p className="text-[10px] text-gray-500">{new Date(o.createdAt).toLocaleString('vi-VN')}</p>
                        </div>
                        <div className="text-right">
                          <span className="block text-sm font-bold text-blue-600">{o.totalAmount.toLocaleString()} ₫</span>
                          {statusBadge(o.status)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
