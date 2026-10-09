import React, { useEffect, useState, useMemo } from 'react';
import { MockBackend } from '../services/mockBackend';
import { DebtService, Receivable, Payable, HistoryGroup, HistoryItem } from '../services/debtService';
import { Order, ImportRecord, PaymentRecord, OrderStatus, Customer } from '../types';
import {
  Banknote,
  Wallet,
  CreditCard,
  Loader2,
  Search,
  Eye,
  Edit2,
  Printer,
  User,
  Phone,
  MapPin,
  FileText,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  XCircle,
  CheckCircle,
  Truck,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { NumberInput } from '../components/NumberInput';

type ReceivableViewMode = 'byOrder' | 'byCustomer';
type CustomerDetailTab = 'overview' | 'orders' | 'debt' | 'history';
type PayStatus = 'unpaid' | 'partial' | 'paid';

interface CustomerReceivable {
  key: string;
  name: string;
  phone: string;
  address: string;
  orderCount: number;
  goodsTotal: number;
  totalAmount: number;
  paid: number;
  outstanding: number;
  latestAt: string;
  orderIds: string[];
}

interface CustomerDebtLedgerRow {
  date: string;
  kind: 'order' | 'payment' | 'adjust';
  refId?: string;
  note: string;
  incurred: number;
  collected: number;
  balance: number;
}

const customerKeyOf = (name: string, phone: string) => `${(name || '').trim().toLowerCase()}__${(phone || '').trim()}`;

const payStatusOf = (total: number, paid: number): PayStatus => {
  if (paid <= 0) return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
};

const payStatusBadge = (s: PayStatus | undefined) => {
  if (s === 'paid')
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-md border border-green-200"><CheckCircle size={11}/> Đã TT</span>;
  if (s === 'partial')
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200"><Clock size={11}/> Một phần</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-md border border-red-200"><XCircle size={11}/> Chưa TT</span>;
};

const formatMoney = (n: number) => Math.round(n || 0).toLocaleString('vi-VN');

export const Debts: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
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

  // --- Chế độ xem theo khách hàng ---
  const [receivableViewMode, setReceivableViewMode] = useState<ReceivableViewMode>('byCustomer');
  const [customerRecSearch, setCustomerRecSearch] = useState('');
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [customerDetailTab, setCustomerDetailTab] = useState<CustomerDetailTab>('overview');

  // Bộ lọc trong Modal chi tiết khách
  const [custOrderStatusFilter, setCustOrderStatusFilter] = useState<'all' | PayStatus>('all');
  const [custOrderSearch, setCustOrderSearch] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const [custTxnSearch, setCustTxnSearch] = useState('');
  const [custDateFrom, setCustDateFrom] = useState('');
  const [custDateTo, setCustDateTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [bundle, custList] = await Promise.all([
        MockBackend.getDebtBundle(),
        MockBackend.getCustomers().catch(() => []),
      ]);
      setOrders(bundle.orders);
      setImports(bundle.imports);
      setPayments(bundle.payments);
      setCustomers(Array.isArray(custList) ? custList : []);
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

  // --- Dữ liệu gộp theo khách hàng Phải thu ---
  const customerReceivables: CustomerReceivable[] = useMemo(() => {
    const map = new Map<string, CustomerReceivable>();
    for (const o of orders) {
      if (o.status === OrderStatus.CANCELLED) continue;
      const key = customerKeyOf(o.customerName, o.customerPhone);
      const paid = DebtService.computePaidForOrder(o, payments);
      const goodsTotal = o.items.reduce((s, it) => s + it.price * it.quantity, 0);
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          key,
          name: o.customerName,
          phone: o.customerPhone,
          address: o.address || '',
          orderCount: 1,
          goodsTotal,
          totalAmount: o.totalAmount,
          paid,
          outstanding: Math.max(0, o.totalAmount - paid),
          latestAt: o.createdAt,
          orderIds: [o.id],
        });
      } else {
        cur.orderCount += 1;
        cur.goodsTotal += goodsTotal;
        cur.totalAmount += o.totalAmount;
        cur.paid += paid;
        cur.outstanding += Math.max(0, o.totalAmount - paid);
        cur.orderIds.push(o.id);
        if (new Date(o.createdAt).getTime() > new Date(cur.latestAt).getTime()) cur.latestAt = o.createdAt;
        if (!cur.address && o.address) cur.address = o.address;
      }
    }
    // bổ sung thông tin từ danh sách customers (nếu có)
    for (const c of customers || []) {
      const key = customerKeyOf(c.name, c.phone);
      const cur = map.get(key);
      if (cur) {
        if (!cur.address && c.address) cur.address = c.address;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
    );
  }, [orders, payments, customers]);

  const filteredCustomerReceivables = useMemo(() => {
    const s = customerRecSearch.trim().toLowerCase();
    let list = customerReceivables;
    if (s) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          c.phone.includes(s) ||
          c.address.toLowerCase().includes(s) ||
          c.orderIds.some((id) => id.toLowerCase().includes(s)),
      );
    }
    if (filterStatusRec === 'paid') list = list.filter((c) => c.outstanding <= 0);
    else if (filterStatusRec === 'unpaid') list = list.filter((c) => c.paid <= 0 && c.outstanding > 0);
    else if (filterStatusRec === 'partial')
      list = list.filter((c) => c.paid > 0 && c.outstanding > 0);
    return list;
  }, [customerReceivables, customerRecSearch, filterStatusRec]);

  // --- Khách hàng đang xem chi tiết ---
  const selectedCustomer = useMemo<CustomerReceivable | undefined>(() => {
    if (!selectedCustomerKey) return undefined;
    return customerReceivables.find((c) => c.key === selectedCustomerKey);
  }, [selectedCustomerKey, customerReceivables]);

  // Các đơn thuộc khách được chọn
  const selectedCustomerOrders = useMemo<Order[]>(() => {
    if (!selectedCustomer) return [];
    const name = selectedCustomer.name;
    const phone = selectedCustomer.phone;
    return orders
      .filter((o) => o.customerName === name && o.customerPhone === phone && o.status !== OrderStatus.CANCELLED)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [selectedCustomer, orders]);

  // Tính toán đã thanh toán / còn nợ per-order cho khách được chọn
  const selectedOrderWithPay = useMemo(() => {
    return selectedCustomerOrders.map((o) => {
      const paid = DebtService.computePaidForOrder(o, payments);
      const beforeLineDisc = o.items.reduce((s, it) => s + it.price * it.quantity, 0);
      const lineDiscTotal = o.items.reduce((s, it) => {
        const sub = it.price * it.quantity;
        const pct = Math.max(0, Math.min(100, (it as any).discountPercent ?? 0));
        return s + Math.round(sub * (pct / 100));
      }, 0);
      const afterLineDisc = beforeLineDisc - lineDiscTotal;
      const orderDiscPct = Math.max(0, Math.min(100, o.discountPercent ?? 0));
      const orderDiscAmount = Math.round(afterLineDisc * (orderDiscPct / 100));
      const afterDisc = afterLineDisc - orderDiscAmount;
      return {
        order: o,
        beforeLineDisc,
        lineDiscTotal,
        afterLineDisc,
        goodsTotal: beforeLineDisc,      // Compat: giữ goodsTotal = SL×Giá (hiển thị ở tóm tắt header)
        discPct: orderDiscPct,
        discAmount: orderDiscAmount,
        afterDisc,
        paid,
        outstanding: Math.max(0, o.totalAmount - paid),
        status: payStatusOf(o.totalAmount, paid),
      };
    });
  }, [selectedCustomerOrders, payments]);

  // Lọc đơn hàng trong tab Đơn hàng của khách
  const filteredCustomerOrders = useMemo(() => {
    let list = selectedOrderWithPay;
    const s = custOrderSearch.trim().toLowerCase();
    if (s) list = list.filter((x) => x.order.id.toLowerCase().includes(s));
    if (custOrderStatusFilter !== 'all') list = list.filter((x) => x.status === custOrderStatusFilter);
    if (custDateFrom)
      list = list.filter((x) => new Date(x.order.createdAt) >= new Date(custDateFrom + 'T00:00:00'));
    if (custDateTo)
      list = list.filter((x) => new Date(x.order.createdAt) <= new Date(custDateTo + 'T23:59:59'));
    return list;
  }, [selectedOrderWithPay, custOrderSearch, custOrderStatusFilter, custDateFrom, custDateTo]);

  // Lịch sử thanh toán của khách được chọn
  const customerPayments = useMemo<(PaymentRecord & { isGap?: boolean })[]>(() => {
    if (!selectedCustomer) return [];
    const orderIds = new Set(selectedCustomerOrders.map((o) => o.id));
    const actual: (PaymentRecord & { isGap?: boolean })[] = payments.filter(
      (p) => p.kind === 'receivable' && p.orderId && orderIds.has(p.orderId),
    );
    const actualByOrder = new Map<string, number>();
    for (const p of actual) {
      if (!p.orderId) continue;
      actualByOrder.set(p.orderId, (actualByOrder.get(p.orderId) || 0) + p.amount);
    }
    const gaps: (PaymentRecord & { isGap: boolean })[] = [];
    for (const o of selectedCustomerOrders) {
      const gap = (o.paidAmount || 0) - (actualByOrder.get(o.id) || 0);
      if (gap > 0) {
        gaps.push({
          id: `gap_cust_${o.id}`,
          kind: 'receivable',
          orderId: o.id,
          amount: gap,
          method: 'other',
          createdAt: o.lastPaidAt || o.createdAt,
          customerName: o.customerName,
          isGap: true,
        });
      }
    }
    return [...actual, ...gaps].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [selectedCustomer, selectedCustomerOrders, payments]);

  // Sổ cái công nợ cho khách (đầu kỳ - phát sinh - thu - còn lại)
  const customerLedger = useMemo<{
    opening: number;
    incurred: number;
    collected: number;
    balance: number;
    rows: CustomerDebtLedgerRow[];
  }>(() => {
    if (!selectedCustomer) return { opening: 0, incurred: 0, collected: 0, balance: 0, rows: [] };
    // Lấy tất cả sự kiện (đơn + thanh toán), sắp xếp theo thời gian
    type Ev = { date: string; kind: 'order' | 'payment'; order?: Order; pay?: PaymentRecord & { isGap?: boolean } };
    const events: Ev[] = [];
    for (const o of selectedCustomerOrders) events.push({ date: o.createdAt, kind: 'order', order: o });
    for (const p of customerPayments) events.push({ date: p.createdAt, kind: 'payment', pay: p });
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const rows: CustomerDebtLedgerRow[] = [];
    let running = 0;
    let incurred = 0;
    let collected = 0;
    for (const ev of events) {
      if (ev.kind === 'order' && ev.order) {
        const amt = ev.order.totalAmount;
        running += amt;
        incurred += amt;
        rows.push({
          date: ev.order.createdAt,
          kind: 'order',
          refId: ev.order.id,
          note: `Đơn hàng: ${ev.order.id} (${ev.order.items.reduce((s, i) => s + i.quantity, 0)} SP)`,
          incurred: amt,
          collected: 0,
          balance: running,
        });
      } else if (ev.kind === 'payment' && ev.pay) {
        const amt = ev.pay.amount;
        running -= amt;
        collected += amt;
        const methodLabel =
          ev.pay.method === 'cash' ? 'Tiền mặt' :
          ev.pay.method === 'bank' ? 'Chuyển khoản' :
          ev.pay.method === 'cod' ? 'COD' :
          ev.pay.method === 'wallet' ? 'Ví điện tử' : 'Khác';
        rows.push({
          date: ev.pay.createdAt,
          kind: 'payment',
          refId: ev.pay.orderId,
          note: `Thu tiền${ev.pay.isGap ? ' (cập nhật trực tiếp)' : ''} • ${methodLabel}${ev.pay.note ? ' • Ghi chú: ' + ev.pay.note : ''}`,
          incurred: 0,
          collected: amt,
          balance: running,
        });
      }
    }
    return { opening: 0, incurred, collected, balance: running, rows: rows.reverse() };
  }, [selectedCustomer, selectedCustomerOrders, customerPayments]);

  // Lịch sử giao dịch cho Tab 4 (kết hợp đơn + thu tiền), có tìm kiếm & lọc ngày
  const customerAllTxns = useMemo(() => {
    if (!selectedCustomer) return [];
    type Txn = {
      date: string;
      kind: 'order' | 'payment';
      refId?: string;
      title: string;
      sub: string;
      amount: number;
      paid: number;
      outstanding: number;
      method?: PaymentRecord['method'];
      isGap?: boolean;
      orderStatus?: OrderStatus;
    };
    const list: Txn[] = [];
    for (const x of selectedOrderWithPay) {
      list.push({
        date: x.order.createdAt,
        kind: 'order',
        refId: x.order.id,
        title: `Đơn hàng ${x.order.id}`,
        sub: `${x.order.items.reduce((s, i) => s + i.quantity, 0)} sản phẩm • ${x.order.items.map((i) => i.name).slice(0, 3).join(', ')}${x.order.items.length > 3 ? '...' : ''}`,
        amount: x.afterDisc,
        paid: x.paid,
        outstanding: x.outstanding,
        orderStatus: x.order.status,
      });
    }
    for (const p of customerPayments) {
      list.push({
        date: p.createdAt,
        kind: 'payment',
        refId: p.orderId,
        title: `Thu tiền đơn ${p.orderId || ''}`,
        sub: p.isGap ? 'Cập nhật số đã trả trực tiếp' : (p.note || ''),
        amount: 0,
        paid: p.amount,
        outstanding: 0,
        method: p.method,
        isGap: p.isGap,
      });
    }
    let out = list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const s = custTxnSearch.trim().toLowerCase();
    if (s) {
      out = out.filter(
        (x) =>
          (x.refId || '').toLowerCase().includes(s) ||
          x.title.toLowerCase().includes(s) ||
          x.sub.toLowerCase().includes(s),
      );
    }
    if (custDateFrom)
      out = out.filter((x) => new Date(x.date) >= new Date(custDateFrom + 'T00:00:00'));
    if (custDateTo)
      out = out.filter((x) => new Date(x.date) <= new Date(custDateTo + 'T23:59:59'));
    return out;
  }, [selectedCustomer, selectedOrderWithPay, customerPayments, custTxnSearch, custDateFrom, custDateTo]);

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

  const openCustomerDetail = (c: CustomerReceivable) => {
    setSelectedCustomerKey(c.key);
    setCustomerDetailTab('overview');
    setCustOrderStatusFilter('all');
    setCustTxnSearch('');
    setCustDateFrom('');
    setCustDateTo('');
    setCustomerDetailOpen(true);
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

  const methodLabel = (m: PaymentRecord['method'] | undefined) => {
    switch (m) {
      case 'cash': return 'Tiền mặt';
      case 'bank': return 'Chuyển khoản';
      case 'cod': return 'COD';
      case 'wallet': return 'Ví điện tử';
      case 'other': return 'Khác';
      default: return '—';
    }
  };

  const orderStatusBadge = (s: OrderStatus) => {
    switch (s) {
      case OrderStatus.COMPLETED:
        return <span className="flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-md border border-green-200"><CheckCircle size={11}/> Hoàn thành</span>;
      case OrderStatus.SHIPPING:
        return <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200"><Truck size={11}/> Đang giao</span>;
      case OrderStatus.CANCELLED:
        return <span className="flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-md border border-red-200"><XCircle size={11}/> Đã hủy</span>;
      default:
        return <span className="flex items-center gap-1 text-[11px] font-bold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-md border border-yellow-200"><Clock size={11}/> Chờ xử lý</span>;
    }
  };

  // ====== RENDER ======
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
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Chế độ xem */}
            <div className="bg-white border border-gray-200 rounded-lg p-1 flex">
              <button
                onClick={() => setReceivableViewMode('byCustomer')}
                className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition ${
                  receivableViewMode === 'byCustomer' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <User size={15}/> Theo khách hàng
              </button>
              <button
                onClick={() => setReceivableViewMode('byOrder')}
                className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition ${
                  receivableViewMode === 'byOrder' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <FileText size={15}/> Theo đơn hàng
              </button>
            </div>

            {receivableViewMode === 'byCustomer' ? (
              <input
                placeholder="Tìm theo tên khách, SĐT, địa chỉ, mã đơn..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                value={customerRecSearch}
                onChange={(e) => setCustomerRecSearch(e.target.value)}
              />
            ) : (
              <input
                placeholder="Tìm theo tên khách hoặc mã đơn..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}

            <select
              className="px-3 py-2 border border-gray-300 rounded-lg"
              value={filterStatusRec}
              onChange={(e) => setFilterStatusRec(e.target.value as any)}
            >
              <option value="all">Tất cả trạng thái</option>
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
              <p className="text-xs text-gray-500">
                {receivableViewMode === 'byCustomer' ? 'Khách còn nợ' : 'Tổng đơn nợ'}
              </p>
              <p className="text-xl font-bold text-indigo-700">
                {receivableViewMode === 'byCustomer'
                  ? customerReceivables.filter((c) => c.outstanding > 0).length
                  : receivableSummary.debtCount}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">
                {receivableViewMode === 'byCustomer' ? 'Tổng khách hàng' : 'Khách nợ nhiều nhất'}
              </p>
              <p className="text-sm font-bold text-gray-800 truncate">
                {receivableViewMode === 'byCustomer'
                  ? customerReceivables.length + ' khách'
                  : receivableSummary.topDebtor ? receivableSummary.topDebtor.name : '—'}
              </p>
            </div>
          </div>

          {/* ============ BẢNG THEO KHÁCH HÀNG ============ */}
          {receivableViewMode === 'byCustomer' ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center justify-between">
                <p className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                  <User size={16}/> DANH SÁCH KHÁCH HÀNG PHẢI THU
                </p>
                <p className="text-xs text-indigo-700/80">
                  Nhấn vào bất kỳ dòng nào để xem chi tiết khách hàng
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                    <tr>
                      <th className="px-6 py-4">Khách Hàng</th>
                      <th className="px-6 py-4 text-center">Số Đơn</th>
                      <th className="px-6 py-4 text-right">Tổng tiền hàng</th>
                      <th className="px-6 py-4 text-right">Đã trả</th>
                      <th className="px-6 py-4 text-right">Còn nợ</th>
                      <th className="px-6 py-4">TT thanh toán</th>
                      <th className="px-6 py-4 text-right">Giao dịch gần nhất</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCustomerReceivables.map((c) => {
                      const ps: PayStatus = c.outstanding <= 0 ? 'paid' : c.paid <= 0 ? 'unpaid' : 'partial';
                      return (
                        <tr
                          key={c.key}
                          className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                          onClick={() => openCustomerDetail(c)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                                {(c.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">{c.name}</p>
                                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                                  <Phone size={11}/>{c.phone || '—'}
                                  {c.address && <><span className="text-gray-300">|</span><MapPin size={11}/><span className="truncate max-w-[200px]">{c.address}</span></>}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-[36px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 text-sm font-black border border-indigo-200">
                              {c.orderCount}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-sm text-gray-800 font-semibold">
                            {formatMoney(c.totalAmount)} ₫
                          </td>
                          <td className="px-6 py-4 text-right text-sm text-emerald-700 font-semibold">
                            {formatMoney(c.paid)} ₫
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className={`text-sm font-black ${c.outstanding > 0 ? 'text-red-700' : 'text-green-600'}`}>
                              {formatMoney(c.outstanding)} ₫
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {payStatusBadge(ps)}
                          </td>
                          <td className="px-6 py-4 text-right text-xs text-gray-500">
                            {new Date(c.latestAt).toLocaleDateString('vi-VN')}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredCustomerReceivables.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                          Không tìm thấy khách hàng phù hợp.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ============ BẢNG THEO ĐƠN HÀNG (giữ nguyên cũ) ============ */
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
          )}

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
        /* ============ TAB PHẢI TRÁ ============ */
        <>
          <div className="flex items-center gap-3">
            <input
              placeholder="Tìm NCC hoặc mã phiếu nhập..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
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

      {/* ============== MODAL THU / TRẢ TIỀN ============== */}
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

      {/* ============== MODAL CHI TIẾT KHÁCH HÀNG 4 TAB ============== */}
      <Modal
        isOpen={customerDetailOpen && !!selectedCustomer}
        onClose={() => {
          setCustomerDetailOpen(false);
          setSelectedCustomerKey(null);
        }}
        title={`Chi tiết khách hàng`}
        maxWidthClass="max-w-6xl"
      >
        {selectedCustomer && (
          <div className="space-y-5">
            {/* HEADER Thông tin khách */}
            <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-2xl shadow-lg">
                  {(selectedCustomer.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-black text-gray-900 truncate">{selectedCustomer.name}</h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-gray-600">
                    <span className="flex items-center gap-1.5"><Phone size={14}/><strong>{selectedCustomer.phone || '—'}</strong></span>
                    {selectedCustomer.address && (
                      <span className="flex items-center gap-1.5 min-w-0">
                        <MapPin size={14}/><span className="truncate">{selectedCustomer.address}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Clock size={14}/> Giao dịch gần nhất: <strong>{new Date(selectedCustomer.latestAt).toLocaleDateString('vi-VN')}</strong>
                    </span>
                  </div>
                </div>
                {/* Số liệu nhanh */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 text-center shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Số đơn</p>
                    <p className="text-lg font-black text-indigo-700">{selectedCustomer.orderCount}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 text-center shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Tổng tiền</p>
                    <p className="text-md font-black text-gray-800 leading-tight">{formatMoney(selectedCustomer.totalAmount)}</p>
                    <p className="text-[9px] text-gray-500">VNĐ</p>
                  </div>
                  <div className="bg-white rounded-xl border border-green-200 px-3 py-2 text-center shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-green-600 tracking-wide">Đã trả</p>
                    <p className="text-md font-black text-green-700 leading-tight">{formatMoney(selectedCustomer.paid)}</p>
                    <p className="text-[9px] text-green-500">VNĐ</p>
                  </div>
                  <div className={`rounded-xl border-2 px-3 py-2 text-center shadow-sm ${
                    selectedCustomer.outstanding > 0
                      ? 'bg-gradient-to-br from-red-50 to-amber-50 border-red-300'
                      : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300'
                  }`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${selectedCustomer.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      Còn nợ
                    </p>
                    <p className={`text-md font-black leading-tight ${selectedCustomer.outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {formatMoney(selectedCustomer.outstanding)}
                    </p>
                    <p className={`text-[9px] ${selectedCustomer.outstanding > 0 ? 'text-red-500' : 'text-green-500'}`}>VNĐ</p>
                  </div>
                </div>
              </div>
            </div>

            {/* TABS */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-4 border-b border-gray-200 bg-gray-50">
                {([
                  ['overview', 'Tổng quan', FileText],
                  ['orders', 'Tất cả đơn hàng', FileText],
                  ['debt', 'Công nợ', CreditCard],
                  ['history', 'Lịch sử giao dịch', Clock],
                ] as [CustomerDetailTab, string, any][]).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setCustomerDetailTab(key)}
                    className={`py-3 px-3 text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                      customerDetailTab === key
                        ? 'bg-white text-indigo-700 border-b-2 border-indigo-600 -mb-px'
                        : 'text-gray-600 hover:bg-gray-100/60'
                    }`}
                  >
                    <Icon size={15}/> {label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {/* ==================== TAB 1: TỔNG QUAN ==================== */}
                {customerDetailTab === 'overview' && (
                  <div className="space-y-5">
                    {/* Thông tin liên hệ */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="border-2 border-gray-100 rounded-xl p-4 bg-white">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1"><User size={12}/> Họ tên</p>
                        <p className="text-base font-bold text-gray-900 mt-1">{selectedCustomer.name}</p>
                      </div>
                      <div className="border-2 border-gray-100 rounded-xl p-4 bg-white">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1"><Phone size={12}/> Số điện thoại</p>
                        <p className="text-base font-bold text-gray-900 mt-1">{selectedCustomer.phone || '—'}</p>
                      </div>
                      <div className="border-2 border-gray-100 rounded-xl p-4 bg-white">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1"><MapPin size={12}/> Địa chỉ</p>
                        <p className="text-base font-bold text-gray-900 mt-1">{selectedCustomer.address || '—'}</p>
                      </div>
                    </div>

                    {/* Số liệu tổng hợp */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-xl p-4 shadow-md">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-50/90">Tổng số đơn hàng</p>
                        <p className="text-3xl font-black mt-1">{selectedCustomer.orderCount}</p>
                      </div>
                      <div className="bg-gradient-to-br from-slate-600 to-slate-800 text-white rounded-xl p-4 shadow-md">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-100/90">Tổng tiền hàng</p>
                        <p className="text-2xl font-black mt-1 leading-tight">{formatMoney(selectedCustomer.goodsTotal)}</p>
                        <p className="text-[10px] text-slate-200/90 mt-0.5">Tổng SL × Đơn giá (trước CK)</p>
                      </div>
                      <div className="bg-gradient-to-br from-emerald-500 to-green-700 text-white rounded-xl p-4 shadow-md">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-50/90">Đã thanh toán</p>
                        <p className="text-2xl font-black mt-1 leading-tight">{formatMoney(selectedCustomer.paid)}</p>
                        <p className="text-[10px] text-emerald-100/90 mt-0.5">
                          {selectedCustomer.totalAmount > 0
                            ? `Chiếm ${Math.round((selectedCustomer.paid / selectedCustomer.totalAmount) * 100)}% tổng tiền`
                            : ''}
                        </p>
                      </div>
                      <div className={`rounded-xl p-4 shadow-md text-white ${
                        selectedCustomer.outstanding > 0
                          ? 'bg-gradient-to-br from-red-500 to-rose-700'
                          : 'bg-gradient-to-br from-green-500 to-emerald-700'
                      }`}>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">Công nợ hiện tại</p>
                        <p className="text-2xl font-black mt-1 leading-tight">{formatMoney(selectedCustomer.outstanding)}</p>
                        <p className="text-[10px] text-white/90 mt-0.5">
                          {selectedCustomer.outstanding > 0 ? 'Chưa thanh toán xong' : 'Không còn nợ ✓'}
                        </p>
                      </div>
                    </div>

                    {/* 3 đơn gần nhất */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-black text-gray-900 flex items-center gap-1.5"><FileText size={14}/> 3 ĐƠN HÀNG GẦN NHẤT</h4>
                        <button onClick={() => setCustomerDetailTab('orders')} className="text-xs font-bold text-indigo-700 hover:text-indigo-800 flex items-center gap-0.5">
                          Xem tất cả <ChevronRight size={13}/>
                        </button>
                      </div>
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        {selectedOrderWithPay.slice(0, 3).map(({ order, goodsTotal, discPct, afterDisc, paid, outstanding, status }) => (
                          <div key={order.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-indigo-50/30">
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-sm text-indigo-700 font-mono">{order.id}</p>
                                  {orderStatusBadge(order.status)}
                                  {payStatusBadge(status)}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {new Date(order.createdAt).toLocaleString('vi-VN')} • {order.items.reduce((s, i) => s + i.quantity, 0)} SP
                                </p>
                                <p className="text-xs text-gray-600 mt-0.5 truncate">
                                  {order.items.map((i) => `${i.name} (${i.quantity}${i.unit ? ' ' + i.unit : ''})`).join(' • ')}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 md:gap-4 text-right">
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-gray-500">Tổng</p>
                                  <p className="text-sm font-bold text-gray-800">{formatMoney(afterDisc)} ₫</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-green-600">Đã trả</p>
                                  <p className="text-sm font-bold text-green-700">{formatMoney(paid)} ₫</p>
                                </div>
                                <div>
                                  <p className={`text-[10px] font-bold uppercase ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>Còn nợ</p>
                                  <p className={`text-sm font-black ${outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>{formatMoney(outstanding)} ₫</p>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openReceivablePay(order.id); }}
                                    disabled={outstanding <= 0 || order.status !== OrderStatus.COMPLETED}
                                    className="px-3 py-1 text-xs font-bold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                  >
                                    <Wallet size={11}/> Thu tiền
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {selectedOrderWithPay.length === 0 && (
                          <div className="px-4 py-10 text-center text-gray-400 text-sm">Chưa có đơn hàng.</div>
                        )}
                      </div>
                    </div>

                    {/* 3 lần thu gần nhất */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-black text-gray-900 flex items-center gap-1.5"><Banknote size={14}/> 3 LẦN THU TIỀN GẦN NHẤT</h4>
                        <button onClick={() => setCustomerDetailTab('debt')} className="text-xs font-bold text-indigo-700 hover:text-indigo-800 flex items-center gap-0.5">
                          Xem tất cả <ChevronRight size={13}/>
                        </button>
                      </div>
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        {customerPayments.slice(0, 3).map((p) => (
                          <div key={p.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0 flex items-center gap-3 hover:bg-green-50/40">
                            <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
                              <ArrowDownCircle size={18}/>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900">
                                Thu {formatMoney(p.amount)} ₫
                                {p.isGap && <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Cập nhật</span>}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {new Date(p.createdAt).toLocaleString('vi-VN')}
                                {p.orderId && <> • Đơn <span className="font-semibold text-indigo-700">{p.orderId}</span></>}
                                {' • Phương thức: '}<strong>{methodLabel(p.method)}</strong>
                              </p>
                            </div>
                          </div>
                        ))}
                        {customerPayments.length === 0 && (
                          <div className="px-4 py-10 text-center text-gray-400 text-sm">Chưa có lần thu tiền nào.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ==================== TAB 2: TẤT CẢ ĐƠN HÀNG (ACCORDION) ==================== */}
                {customerDetailTab === 'orders' && (
                  <div className="space-y-4">
                    {/* Bộ lọc */}
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15}/>
                        <input
                          placeholder="Tìm kiếm theo mã đơn hàng..."
                          value={custOrderSearch}
                          onChange={(e) => setCustOrderSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                      <select
                        value={custOrderStatusFilter}
                        onChange={(e) => setCustOrderStatusFilter(e.target.value as any)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      >
                        <option value="all">Tất cả trạng thái TT</option>
                        <option value="unpaid">Chưa thanh toán</option>
                        <option value="partial">Thanh toán một phần</option>
                        <option value="paid">Đã thanh toán đủ</option>
                      </select>
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Calendar size={13}/> Từ ngày
                      </div>
                      <input
                        type="date"
                        value={custDateFrom}
                        onChange={(e) => setCustDateFrom(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <div className="flex items-center gap-1 text-xs text-gray-600">Đến ngày</div>
                      <input
                        type="date"
                        value={custDateTo}
                        onChange={(e) => setCustDateTo(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <div className="flex gap-2 ml-auto">
                        <button
                          onClick={() => {
                            if (filteredCustomerOrders.length === 0) return;
                            const allIds = new Set(filteredCustomerOrders.map(x => x.order.id));
                            setExpandedOrderIds(prev => {
                              // Nếu đang mở tất cả thì thu gọn, ngược lại mở tất cả
                              const allOpened = allIds.size > 0 && Array.from(allIds).every(id => prev.has(id));
                              return allOpened ? new Set() : allIds;
                            });
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50"
                        >
                          {filteredCustomerOrders.length > 0 && Array.from(new Set(filteredCustomerOrders.map(x => x.order.id))).every(id => expandedOrderIds.has(id))
                            ? 'Thu gọn tất cả'
                            : 'Mở rộng tất cả'}
                        </button>
                        <button
                          onClick={() => { setCustDateFrom(''); setCustDateTo(''); setCustOrderStatusFilter('all'); setCustOrderSearch(''); setExpandedOrderIds(new Set()); }}
                          className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100"
                        >
                          Đặt lại
                        </button>
                      </div>
                    </div>

                    {/* Tổng số kết quả */}
                    {filteredCustomerOrders.length > 0 && (
                      <div className="flex items-center justify-between text-xs text-gray-600 px-1">
                        <p className="font-semibold">
                          Hiển thị <span className="text-indigo-700">{filteredCustomerOrders.length}</span> / {selectedOrderWithPay.length} đơn hàng
                        </p>
                        <p className="font-medium">
                          <span className="font-bold text-indigo-700">Tổng:</span>{' '}
                          {formatMoney(filteredCustomerOrders.reduce((s, x) => s + x.afterDisc, 0))} ₫
                          <span className="mx-1.5 text-gray-300">|</span>
                          <span className="font-bold text-green-700">Đã thu:</span>{' '}
                          {formatMoney(filteredCustomerOrders.reduce((s, x) => s + x.paid, 0))} ₫
                          <span className="mx-1.5 text-gray-300">|</span>
                          <span className="font-bold text-red-700">Còn nợ:</span>{' '}
                          {formatMoney(filteredCustomerOrders.reduce((s, x) => s + x.outstanding, 0))} ₫
                        </p>
                      </div>
                    )}

                    {/* Danh sách đơn dạng Accordion */}
                    <div className="space-y-3">
                      {filteredCustomerOrders.length === 0 && (
                        <div className="border-2 border-dashed border-gray-200 rounded-xl py-14 text-center text-gray-400">
                          <FileText size={48} className="mx-auto mb-3 text-gray-300"/>
                          <p className="font-semibold">Không có đơn hàng phù hợp</p>
                          <p className="text-xs mt-1">Thử đặt lại bộ lọc hoặc tìm kiếm khác</p>
                        </div>
                      )}
                      {filteredCustomerOrders.map((entry, entryIdx) => {
                        const { order, beforeLineDisc, lineDiscTotal, afterLineDisc, goodsTotal, discPct, discAmount, afterDisc, paid, outstanding, status } = entry;
                        const isExpanded = expandedOrderIds.has(order.id);
                        // Lấy lịch sử thanh toán của riêng đơn này
                        const orderPayments = customerPayments.filter((p) => p.orderId === order.id);
                        return (
                          <div
                            key={order.id}
                            className={`border-2 rounded-2xl transition-all overflow-hidden ${
                              isExpanded ? 'border-indigo-400 shadow-lg shadow-indigo-100' : 'border-gray-200 hover:border-indigo-200 hover:shadow-sm'
                            }`}
                          >
                            {/* === HEADER ROW: click để mở rộng/thu gọn === */}
                            <div
                              className={`px-5 py-3.5 cursor-pointer transition-colors ${
                                isExpanded ? 'bg-gradient-to-r from-indigo-50 to-blue-50' : 'bg-white hover:bg-indigo-50/40'
                              }`}
                              onClick={() => {
                                setExpandedOrderIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(order.id)) next.delete(order.id);
                                  else next.add(order.id);
                                  return next;
                                });
                              }}
                            >
                              <div className="grid grid-cols-12 gap-3 items-center">
                                {/* Cột 1: Mã đơn + Ngày + Badge trạng thái */}
                                <div className="col-span-12 md:col-span-3 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <ChevronRight
                                      size={16}
                                      className={`text-indigo-600 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                                    />
                                    <p className="font-mono font-black text-indigo-700 text-base">{order.id}</p>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5 ml-6 flex items-center gap-1.5">
                                    <Clock size={11}/>
                                    {new Date(order.createdAt).toLocaleString('vi-VN')}
                                  </p>
                                  <div className="mt-1.5 ml-6 flex flex-wrap gap-1.5">
                                    {orderStatusBadge(order.status)}
                                    {payStatusBadge(status)}
                                    {discPct > 0 && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                        Ưu đãi {discPct}%
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Cột 2: Tóm tắt số liệu */}
                                <div className="col-span-6 md:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-2 ml-0 md:ml-0 pl-6 md:pl-0">
                                  <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Tiền hàng</p>
                                    <p className="text-sm font-bold text-gray-800">{formatMoney(goodsTotal)} ₫</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase text-amber-600 tracking-wide">Sau CK</p>
                                    <p className="text-sm font-bold text-amber-800">{formatMoney(afterDisc)} ₫</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase text-green-600 tracking-wide">Đã trả</p>
                                    <p className="text-sm font-black text-green-700">{formatMoney(paid)} ₫</p>
                                  </div>
                                  <div className="text-right">
                                    <p className={`text-[10px] font-bold uppercase tracking-wide ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>Còn nợ</p>
                                    <p className={`text-base font-black ${outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                      {formatMoney(outstanding)} ₫
                                    </p>
                                  </div>
                                </div>

                                {/* Cột 3: Các nút thao tác */}
                                <div className="col-span-12 md:col-span-2 flex md:justify-end gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openReceivablePay(order.id);
                                    }}
                                    disabled={outstanding <= 0 || order.status !== OrderStatus.COMPLETED}
                                    className="flex-1 md:flex-none px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 shadow-sm"
                                  >
                                    <Wallet size={12}/> Thu tiền
                                  </button>
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="md:hidden px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg"
                                  >
                                    {isExpanded ? 'Thu gọn' : 'Chi tiết'}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* === CONTENT ROW: chi tiết khi mở rộng === */}
                            {isExpanded && (
                              <div className="border-t-2 border-indigo-100 bg-gradient-to-br from-white via-indigo-50/30 to-blue-50/30 p-5 space-y-5">
                                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                                  {/* Bên trái: Chi tiết sản phẩm */}
                                  <div className="lg:col-span-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <h5 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
                                        <FileText size={15}/> CHI TIẾT SẢN PHẨM
                                        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                          {order.items.length} SKU • {order.items.reduce((s, i) => s + i.quantity, 0)} SP
                                        </span>
                                      </h5>
                                    </div>
                                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                      <table className="w-full text-left border-collapse">
                                        <thead>
                                          <tr className="bg-gradient-to-r from-slate-100 to-gray-100 text-gray-700 uppercase text-[10px] font-black tracking-wide">
                                            <th className="px-2 py-2 text-center w-10">STT</th>
                                            <th className="px-2 py-2">Tên / Mã sản phẩm</th>
                                            <th className="px-2 py-2 text-center w-14">ĐVT</th>
                                            <th className="px-2 py-2 text-right w-14">SL</th>
                                            <th className="px-2 py-2 text-right w-24">Đơn giá</th>
                                            <th className="px-2 py-2 text-right w-24">Trước CK</th>
                                            <th className="px-2 py-2 text-center w-12">% CK</th>
                                            <th className="px-2 py-2 text-right w-24 text-amber-700">Giảm</th>
                                            <th className="px-2 py-2 text-right w-24 text-indigo-700">Sau CK</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-xs bg-white">
                                          {order.items.map((it, idx) => {
                                            const qty = it.quantity;
                                            const price = it.price || 0;
                                            const pct = Math.max(0, Math.min(100, (it as any).discountPercent ?? 0));
                                            const subTotal = qty * price;
                                            const lineDisc = Math.round(subTotal * (pct / 100));
                                            const lineAfter = subTotal - lineDisc;
                                            return (
                                              <tr key={idx} className="hover:bg-blue-50/40">
                                                <td className="px-2 py-1.5 text-center text-[11px] font-bold text-gray-500">{idx + 1}</td>
                                                <td className="px-2 py-1.5">
                                                  <p className="text-xs font-semibold text-gray-900 leading-snug">{it.name}</p>
                                                  {(it as any).sku && (
                                                    <p className="text-[10px] font-semibold text-indigo-600 font-mono">Mã: {(it as any).sku}</p>
                                                  )}
                                                </td>
                                                <td className="px-2 py-1.5 text-center text-[11px] text-gray-700 font-semibold">
                                                  {it.unit || 'Gói'}
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-xs font-bold text-indigo-700">{qty}</td>
                                                <td className="px-2 py-1.5 text-right text-[11px] text-gray-700 font-semibold">
                                                  {formatMoney(price)}
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-[11px] text-gray-700 font-semibold">
                                                  {formatMoney(subTotal)}
                                                </td>
                                                <td className="px-2 py-1.5 text-center">
                                                  {pct > 0 ? (
                                                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                                      {pct}%
                                                    </span>
                                                  ) : (
                                                    <span className="text-[10px] text-gray-400">—</span>
                                                  )}
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-[11px] font-bold text-amber-700">
                                                  {pct > 0 ? `−${formatMoney(lineDisc)}` : '0'}
                                                </td>
                                                <td className="px-2 py-1.5 text-right text-xs font-black text-indigo-700">
                                                  {formatMoney(lineAfter)}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                        {/* Tổng kết sản phẩm */}
                                        <tfoot className="text-xs bg-slate-50/80">
                                          <tr className="border-t-2 border-gray-200">
                                            <td colSpan={5} className="px-2 py-1.5 text-right font-bold text-gray-700">
                                              ➕ Tổng tiền hàng (SL × Đơn giá):
                                            </td>
                                            <td colSpan={3} className="px-2 py-1.5 text-right font-black text-gray-900 text-[13px]">
                                              {formatMoney(beforeLineDisc)} ₫
                                            </td>
                                            <td></td>
                                          </tr>
                                          {lineDiscTotal > 0 && (
                                            <tr className="bg-amber-50/80 border-t border-amber-200">
                                              <td colSpan={5} className="px-2 py-1.5 text-right font-bold text-amber-700 flex items-center justify-end gap-1.5">
                                                🏷 Chiết khấu theo từng SP:
                                              </td>
                                              <td colSpan={3} className="px-2 py-1.5 text-right font-black text-amber-700">
                                                − {formatMoney(lineDiscTotal)} ₫
                                              </td>
                                              <td></td>
                                            </tr>
                                          )}
                                          <tr className="bg-gray-100/60 border-t border-gray-200">
                                            <td colSpan={5} className="px-2 py-1.5 text-right font-bold text-gray-700">
                                              → Sau CK từng SP:
                                            </td>
                                            <td colSpan={3} className="px-2 py-1.5 text-right font-black text-gray-900">
                                              {formatMoney(afterLineDisc)} ₫
                                            </td>
                                            <td></td>
                                          </tr>
                                          {discPct > 0 && (
                                            <tr className="bg-orange-50/80 border-t border-orange-200">
                                              <td colSpan={5} className="px-2 py-1.5 text-right font-bold text-orange-700 flex items-center justify-end gap-1.5">
                                                🎁 Chiết khấu toàn đơn <span className="font-black">{discPct}%</span>:
                                              </td>
                                              <td colSpan={3} className="px-2 py-1.5 text-right font-black text-orange-700">
                                                − {formatMoney(discAmount)} ₫
                                              </td>
                                              <td></td>
                                            </tr>
                                          )}
                                          <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-indigo-200">
                                            <td colSpan={5} className="px-2 py-2 text-right font-black text-indigo-900 uppercase tracking-wide text-[11px]">
                                              ✅ Tổng tiền sau chiết khấu:
                                            </td>
                                            <td colSpan={3}></td>
                                            <td className="px-2 py-2 text-right font-black text-indigo-700 text-[15px]">
                                              {formatMoney(afterDisc)} ₫
                                            </td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                  </div>

                                  {/* Bên phải: Tình hình thanh toán của đơn */}
                                  <div className="lg:col-span-2 space-y-4">
                                    {/* Thẻ tóm tắt thanh toán */}
                                    <div className={`border-2 rounded-xl p-4 shadow-sm ${
                                      outstanding <= 0
                                        ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50'
                                        : 'border-red-200 bg-gradient-to-br from-red-50 to-amber-50'
                                    }`}>
                                      <h6 className="text-[11px] font-black uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                        <CreditCard size={13}/> TÌNH HÌNH THANH TOÁN ĐƠN
                                      </h6>
                                      <div className="space-y-1.5 text-sm">
                                        <div className="flex justify-between items-center py-1 border-b border-gray-200/70">
                                          <span className="text-gray-600 font-medium">Tổng tiền đơn:</span>
                                          <span className="font-bold text-gray-900">{formatMoney(afterDisc)} ₫</span>
                                        </div>
                                        <div className="flex justify-between items-center py-1 border-b border-gray-200/70">
                                          <span className="text-green-700 font-bold flex items-center gap-1">
                                            <CheckCircle size={13}/> Đã thanh toán:
                                          </span>
                                          <span className="font-black text-green-700">{formatMoney(paid)} ₫</span>
                                        </div>
                                        <div className={`flex justify-between items-center pt-1.5`}>
                                          <span className={`font-black uppercase tracking-wide text-[11px] flex items-center gap-1 ${outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                            {outstanding > 0 ? <Clock size={13}/> : <CheckCircle size={13}/>}
                                            {outstanding > 0 ? 'CÒN NỢ:' : 'ĐÃ THANH TOÁN ĐỦ:'}
                                          </span>
                                          <span className={`font-black text-lg ${outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                            {formatMoney(outstanding)} ₫
                                          </span>
                                        </div>
                                        {afterDisc > 0 && (
                                          <div className="mt-2">
                                            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                                              <div
                                                className={`h-full rounded-full transition-all ${
                                                  paid >= afterDisc ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                                                }`}
                                                style={{ width: `${Math.min(100, Math.round((paid / afterDisc) * 100))}%` }}
                                              />
                                            </div>
                                            <p className="text-[10px] text-gray-600 mt-1 text-right font-semibold">
                                              {paid >= afterDisc ? '✓ 100%' : `Đã trả ${Math.round((paid / afterDisc) * 100)}%`}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Lịch sử thanh toán của đơn này */}
                                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-3 py-2 border-b border-green-200 flex items-center justify-between">
                                        <h6 className="text-[11px] font-black uppercase tracking-wide text-green-900 flex items-center gap-1.5">
                                          <ArrowDownCircle size={13}/> LỊCH SỬ THU TIỀN ĐƠN NÀY
                                        </h6>
                                        <span className="text-[10px] font-bold text-green-700 bg-white px-2 py-0.5 rounded-full border border-green-200">
                                          {orderPayments.length} lần
                                        </span>
                                      </div>
                                      <div className="max-h-[260px] overflow-y-auto">
                                        {orderPayments.length === 0 ? (
                                          <div className="py-8 text-center text-gray-400 text-xs">
                                            Chưa có khoản thu nào cho đơn này
                                          </div>
                                        ) : (
                                          <div className="divide-y divide-gray-100">
                                            {orderPayments.map((p) => (
                                              <div key={p.id} className="px-3 py-2.5 hover:bg-green-50/40">
                                                <div className="flex justify-between items-start gap-2">
                                                  <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-black text-green-700">
                                                      + {formatMoney(p.amount)} ₫
                                                    </p>
                                                    <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1.5">
                                                      <Clock size={10}/>
                                                      {new Date(p.createdAt).toLocaleString('vi-VN')}
                                                    </p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                        {methodLabel(p.method)}
                                                      </span>
                                                      {p.isGap && (
                                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                                          Cập nhật
                                                        </span>
                                                      )}
                                                    </div>
                                                    {p.note && (
                                                      <p className="text-[10px] text-gray-500 italic mt-1">Ghi chú: {p.note}</p>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ==================== TAB 3: CÔNG NỢ ==================== */}
                {customerDetailTab === 'debt' && (
                  <div className="space-y-5">
                    {/* Số liệu công nợ tổng hợp */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">Công nợ đầu kỳ</p>
                        <p className="text-xl font-black text-slate-800 mt-1">{formatMoney(customerLedger.opening)} ₫</p>
                      </div>
                      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-bold uppercase text-blue-600 tracking-wide">Công nợ phát sinh</p>
                        <p className="text-xl font-black text-blue-700 mt-1">{formatMoney(customerLedger.incurred)} ₫</p>
                      </div>
                      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-bold uppercase text-green-600 tracking-wide">Đã thu tiền</p>
                        <p className="text-xl font-black text-green-700 mt-1">{formatMoney(customerLedger.collected)} ₫</p>
                      </div>
                      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 text-center">
                        <p className="text-[10px] font-bold uppercase text-amber-700 tracking-wide">Tổng SP Đã mua</p>
                        <p className="text-xl font-black text-amber-800 mt-1">
                          {selectedCustomerOrders.reduce((s, o) => s + o.items.reduce((x, i) => x + i.quantity, 0), 0)}
                        </p>
                      </div>
                      <div className={`rounded-xl p-4 text-center shadow ${
                        customerLedger.balance > 0
                          ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white'
                          : 'bg-gradient-to-br from-emerald-500 to-green-700 text-white'
                      }`}>
                        <p className="text-[10px] font-bold uppercase tracking-wide opacity-90">CÔNG NỢ CÒN LẠI</p>
                        <p className="text-2xl font-black mt-1">{formatMoney(customerLedger.balance)} ₫</p>
                      </div>
                    </div>

                    {/* Lịch sử thu tiền */}
                    <div>
                      <h4 className="text-sm font-black text-gray-900 mb-2 flex items-center gap-1.5"><ArrowDownCircle size={15}/> LỊCH SỬ THU TIỀN CỦA KHÁCH</h4>
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-green-50 text-green-800 uppercase text-[11px] font-bold">
                            <tr>
                              <th className="px-4 py-2.5">Ngày giờ</th>
                              <th className="px-4 py-2.5">Đơn hàng</th>
                              <th className="px-4 py-2.5">Phương thức</th>
                              <th className="px-4 py-2.5 text-right">Số tiền thu</th>
                              <th className="px-4 py-2.5">Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-sm">
                            {customerPayments.map((p) => (
                              <tr key={p.id} className="hover:bg-green-50/40">
                                <td className="px-4 py-2.5 text-xs text-gray-600">{new Date(p.createdAt).toLocaleString('vi-VN')}</td>
                                <td className="px-4 py-2.5">
                                  {p.orderId
                                    ? <span className="font-mono text-xs font-bold text-indigo-700">{p.orderId}</span>
                                    : <span className="text-gray-400 text-xs">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-xs">{methodLabel(p.method)}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <span className="font-bold text-green-700">+ {formatMoney(p.amount)} ₫</span>
                                  {p.isGap && <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">(Cập nhật)</span>}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-500">{p.note || '—'}</td>
                              </tr>
                            ))}
                            {customerPayments.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Chưa có lịch sử thu tiền.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sổ cái công nợ chi tiết theo thời gian */}
                    <div>
                      <h4 className="text-sm font-black text-gray-900 mb-2 flex items-center gap-1.5"><CreditCard size={15}/> SỔ CÁI CÔNG NỢ (MỚI NHẤT → CŨ NHẤT)</h4>
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-indigo-50 text-indigo-900 uppercase text-[11px] font-bold">
                            <tr>
                              <th className="px-4 py-2.5 w-[140px]">Ngày giờ</th>
                              <th className="px-4 py-2.5">Nội dung</th>
                              <th className="px-4 py-2.5 text-right w-[130px]">Phát sinh (+)</th>
                              <th className="px-4 py-2.5 text-right w-[130px]">Đã thu (−)</th>
                              <th className="px-4 py-2.5 text-right w-[140px]">Công nợ còn lại</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-sm">
                            {customerLedger.rows.map((r, idx) => (
                              <tr key={idx} className="hover:bg-indigo-50/20">
                                <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{new Date(r.date).toLocaleString('vi-VN')}</td>
                                <td className="px-4 py-2.5">
                                  {r.kind === 'order' ? (
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
                                        <ArrowUpCircle size={14}/>
                                      </span>
                                      <span>
                                        <span className="font-bold text-indigo-700 font-mono">{r.refId}</span>
                                        <span className="text-gray-700"> • {r.note}</span>
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 flex-shrink-0">
                                        <ArrowDownCircle size={14}/>
                                      </span>
                                      <span>
                                        {r.refId && <span className="font-bold text-indigo-700 font-mono mr-1">{r.refId}</span>}
                                        <span className="text-gray-700">{r.note}</span>
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {r.incurred > 0 ? <span className="font-bold text-blue-700">+ {formatMoney(r.incurred)} ₫</span> : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {r.collected > 0 ? <span className="font-bold text-green-700">− {formatMoney(r.collected)} ₫</span> : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <span className={`font-black ${r.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>{formatMoney(r.balance)} ₫</span>
                                </td>
                              </tr>
                            ))}
                            {customerLedger.rows.length === 0 && (
                              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Chưa có giao dịch nào.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ==================== TAB 4: LỊCH SỬ GIAO DỊCH ==================== */}
                {customerDetailTab === 'history' && (
                  <div className="space-y-4">
                    {/* Bộ lọc tìm kiếm & ngày */}
                    <div className="flex flex-col md:flex-row md:items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15}/>
                        <input
                          placeholder="Tìm kiếm mã đơn, nội dung giao dịch..."
                          value={custTxnSearch}
                          onChange={(e) => setCustTxnSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Calendar size={13}/> Từ
                      </div>
                      <input
                        type="date"
                        value={custDateFrom}
                        onChange={(e) => setCustDateFrom(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <div className="flex items-center gap-1 text-xs text-gray-600">Đến</div>
                      <input
                        type="date"
                        value={custDateTo}
                        onChange={(e) => setCustDateTo(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <button
                        onClick={() => { setCustTxnSearch(''); setCustDateFrom(''); setCustDateTo(''); }}
                        className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100"
                      >
                        Đặt lại
                      </button>
                    </div>

                    {/* Timeline giao dịch */}
                    <div className="relative pl-6">
                      <div className="absolute left-2.5 top-1.5 bottom-1.5 w-0.5 bg-gradient-to-b from-indigo-300 via-purple-300 to-green-300" />
                      {customerAllTxns.map((txn, idx) => (
                        <div key={idx} className="relative pb-5 last:pb-0">
                          <div className={`absolute -left-[22px] top-1 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-white shadow-md ${
                            txn.kind === 'order'
                              ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                              : 'bg-gradient-to-br from-green-500 to-emerald-600'
                          }`}>
                            {txn.kind === 'order' ? <FileText size={10} className="text-white"/> : <Banknote size={10} className="text-white"/>}
                          </div>
                          <div className={`border rounded-xl p-4 ml-2 hover:shadow-md transition-all ${
                            txn.kind === 'order' ? 'border-blue-200 bg-blue-50/50' : 'border-green-200 bg-green-50/50'
                          }`}>
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {txn.kind === 'order' ? (
                                    <p className="text-sm font-black text-blue-900">{txn.title}</p>
                                  ) : (
                                    <p className="text-sm font-black text-green-900">{txn.title}</p>
                                  )}
                                  {txn.kind === 'order' && txn.orderStatus && orderStatusBadge(txn.orderStatus)}
                                  {txn.kind === 'payment' && txn.isGap && (
                                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">Cập nhật</span>
                                  )}
                                  {txn.kind === 'payment' && (
                                    <span className="text-[11px] font-bold text-green-800 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">{methodLabel(txn.method)}</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                                  <Clock size={11}/>{new Date(txn.date).toLocaleString('vi-VN')}
                                  {txn.kind === 'order' && txn.refId && <> • <span className="font-mono font-semibold text-indigo-700">{txn.refId}</span></>}
                                </p>
                                {txn.sub && <p className="text-xs text-gray-600 mt-1.5">{txn.sub}</p>}
                              </div>
                              <div className="md:text-right shrink-0">
                                {txn.kind === 'order' ? (
                                  <div className="space-y-0.5 text-xs">
                                    <div className="flex justify-between md:justify-end gap-3">
                                      <span className="text-gray-500">Số tiền đơn:</span>
                                      <span className="font-bold text-gray-800">{formatMoney(txn.amount)} ₫</span>
                                    </div>
                                    <div className="flex justify-between md:justify-end gap-3">
                                      <span className="text-green-600">Đã trả:</span>
                                      <span className="font-bold text-green-700">{formatMoney(txn.paid)} ₫</span>
                                    </div>
                                    <div className="flex justify-between md:justify-end gap-3 pt-0.5 border-t border-gray-200/70 mt-1">
                                      <span className={`font-bold ${txn.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>Còn nợ:</span>
                                      <span className={`font-black ${txn.outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>{formatMoney(txn.outstanding)} ₫</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase text-green-600 tracking-wide text-right">Số tiền thu</p>
                                    <p className="text-lg font-black text-green-700 leading-tight">+ {formatMoney(txn.paid)} ₫</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {customerAllTxns.length === 0 && (
                        <div className="px-4 py-10 text-center text-gray-400 text-sm">Không có giao dịch nào phù hợp.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
