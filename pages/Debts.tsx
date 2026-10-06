import React, { useEffect, useState, useMemo } from 'react';
import { MockBackend } from '../services/mockBackend';
import { DebtService, Receivable, Payable, HistoryGroup } from '../services/debtService';
import { Order, ImportRecord, PaymentRecord, OrderStatus } from '../types';
import { Banknote, Wallet, CreditCard, Loader2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { NumberInput } from '../components/NumberInput';

export const Debts: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'receivable' | 'payable'>('receivable');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historySearchPay, setHistorySearchPay] = useState('');
  const [filterStatusRec, setFilterStatusRec] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [filterStatusPay, setFilterStatusPay] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payContext, setPayContext] = useState<{ kind: 'receivable' | 'payable'; orderId?: string; importId?: string; name: string; outstanding: number } | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentRecord['method']>('cash');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const bundle = await MockBackend.getDebtBundle();
      setOrders(bundle.orders);
      setImports(bundle.imports);
      setPayments(bundle.payments);
    } catch (err) {
      console.error('Failed to load debt bundle:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // --- DERIVED DATA VIA DebtService ---
  const receivables: Receivable[] = useMemo(
    () => DebtService.computeReceivables(orders, payments),
    [orders, payments],
  );

  const payables: Payable[] = useMemo(
    () => DebtService.computePayables(imports, payments),
    [imports, payments],
  );

  const filteredReceivables = useMemo(
    () => DebtService.filterReceivables(receivables, search, filterStatusRec),
    [receivables, search, filterStatusRec],
  );

  const filteredPayables = useMemo(
    () => DebtService.filterPayables(payables, search, filterStatusPay),
    [payables, search, filterStatusPay],
  );

  const receivableSummary = useMemo(
    () => DebtService.computeReceivableSummary(receivables),
    [receivables],
  );

  const payableSummary = useMemo(
    () => DebtService.computePayableSummary(payables),
    [payables],
  );

  const historyGroups: HistoryGroup[] = useMemo(() => {
    const combined = historySearch.trim() || search.trim();
    return DebtService.getReceivableHistory(orders, payments, combined);
  }, [orders, payments, historySearch, search]);

  const historyGroupsPay: HistoryGroup[] = useMemo(() => {
    const combined = historySearchPay.trim() || search.trim();
    return DebtService.getPayableHistory(imports, payments, combined);
  }, [imports, payments, historySearchPay, search]);

  // --- ACTIONS ---
  const showNotice = (msg: string, ms = 3000) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), ms);
  };

  const openReceivablePay = (orderId: string) => {
    const r = receivables.find((x) => x.id === orderId);
    const v = DebtService.validateReceivablePayment(r, r?.outstanding || 0);
    if (!v.ok) {
      showNotice((v as { ok: false; reason: string }).reason);
      return;
    }
    if (!r) return;
    setPayContext({ kind: 'receivable', orderId, name: `${r.name} (${r.id})`, outstanding: r.outstanding });
    setPayAmount(r.outstanding);
    setPayMethod('cash');
    setPayModalOpen(true);
  };

  const openPayablePay = (importId: string) => {
    const s = payables.find((x) => x.id === importId);
    const v = DebtService.validatePayablePayment(s, s?.outstanding || 0);
    if (!v.ok) {
      showNotice((v as { ok: false; reason: string }).reason);
      return;
    }
    if (!s) return;
    setPayContext({ kind: 'payable', importId, name: `${s.name}`, outstanding: s.outstanding });
    setPayAmount(s.outstanding);
    setPayMethod('bank');
    setPayModalOpen(true);
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payContext) return;

    let validation: { ok: true } | { ok: false; reason: string };
    if (payContext.kind === 'receivable') {
      const r = receivables.find((x) => x.id === payContext.orderId);
      validation = DebtService.validateReceivablePayment(r, payAmount);
    } else {
      const p = payables.find((x) => x.id === payContext.importId);
      validation = DebtService.validatePayablePayment(p, payAmount);
    }
    if (!validation.ok) {
      showNotice((validation as { ok: false; reason: string }).reason);
      return;
    }

    setSaving(true);
    try {
      if (payContext.kind === 'receivable' && payContext.orderId) {
        await MockBackend.addOrderPayment(payContext.orderId, payAmount, payMethod);
        showNotice(`Đã thu ${payAmount.toLocaleString()} ₫ từ đơn ${payContext.orderId}`);
      } else if (payContext.kind === 'payable' && payContext.importId) {
        await MockBackend.addPayablePayment(payContext.importId, payAmount, payMethod);
        showNotice(`Đã thanh toán ${payAmount.toLocaleString()} ₫ cho NCC`);
      }
      setPayModalOpen(false);
      await load();
    } catch (err: any) {
      showNotice(err?.message || 'Lỗi khi ghi thanh toán');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const statusLabel = (s: 'unpaid' | 'partial' | 'paid') =>
    s === 'unpaid' ? 'Chưa thanh toán' : s === 'partial' ? 'Còn nợ' : 'Đã thanh toán';

  return (
    <div className="space-y-6">
      {notice && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded shadow">
          {notice}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Công Nợ</h2>
          <p className="text-gray-500 text-sm">Theo dõi phải thu khách hàng và phải trả nhà cung cấp</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setTab('receivable')}
              className={`px-4 py-2 rounded ${tab === 'receivable' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Phải thu
            </button>
            <button
              onClick={() => setTab('payable')}
              className={`px-4 py-2 rounded ${tab === 'payable' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Phải trả
            </button>
          </div>
        </div>
      </div>

      {tab === 'receivable' ? (
        <>
          <div className="flex items-center gap-3">
            <input
              placeholder="Tìm theo tên khách hoặc mã đơn..."
              className="px-3 py-2 border border-gray-300 rounded-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg"
              value={filterStatusRec}
              onChange={(e) => setFilterStatusRec(e.target.value as any)}
            >
              <option value="all">Tất cả</option>
              <option value="unpaid">Chưa thanh toán</option>
              <option value="partial">Còn nợ một phần</option>
              <option value="paid">Đã thanh toán</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Tổng phải thu</p>
              <p className="text-xl font-bold text-gray-800">{receivableSummary.outstanding.toLocaleString()} ₫</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Đã thanh toán</p>
              <p className="text-xl font-bold text-emerald-700">{receivableSummary.paid.toLocaleString()} ₫</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Tổng đơn nợ</p>
              <p className="text-xl font-bold text-indigo-700">{receivableSummary.debtCount}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Khách nợ nhiều nhất</p>
              <p className="text-sm font-bold text-gray-800">{receivableSummary.topDebtor ? receivableSummary.topDebtor.name : '—'}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Đơn hàng</th>
                    <th className="px-6 py-4">Khách</th>
                    <th className="px-6 py-4">Tổng</th>
                    <th className="px-6 py-4">Đã trả</th>
                    <th className="px-6 py-4">Còn nợ</th>
                    <th className="px-6 py-4">Trạng thái</th>
                    <th className="px-6 py-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredReceivables.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{r.id}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{r.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-800">{r.total.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm text-emerald-700">{r.paid.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm text-red-700 font-bold">{r.outstanding.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm">{statusLabel(r.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openReceivablePay(r.id)}
                          disabled={r.outstanding <= 0 || r.orderStatus !== OrderStatus.COMPLETED}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm disabled:opacity-50"
                        >
                          Thu tiền
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredReceivables.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                        Không có đơn nợ.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Lịch sử thu tiền</h3>
            <div className="flex items-center gap-3 mb-3">
              <input
                placeholder="Tìm theo tên khách hàng..."
                className="px-3 py-2 border border-gray-300 rounded-lg w-full"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {historyGroups.length > 0 ? (
                historyGroups.map((g) => (
                  <div key={g.name} className="bg-gray-50 rounded border border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2 border-b border-gray-200 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{g.name}</p>
                        <p className="text-xs text-gray-600">
                          {g.itemCount} lần thu • Gần nhất {new Date(g.latestAt).toLocaleString('vi-VN')}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <span className="text-sm font-bold text-emerald-700">{g.total.toLocaleString()} ₫</span>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {g.items.slice(0, 15).map((p) => (
                        <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2 gap-1">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 font-medium sm:font-normal">Đơn {p.refId}</p>
                            <p className="text-xs text-gray-600">
                              {new Date(p.createdAt).toLocaleString('vi-VN')} •{' '}
                              {p.method === 'other' ? 'Hệ thống' : p.method}
                              {p.isGap ? ' (Cập nhật trực tiếp)' : ''}
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <span className="text-sm font-bold text-emerald-700">{p.amount.toLocaleString()} ₫</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Chưa có lịch sử thu tiền.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <input
              placeholder="Tìm NCC hoặc mã phiếu nhập..."
              className="px-3 py-2 border border-gray-300 rounded-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg"
              value={filterStatusPay}
              onChange={(e) => setFilterStatusPay(e.target.value as any)}
            >
              <option value="all">Tất cả</option>
              <option value="unpaid">Chưa thanh toán</option>
              <option value="partial">Còn nợ một phần</option>
              <option value="paid">Đã thanh toán</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Tổng phải trả</p>
              <p className="text-xl font-bold text-gray-800">{payableSummary.outstanding.toLocaleString()} ₫</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Đã thanh toán</p>
              <p className="text-xl font-bold text-emerald-700">{payableSummary.paid.toLocaleString()} ₫</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Phiếu nhập còn nợ</p>
              <p className="text-xl font-bold text-indigo-700">{payableSummary.debtCount}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">NCC nợ nhiều nhất</p>
              <p className="text-sm font-bold text-gray-800">{payableSummary.topDebtor ? payableSummary.topDebtor.name : '—'}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Nhà cung cấp</th>
                    <th className="px-6 py-4">Tổng</th>
                    <th className="px-6 py-4">Đã trả</th>
                    <th className="px-6 py-4">Còn nợ</th>
                    <th className="px-6 py-4">Trạng thái</th>
                    <th className="px-6 py-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPayables.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{r.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-800">{r.total.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm text-emerald-700">{r.paid.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm text-red-700 font-bold">{r.outstanding.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm">{statusLabel(r.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openPayablePay(r.id)}
                          disabled={r.outstanding <= 0}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm disabled:opacity-50"
                        >
                          Thanh toán
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredPayables.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        Không có công nợ phải trả.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Lịch sử thanh toán</h3>
            <div className="flex items-center gap-3 mb-3">
              <input
                placeholder="Tìm theo tên NCC hoặc mã phiếu nhập..."
                className="px-3 py-2 border border-gray-300 rounded-lg w-full"
                value={historySearchPay}
                onChange={(e) => setHistorySearchPay(e.target.value)}
              />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {historyGroupsPay.length > 0 ? (
                historyGroupsPay.map((g) => (
                  <div key={g.name} className="bg-gray-50 rounded border border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2 border-b border-gray-200 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{g.name}</p>
                        <p className="text-xs text-gray-600">
                          {g.itemCount} lần trả • Gần nhất {new Date(g.latestAt).toLocaleString('vi-VN')}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <span className="text-sm font-bold text-emerald-700">{g.total.toLocaleString()} ₫</span>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {g.items.slice(0, 15).map((p) => (
                        <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2 gap-1">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 font-medium sm:font-normal">Phiếu {p.refId}</p>
                            <p className="text-xs text-gray-600">
                              {new Date(p.createdAt).toLocaleString('vi-VN')} • {p.method}
                              {p.isGap ? ' (Cập nhật trực tiếp)' : ''}
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <span className="text-sm font-bold text-emerald-700">{p.amount.toLocaleString()} ₫</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Chưa có lịch sử thanh toán.</p>
              )}
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={payContext?.kind === 'receivable' ? 'Thu Tiền' : 'Thanh Toán'}
      >
        <form onSubmit={submitPayment} className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded p-3 text-sm">
            <p className="font-semibold text-indigo-700">{payContext?.name || ''}</p>
            <p className="text-indigo-600">Còn nợ: {(payContext?.outstanding || 0).toLocaleString()} ₫</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền</label>
              <NumberInput
                value={payAmount}
                onChange={(val) => setPayAmount(val)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                suffix="₫"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phương thức</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg h-[42px]"
              >
                <option value="cash">Tiền mặt</option>
                <option value="cod">COD</option>
                <option value="bank">Chuyển khoản</option>
                <option value="wallet">Ví điện tử</option>
                <option value="other">Khác</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPayModalOpen(false)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            >
              {saving && <Loader2 className="animate-spin" size={16} />}
              {saving ? 'Đang lưu...' : payContext?.kind === 'receivable' ? 'Thu Tiền' : 'Thanh Toán'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
