import React, { useEffect, useState } from 'react';
import { MockBackend } from '../services/mockBackend';
import { Order, ImportRecord, PaymentRecord } from '../types';
import { Banknote, Wallet, CreditCard, Loader2 } from 'lucide-react';
import { Modal } from '../components/Modal';

export const Debts: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'receivable'|'payable'>('receivable');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatusRec, setFilterStatusRec] = useState<'all'|'unpaid'|'partial'|'paid'>('all');
  const [filterStatusPay, setFilterStatusPay] = useState<'all'|'unpaid'|'partial'|'paid'>('all');

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payContext, setPayContext] = useState<{ kind: 'receivable' | 'payable'; orderId?: string; importId?: string; name: string; outstanding: number } | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentRecord['method']>('cash');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [o, i, p] = await Promise.all([
      MockBackend.getOrders(),
      MockBackend.getImports(),
      MockBackend.getPayments()
    ]);
    setOrders(o);
    setImports(i);
    setPayments(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const receivables = orders.map(o => {
    const paidSum = payments.filter(p => p.kind === 'receivable' && p.orderId === o.id).reduce((s, p) => s + p.amount, 0);
    return {
      id: o.id,
      name: o.customerName,
      total: o.totalAmount,
      paid: paidSum,
      outstanding: Math.max(0, o.totalAmount - paidSum),
      phone: o.customerPhone,
      orderStatus: o.status
    };
  }).map(x => ({
    ...x,
    status: x.paid <= 0 ? 'unpaid' : (x.paid >= x.total ? 'paid' : 'partial')
  }));
  const filteredReceivables = receivables.filter(r => 
    (search ? (r.name.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase())) : true) &&
    (filterStatusRec === 'all' ? true : r.status === filterStatusRec)
  );

  const payables = imports.filter(i => typeof i.totalCost === 'number').map(i => {
    const paid = payments.filter(p => p.kind === 'payable' && p.importId === i.id).reduce((s, p) => s + p.amount, 0);
    const total = i.totalCost as number;
    return {
      id: i.id,
      name: i.supplierName || i.note || 'Nhà cung cấp',
      total,
      paid,
      outstanding: Math.max(0, total - paid)
    };
  }).map(x => ({
    ...x,
    status: x.paid <= 0 ? 'unpaid' : (x.paid >= x.total ? 'paid' : 'partial')
  }));
  const filteredPayables = payables.filter(r => 
    (search ? (r.name.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase())) : true) &&
    (filterStatusPay === 'all' ? true : r.status === filterStatusPay)
  );

  const receivableSummary = {
    total: receivables.reduce((s, r) => s + r.total, 0),
    paid: receivables.reduce((s, r) => s + r.paid, 0),
    outstanding: receivables.reduce((s, r) => s + r.outstanding, 0),
    topDebtor: receivables.slice().sort((a, b) => b.outstanding - a.outstanding)[0]
  };
  const payableSummary = {
    total: payables.reduce((s, r) => s + r.total, 0),
    paid: payables.reduce((s, r) => s + r.paid, 0),
    outstanding: payables.reduce((s, r) => s + r.outstanding, 0),
    topSupplier: payables.slice().sort((a, b) => b.outstanding - a.outstanding)[0]
  };

  const openReceivablePay = (orderId: string) => {
    const o = receivables.find(r => r.id === orderId);
    if (!o) return;
    if (o.orderStatus !== 'Hoàn thành') {
      setNotice('Đơn hàng chưa hoàn thành, không thể thu tiền');
      setTimeout(()=>setNotice(''), 3000);
      return;
    }
    if (o.outstanding <= 0) {
      setNotice('Đơn hàng đã thanh toán đủ');
      setTimeout(()=>setNotice(''), 3000);
      return;
    }
    setPayContext({ kind: 'receivable', orderId, name: `${o.name} (${o.id})`, outstanding: o.outstanding });
    setPayAmount(o.outstanding);
    setPayMethod('cash');
    setPayModalOpen(true);
  };
  const openPayablePay = (importId: string) => {
    const s = payables.find(r => r.id === importId);
    if (!s) return;
    setPayContext({ kind: 'payable', importId, name: `${s.name}`, outstanding: s.outstanding });
    setPayAmount(s.outstanding);
    setPayMethod('bank');
    setPayModalOpen(true);
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payContext) return;
    setSaving(true);
    try {
      if (payContext.kind === 'receivable' && payContext.orderId) {
        await MockBackend.addOrderPayment(payContext.orderId, payAmount, payMethod);
        setNotice(`Đã thu ${payAmount.toLocaleString()} ₫ từ đơn ${payContext.orderId}`);
      } else if (payContext.kind === 'payable' && payContext.importId) {
        await MockBackend.addPayablePayment(payContext.importId, payAmount, payMethod);
        setNotice(`Đã thanh toán ${payAmount.toLocaleString()} ₫ cho NCC`);
      }
      setPayModalOpen(false);
      await load();
      setTimeout(()=>setNotice(''), 3000);
    } catch (err: any) {
      setNotice(err?.message || 'Lỗi khi ghi thanh toán');
      setTimeout(()=>setNotice(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;
  }

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
            <button onClick={()=>setTab('receivable')} className={`px-4 py-2 rounded ${tab==='receivable'?'bg-indigo-600 text-white':'text-gray-700 hover:bg-gray-50'}`}>Phải thu</button>
            <button onClick={()=>setTab('payable')} className={`px-4 py-2 rounded ${tab==='payable'?'bg-indigo-600 text-white':'text-gray-700 hover:bg-gray-50'}`}>Phải trả</button>
          </div>
        </div>
      </div>

      {tab === 'receivable' ? (
        <>
          <div className="flex items-center gap-3">
            <input 
              placeholder="Tìm theo tên hoặc mã đơn..."
              className="px-3 py-2 border border-gray-300 rounded-lg"
              value={search}
              onChange={(e)=>setSearch(e.target.value)}
            />
            <select 
              className="px-3 py-2 border border-gray-300 rounded-lg"
              value={filterStatusRec}
              onChange={(e)=>setFilterStatusRec(e.target.value as any)}
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
              <p className="text-xl font-bold text-indigo-700">{receivables.length}</p>
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
                  {filteredReceivables.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{r.id}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{r.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-800">{r.total.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm text-emerald-700">{r.paid.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm text-red-700 font-bold">{r.outstanding.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm">{r.status === 'unpaid' ? 'Chưa thanh toán' : r.status === 'partial' ? 'Còn nợ' : 'Đã thanh toán'}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={()=>openReceivablePay(r.id)} 
                          disabled={r.outstanding <= 0 || r.orderStatus !== 'Hoàn thành'}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm disabled:opacity-50"
                        >
                          Thu tiền
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredReceivables.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">Không có đơn nợ.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Lịch sử thu tiền</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {payments.filter(p=>p.kind==='receivable').slice(0,30).map(p=>(
                <div key={p.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">Đơn {p.orderId} • {p.customerName || 'Khách'}</p>
                    <p className="text-xs text-gray-600">{new Date(p.createdAt).toLocaleString('vi-VN')} • {p.method}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-700">{p.amount.toLocaleString()} ₫</span>
                  </div>
                </div>
              ))}
              {payments.filter(p=>p.kind==='receivable').length===0 && <p className="text-sm text-gray-500">Chưa có lịch sử thu tiền.</p>}
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
              onChange={(e)=>setSearch(e.target.value)}
            />
            <select 
              className="px-3 py-2 border border-gray-300 rounded-lg"
              value={filterStatusPay}
              onChange={(e)=>setFilterStatusPay(e.target.value as any)}
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
              <p className="text-xl font-bold text-indigo-700">{payables.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">NCC nợ nhiều nhất</p>
              <p className="text-sm font-bold text-gray-800">{payableSummary.topSupplier ? payableSummary.topSupplier.name : '—'}</p>
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
                  {filteredPayables.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{r.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-800">{r.total.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm text-emerald-700">{r.paid.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm text-red-700 font-bold">{r.outstanding.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-sm">{r.status === 'unpaid' ? 'Chưa thanh toán' : r.status === 'partial' ? 'Còn nợ' : 'Đã thanh toán'}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={()=>openPayablePay(r.id)} 
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
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-400">Không có công nợ phải trả.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Lịch sử thanh toán</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {payments.filter(p=>p.kind==='payable').slice(0,30).map(p=>(
                <div key={p.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{p.supplierName || 'Nhà cung cấp'}</p>
                    <p className="text-xs text-gray-600">{new Date(p.createdAt).toLocaleString('vi-VN')} • {p.method}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-700">{p.amount.toLocaleString()} ₫</span>
                  </div>
                </div>
              ))}
              {payments.filter(p=>p.kind==='payable').length===0 && <p className="text-sm text-gray-500">Chưa có lịch sử thanh toán.</p>}
            </div>
          </div>
        </>
      )}

      <Modal isOpen={payModalOpen} onClose={()=>setPayModalOpen(false)} title={payContext?.kind==='receivable' ? 'Thu Tiền' : 'Thanh Toán'}>
        <form onSubmit={submitPayment} className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded p-3 text-sm">
            <p className="font-semibold text-indigo-700">{payContext?.name || ''}</p>
            <p className="text-indigo-600">Còn nợ: {(payContext?.outstanding || 0).toLocaleString()} ₫</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền</label>
              <input type="number" min="0" value={payAmount} onChange={(e)=>setPayAmount(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phương thức</label>
              <select value={payMethod} onChange={(e)=>setPayMethod(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="cash">Tiền mặt</option>
                <option value="cod">COD</option>
                <option value="bank">Chuyển khoản</option>
                <option value="wallet">Ví điện tử</option>
                <option value="other">Khác</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={()=>setPayModalOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
              {saving && <Loader2 className="animate-spin" size={16} />}
              {saving ? 'Đang lưu...' : (payContext?.kind==='receivable' ? 'Thu Tiền' : 'Thanh Toán')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
