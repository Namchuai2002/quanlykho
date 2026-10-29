import React, { useEffect, useMemo, useState } from 'react';
import { MockBackend } from '../services/mockBackend';
import { Customer, Order, OrderStatus, PaymentRecord } from '../types';
import { DebtService } from '../services/debtService';
import { Search, UserPlus, Edit2, Trash2, Loader2, Eye, CheckCircle, Truck, XCircle, Clock, Banknote, Mail, Phone, MapPin, Hash, X, AlertCircle, Wallet, AlertTriangle } from 'lucide-react';
import { Modal } from '../components/Modal';

const formatMoney = (n: number) => `${(n || 0).toLocaleString('vi-VN')} ₫`;

type Notice = { type: 'success' | 'error'; text: string } | null;

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', phone: '', email: '', address: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [dupModalOpen, setDupModalOpen] = useState(false);
  const [cleaningDup, setCleaningDup] = useState(false);

  const showNotice = (type: 'success' | 'error', text: string, ms = 3000) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), ms);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, ords, pays] = await Promise.all([
        MockBackend.getCustomers(),
        MockBackend.getOrders(),
        MockBackend.getPayments(),
      ]);
      setCustomers(Array.isArray(list) ? list : []);
      setOrders(ords);
      setPayments(pays);
    } catch (err) {
      console.error('Failed to load customers:', err);
      showNotice('error', 'Không tải được dữ liệu khách hàng. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Công nợ phải thu được suy ra từ đơn hàng + phiếu thu (DebtService)
  const receivables = useMemo(
    () => DebtService.computeReceivables(orders, payments),
    [orders, payments],
  );

  const ordersOf = (c: Customer) =>
    orders.filter(o => o.customerPhone === c.phone || o.customerName === c.name);

  const debtOf = (c: Customer) =>
    receivables.reduce(
      (sum, r) => ((r.phone && r.phone === c.phone) || r.name === c.name ? sum + r.outstanding : sum),
      0,
    );

  const totalDebtOf = (c: Customer) =>
    receivables.reduce(
      (sum, r) => ((r.phone && r.phone === c.phone) || r.name === c.name ? sum + r.total : sum),
      0,
    );

  // Nhóm khách hàng trùng định danh (ưu tiên SĐT). KHÔNG tự gộp — chỉ để rà soát.
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, Customer[]>();
    customers.forEach(c => {
      const key = MockBackend.customerIdentityKey(c);
      if (!key) return;
      const arr = map.get(key) || [];
      arr.push(c);
      map.set(key, arr);
    });
    return Array.from(map.values())
      .filter(g => g.length > 1)
      // Giữ bản ghi cũ nhất, các bản ghi sau là bản trùng
      .map(g => g.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
  }, [customers]);

  const duplicatedIds = useMemo(
    () => new Set(duplicateGroups.flat().map(c => c.id)),
    [duplicateGroups],
  );
  const redundantCount = duplicateGroups.reduce((s, g) => s + g.length - 1, 0);

  const cleanDuplicates = async () => {
    if (duplicateGroups.length === 0) return;
    const ok = window.confirm(
      `Sẽ xóa ${redundantCount} bản ghi khách hàng trùng định danh, giữ lại bản ghi cũ nhất của mỗi nhóm.\n` +
        `Đơn hàng, phiếu thu và công nợ liên quan KHÔNG bị ảnh hưởng (liên kết theo tên/SĐT).\n\nTiếp tục?`,
    );
    if (!ok) return;
    setCleaningDup(true);
    try {
      const toDelete = duplicateGroups.flatMap(g => g.slice(1));
      for (const c of toDelete) {
        await MockBackend.deleteCustomer(c.id);
      }
      showNotice('success', `Đã dọn ${toDelete.length} bản ghi khách hàng trùng lặp.`);
      setDupModalOpen(false);
      await loadData();
    } catch (err: any) {
      showNotice('error', err?.message || 'Dọn trùng lặp thất bại. Vui lòng thử lại.');
    } finally {
      setCleaningDup(false);
    }
  };

  const openNew = () => {
    setForm({ id: '', name: '', phone: '', email: '', address: '', note: '' });
    setIsModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setForm({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email || '',
      address: c.address || '',
      note: c.note || '',
    });
    setIsModalOpen(true);
  };

  const close = () => { setIsModalOpen(false); };
  const closeDetail = () => setDetailCustomer(null);

  const validate = (): string | null => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    if (!name) return 'Vui lòng nhập tên khách hàng.';
    if (!phone) return 'Vui lòng nhập số điện thoại.';
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.length < 9 || digits.length > 11) return 'Số điện thoại không hợp lệ (cần 9-11 chữ số).';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email không hợp lệ.';
    const dup = customers.find(
      c => c.id !== form.id && (c.phone || '').replace(/[^0-9]/g, '') === digits && digits.length > 0,
    );
    if (dup) return `Số điện thoại này đã thuộc khách hàng "${dup.name}".`;
    return null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const error = validate();
    if (error) { showNotice('error', error); return; }

    setSaving(true);
    try {
      const name = form.name.trim();
      const phone = form.phone.trim();
      const email = form.email.trim();
      const address = form.address.trim();
      const note = form.note.trim();
      const normPhone = phone.replace(/[^0-9]/g, '');

      // Cùng tên nhưng khác SĐT → coi là người khác nhau, vẫn tạo bản ghi riêng.
      const sameNameOther = customers.find(
        c =>
          c.id !== form.id &&
          c.name.trim().toLowerCase() === name.toLowerCase() &&
          String(c.phone || '').replace(/[^0-9]/g, '') !== normPhone,
      );

      if (form.id) {
        await MockBackend.updateCustomer(form.id, { name, phone, email, address, note });
        showNotice('success', `Đã cập nhật khách hàng "${name}".`);
      } else {
        const created = await MockBackend.addCustomer(name, phone, address, note, email);
        if (sameNameOther) {
          showNotice(
            'success',
            `Đã thêm khách hàng "${name}" (mã ${created.id}). Trùng tên với "${sameNameOther.name}" nhưng khác SĐT nên được lưu riêng.`,
            5000,
          );
        } else {
          showNotice('success', `Đã thêm khách hàng "${name}".`);
        }
      }
      await loadData();
      setIsModalOpen(false);
    } catch (err: any) {
      showNotice('error', err?.message || 'Lưu khách hàng thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Customer) => {
    const count = ordersOf(c).length;
    const msg = count > 0
      ? `Khách hàng "${c.name}" đang có ${count} đơn hàng liên quan. Xóa khách hàng sẽ KHÔNG xóa các đơn hàng và công nợ liên quan. Bạn có chắc muốn xóa?`
      : `Bạn có chắc muốn xóa khách hàng "${c.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await MockBackend.deleteCustomer(c.id);
      if (detailCustomer?.id === c.id) setDetailCustomer(null);
      showNotice('success', `Đã xóa khách hàng "${c.name}".`);
      await loadData();
    } catch (err: any) {
      showNotice('error', err?.message || 'Xóa khách hàng thất bại. Vui lòng thử lại.');
    }
  };

  const s = searchTerm.trim().toLowerCase();
  const filtered = customers.filter(c =>
    !s ||
    c.name.toLowerCase().includes(s) ||
    c.phone.toLowerCase().includes(s) ||
    c.id.toLowerCase().includes(s) ||
    (c.email || '').toLowerCase().includes(s) ||
    (c.address || '').toLowerCase().includes(s),
  );

  const totalCustomers = customers.length;
  const totalSpentAll = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalOutstanding = receivables.reduce((sum, r) => sum + r.outstanding, 0);
  const debtorsCount = customers.filter(c => debtOf(c) > 0).length;

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow text-white flex items-center gap-2 ${
            notice.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {notice.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Khách Hàng</h2>
          <p className="text-sm text-gray-500 mt-1">
            Tổng: {filtered.length}/{totalCustomers} khách hàng
          </p>
        </div>
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
            placeholder="Tìm theo tên, mã khách hàng hoặc số điện thoại..."
            className="w-full pl-10 pr-9 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              title="Xóa tìm kiếm"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-xs text-gray-600">Tổng khách hàng</p>
          <p className="text-lg font-bold text-blue-700">{totalCustomers}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
          <p className="text-xs text-gray-600">Tổng chi tiêu</p>
          <p className="text-lg font-bold text-emerald-700">{formatMoney(totalSpentAll)}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg p-3">
          <p className="text-xs text-gray-600">Công nợ phải thu</p>
          <p className="text-lg font-bold text-red-700">{formatMoney(totalOutstanding)}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
          <p className="text-xs text-gray-600">Khách còn nợ</p>
          <p className="text-lg font-bold text-yellow-700">{debtorsCount}</p>
        </div>
      </div>

      {duplicateGroups.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 mt-0.5" size={20} />
            <div>
              <p className="font-semibold text-amber-800">
                Phát hiện {duplicateGroups.length} nhóm khách hàng trùng định danh ({redundantCount} bản ghi dư)
              </p>
              <p className="text-sm text-amber-700 mt-0.5">
                Các bản ghi này trùng số điện thoại (hoặc tên khi chưa có SĐT). Dữ liệu chưa bị thay đổi — hãy rà soát trước khi dọn.
              </p>
            </div>
          </div>
          <button
            onClick={() => setDupModalOpen(true)}
            className="shrink-0 px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-1.5"
          >
            <Eye size={15} /> Rà soát
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Mã KH</th>
                    <th className="px-6 py-4">Khách Hàng</th>
                    <th className="px-6 py-4">Số Điện Thoại</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Địa Chỉ</th>
                    <th className="px-6 py-4 text-right">Công Nợ Phải Thu</th>
                    <th className="px-6 py-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(c => {
                    const debt = debtOf(c);
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{c.id}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-800">{c.name}</p>
                            {duplicatedIds.has(c.id) && (
                              <span
                                className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded"
                                title="Có khách hàng khác trùng số điện thoại"
                              >
                                Trùng?
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            Tạo {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-gray-700">{c.phone}</td>
                        <td className="px-6 py-4 text-gray-600 text-sm">{c.email || '—'}</td>
                        <td className="px-6 py-4 text-gray-600 text-sm max-w-[220px] truncate" title={c.address}>
                          {c.address || '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {debt > 0 ? (
                            <span className="font-semibold text-red-600">{formatMoney(debt)}</span>
                          ) : (
                            <span className="text-gray-400">0 ₫</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setDetailCustomer(c)}
                              className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-md"
                              title="Xem chi tiết"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => openEdit(c)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md"
                              title="Sửa khách hàng"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => remove(c)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                              title="Xóa khách hàng"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                        {customers.length === 0
                          ? 'Chưa có khách hàng nào.'
                          : 'Không tìm thấy khách hàng phù hợp với từ khóa.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden p-2 space-y-2">
              {filtered.map(c => {
                const debt = debtOf(c);
                return (
                  <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{c.name}</p>
                        {duplicatedIds.has(c.id) && (
                          <span className="inline-block mt-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                            Có thể trùng SĐT
                          </span>
                        )}
                        <p className="text-xs font-mono text-gray-400">Mã {c.id}</p>
                        <p className="text-sm text-gray-600">{c.phone}</p>
                        {c.email && <p className="text-xs text-gray-500 truncate">{c.email}</p>}
                        {c.address && <p className="text-xs text-gray-500 truncate">{c.address}</p>}
                        <p className="text-xs text-gray-400 mt-1">
                          Tạo {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`text-sm font-bold ${debt > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {formatMoney(debt)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setDetailCustomer(c)} className="p-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg" title="Xem chi tiết">
                            <Eye size={16} />
                          </button>
                          <button onClick={() => openEdit(c)} className="p-2 text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg" title="Sửa">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => remove(c)} className="p-2 text-red-700 bg-red-100 hover:bg-red-200 rounded-lg" title="Xóa">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center text-gray-400 py-8">
                  {customers.length === 0
                    ? 'Chưa có khách hàng nào.'
                    : 'Không tìm thấy khách hàng phù hợp với từ khóa.'}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={close} title={form.id ? 'Cập Nhật Khách Hàng' : 'Thêm Khách Hàng'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên khách hàng <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="VD: Nguyễn Văn A"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Số điện thoại <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="VD: 0901234567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="VD: khachhang@email.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="VD: 123 Lê Lợi, Q.1, TP.HCM"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chú thích</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Đang lưu...' : form.id ? 'Lưu thay đổi' : 'Thêm khách hàng'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!detailCustomer} onClose={closeDetail} title="Chi Tiết Khách Hàng">
        {detailCustomer && (() => {
          const custOrders = ordersOf(detailCustomer);
          const debt = debtOf(detailCustomer);
          const totalPurchased = totalDebtOf(detailCustomer);
          const completed = custOrders.filter(o => o.status === OrderStatus.COMPLETED).length;
          const pending = custOrders.filter(o => o.status === OrderStatus.PENDING).length;
          const shipping = custOrders.filter(o => o.status === OrderStatus.SHIPPING).length;
          const cancelled = custOrders.filter(o => o.status === OrderStatus.CANCELLED).length;
          const totalSpent = custOrders.reduce((sum, o) => sum + o.totalAmount, 0);
          const recent = custOrders
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
          const statusBadge = (status: OrderStatus) => {
            switch (status) {
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
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded">
                    Mã KH {detailCustomer.id}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { const c = detailCustomer; closeDetail(); openEdit(c); }}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                  >
                    <Edit2 size={14} /> Sửa
                  </button>
                  <button
                    onClick={() => remove(detailCustomer)}
                    className="px-3 py-1.5 text-sm bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1"
                  >
                    <Trash2 size={14} /> Xóa
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Hash size={12} /> Tên khách hàng</p>
                  <p className="font-medium text-gray-800">{detailCustomer.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={12} /> Số điện thoại</p>
                  <p className="font-medium text-gray-800">{detailCustomer.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Mail size={12} /> Email</p>
                  <p className="font-medium text-gray-800">{detailCustomer.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={12} /> Địa chỉ</p>
                  <p className="font-medium text-gray-800">{detailCustomer.address || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Ngày tạo</p>
                  <p className="font-medium text-gray-800">{new Date(detailCustomer.createdAt).toLocaleDateString('vi-VN')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Tổng giá trị mua</p>
                  <p className="font-medium text-gray-800">{formatMoney(totalPurchased)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">Chú thích</p>
                <p className="text-sm bg-gray-50 border border-gray-200 rounded-lg p-3">{detailCustomer.note || '—'}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 col-span-2 sm:col-span-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-red-700">Công nợ phải thu còn lại</p>
                    <p className="text-xl font-extrabold text-red-700">{formatMoney(debt)}</p>
                  </div>
                  <Wallet className="text-red-600" size={24} />
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Tổng đơn đã mua</p>
                  <p className="text-lg font-bold text-gray-800">{custOrders.length}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Đơn hoàn thành</p>
                  <p className="text-lg font-bold text-emerald-700">{completed}</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                  <p className="text-xs text-gray-700">Chờ xử lý</p>
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
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-emerald-700">Tổng chi tiêu</p>
                    <p className="text-lg font-extrabold text-emerald-700">{formatMoney(totalSpent)}</p>
                  </div>
                  <Banknote className="text-emerald-600" size={22} />
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-lg p-3 space-y-2">
                <p className="text-sm font-bold text-gray-800">5 đơn gần nhất</p>
                {recent.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">Chưa có lịch sử đơn hàng.</p>
                ) : (
                  recent.map(o => (
                    <div key={o.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md border border-gray-200">
                      <div>
                        <p className="font-mono text-xs text-blue-700">{o.id}</p>
                        <p className="text-[10px] text-gray-500">{new Date(o.createdAt).toLocaleString('vi-VN')}</p>
                      </div>
                      <div className="text-right">
                        <span className="block text-sm font-bold text-blue-600">{formatMoney(o.totalAmount)}</span>
                        {statusBadge(o.status)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal isOpen={dupModalOpen} onClose={() => setDupModalOpen(false)} title="Rà Soát Khách Hàng Trùng Lặp">
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>
              Mỗi nhóm dưới đây gồm các bản ghi cùng số điện thoại (hoặc cùng tên khi chưa có SĐT).
              Khi dọn, hệ thống giữ lại bản ghi <strong>cũ nhất</strong> và xóa các bản ghi còn lại.
              Đơn hàng, phiếu thu và công nợ liên quan không bị ảnh hưởng.
            </p>
          </div>

          {duplicateGroups.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">Không còn khách hàng trùng lặp.</p>
          ) : (
            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {duplicateGroups.map((group, gi) => (
                <div key={gi} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                    {MockBackend.customerIdentityKey(group[0]).startsWith('phone:')
                      ? `SĐT: ${group[0].phone}`
                      : `Tên: ${group[0].name}`}
                    <span className="ml-2 font-normal text-gray-400">({group.length} bản ghi)</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {group.map((c, ci) => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="text-gray-800 truncate">
                            {c.name} <span className="font-mono text-xs text-gray-400">#{c.id}</span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {c.phone || 'Không SĐT'} · Tạo {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 ml-2 text-[10px] font-bold px-2 py-0.5 rounded ${
                            ci === 0 ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'
                          }`}
                        >
                          {ci === 0 ? 'Giữ lại' : 'Sẽ xóa'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDupModalOpen(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={cleanDuplicates}
              disabled={cleaningDup || duplicateGroups.length === 0}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60 flex items-center gap-1.5"
            >
              <Trash2 size={15} />
              {cleaningDup ? 'Đang dọn...' : `Dọn ${redundantCount} bản ghi trùng`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
