import React, { useEffect, useState, useMemo } from 'react';
import { MockBackend } from '../services/mockBackend';
import { DebtService } from '../services/debtService';
import {
  ReturnRecord,
  ReturnStatus,
  RefundMethod,
  Product,
  Order,
  OrderStatus,
  PaymentRecord,
} from '../types';
import {
  RotateCcw,
  Plus,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Trash2,
  Phone,
  Calendar,
  FileText,
  AlertCircle,
  Save,
  PlayCircle,
  Pencil,
  History,
  Printer,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { NumberInput } from '../components/NumberInput';

const STATUS_LABEL: Record<ReturnStatus, string> = {
  pending: 'Chờ xử lý',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  cash: 'Tiền mặt',
  bank: 'Chuyển khoản',
  wallet: 'Ví điện tử',
  credit: 'Giảm trừ công nợ',
  other: 'Khác',
};

const formatMoney = (n: number) => Math.round(n || 0).toLocaleString('vi-VN');

const escapeHtml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleDateString('vi-VN') +
    ' ' +
    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  );
};

const toDateTimeLocal = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
};

const statusBadge = (s: ReturnStatus) => {
  if (s === 'completed')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-md border border-green-200">
        <CheckCircle size={11} /> {STATUS_LABEL.completed}
      </span>
    );
  if (s === 'cancelled')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-md border border-red-200">
        <XCircle size={11} /> {STATUS_LABEL.cancelled}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
      <Clock size={11} /> {STATUS_LABEL.pending}
    </span>
  );
};

const refundBadge = (r: ReturnRecord) => {
  if (r.status === 'cancelled') return <span className="text-xs text-gray-400">—</span>;
  if (r.refunded)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200">
        <CheckCircle size={11} /> Đã hoàn
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md border border-orange-200">
      <Clock size={11} /> Còn phải hoàn
    </span>
  );
};

interface FormItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  maxQuantity: number;
}

export const Returns: React.FC = () => {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReturnStatus>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // --- Modal tạo/sửa phiếu ---
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReturnRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [formOrderId, setFormOrderId] = useState('');
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [formReason, setFormReason] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formStatus, setFormStatus] = useState<ReturnStatus>('completed');
  const [formRefundMethod, setFormRefundMethod] = useState<RefundMethod>('cash');
  const [formRefunded, setFormRefunded] = useState(false);
  const [formDate, setFormDate] = useState(toDateTimeLocal());

  // --- Chi tiết / lịch sử ---
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ReturnRecord | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [r, p, o, pay] = await Promise.all([
        MockBackend.getReturns(),
        MockBackend.getProducts(),
        MockBackend.getOrders(),
        MockBackend.getPayments(),
      ]);
      setReturns(Array.isArray(r) ? r : []);
      setProducts(Array.isArray(p) ? p : []);
      setOrders(Array.isArray(o) ? o : []);
      setPayments(Array.isArray(pay) ? pay : []);
    } catch (e) {
      console.error('Failed to load returns:', e);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  // Số lượng đã trả cho từng SP của từng đơn (bỏ qua phiếu đã hủy / phiếu đang sửa)
  const returnedQtyByOrder = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of returns) {
      if (r.status === 'cancelled') continue;
      if (editing && r.id === editing.id) continue;
      let byProduct = map.get(r.orderId);
      if (!byProduct) {
        byProduct = new Map();
        map.set(r.orderId, byProduct);
      }
      for (const it of r.items) {
        byProduct.set(it.productId, (byProduct.get(it.productId) || 0) + it.quantity);
      }
    }
    return map;
  }, [returns, editing]);

  const returnedValueByOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of returns) {
      if (r.status === 'cancelled') continue;
      if (editing && r.id === editing.id) continue;
      map.set(r.orderId, (map.get(r.orderId) || 0) + r.totalAmount);
    }
    return map;
  }, [returns, editing]);

  // --- Thống kê tổng quan ---
  const summary = useMemo(() => {
    const active = returns.filter((r) => r.status !== 'cancelled');
    const totalValue = active.reduce((s, r) => s + r.totalAmount, 0);
    const refundedValue = active.filter((r) => r.refunded).reduce((s, r) => s + r.totalAmount, 0);
    const pendingRefund = active.filter((r) => !r.refunded).reduce((s, r) => s + r.totalAmount, 0);
    return { count: returns.length, totalValue, refundedValue, pendingRefund };
  }, [returns]);

  // --- Lọc danh sách ---
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
    return returns.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      const t = new Date(r.createdAt).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      if (!s) return true;
      return (
        r.id.toLowerCase().includes(s) ||
        (r.customerName || '').toLowerCase().includes(s) ||
        (r.customerPhone || '').includes(s) ||
        r.orderId.toLowerCase().includes(s) ||
        r.reason.toLowerCase().includes(s) ||
        r.items.some((it) => it.name.toLowerCase().includes(s) || (it.sku || '').toLowerCase().includes(s))
      );
    });
  }, [returns, search, statusFilter, dateFrom, dateTo]);

  const formTotal = useMemo(
    () => formItems.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0),
    [formItems],
  );

  const selectedOrder = useMemo(() => orderById.get(formOrderId), [orderById, formOrderId]);

  const selectedOrderDebt = useMemo(() => {
    if (!selectedOrder) return null;
    const paid = DebtService.computePaidForOrder(selectedOrder, payments);
    const alreadyReturned = returnedValueByOrder.get(selectedOrder.id) || 0;
    return {
      total: selectedOrder.totalAmount,
      paid,
      outstanding: Math.max(0, selectedOrder.totalAmount - paid),
      overpaid: Math.max(0, paid - selectedOrder.totalAmount),
      alreadyReturned,
      remaining: Math.max(0, selectedOrder.totalAmount - alreadyReturned),
    };
  }, [selectedOrder, payments, returnedValueByOrder]);

  // --- Xây dựng danh sách SP từ đơn hàng ---
  const buildItemsFromOrder = (order: Order, keepExisting?: FormItem[]) => {
    const byProduct = returnedQtyByOrder.get(order.id) || new Map<string, number>();
    const orderedQty = new Map<string, number>();
    for (const it of order.items || []) {
      orderedQty.set(it.productId, (orderedQty.get(it.productId) || 0) + it.quantity);
    }
    const items: FormItem[] = [];
    const merged = new Map<string, { name: string; sku: string; price: number; qty: number }>();
    for (const it of order.items || []) {
      const product = products.find((p) => p.id === it.productId);
      const sku = product?.sku || '';
      const name = it.name || product?.name || '';
      const prev = merged.get(it.productId);
      if (prev) prev.qty += it.quantity;
      else merged.set(it.productId, { name, sku, price: it.price, qty: it.quantity });
    }
    for (const [productId, info] of merged.entries()) {
      const remaining = Math.max(0, info.qty - (byProduct.get(productId) || 0));
      const existing = keepExisting?.find((e) => e.productId === productId);
      items.push({
        productId,
        sku: info.sku,
        name: info.name,
        quantity: existing ? Math.min(existing.quantity, remaining) : remaining,
        unitPrice: existing ? existing.unitPrice : info.price,
        maxQuantity: remaining,
      });
    }
    return items;
  };

  const openCreate = () => {
    setEditing(null);
    setFormOrderId('');
    setFormItems([]);
    setFormReason('');
    setFormNote('');
    setFormStatus('completed');
    setFormRefundMethod('cash');
    setFormRefunded(false);
    setFormDate(toDateTimeLocal());
    setFormOpen(true);
  };

  const openEdit = (record: ReturnRecord) => {
    setEditing(record);
    setFormOrderId(record.orderId);
    setFormReason(record.reason);
    setFormNote(record.note || '');
    setFormStatus(record.status);
    setFormRefundMethod(record.refundMethod || 'cash');
    setFormRefunded(!!record.refunded);
    setFormDate(toDateTimeLocal(record.createdAt));
    const order = orderById.get(record.orderId);
    if (order) {
      const built = buildItemsFromOrder(
        order,
        record.items.map((it) => ({
          productId: it.productId,
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          maxQuantity: it.quantity,
        })),
      );
      setFormItems(built);
    } else {
      setFormItems(
        record.items.map((it) => ({
          productId: it.productId,
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          maxQuantity: it.quantity,
        })),
      );
    }
    setDetailOpen(false);
    setFormOpen(true);
  };

  const handleOrderChange = (orderId: string) => {
    setFormOrderId(orderId);
    const order = orderById.get(orderId);
    if (!order) {
      setFormItems([]);
      return;
    }
    setFormItems(buildItemsFromOrder(order, editing && editing.orderId === orderId ? formItems : undefined));
  };

  const updateFormItem = (productId: string, patch: Partial<FormItem>) => {
    setFormItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, ...patch } : it)));
  };

  const removeFormItem = (productId: string) => {
    setFormItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  const handleSubmit = async () => {
    if (!formOrderId) {
      alert('Vui lòng chọn đơn hàng cần trả');
      return;
    }
    const items = formItems.filter((it) => it.quantity > 0);
    if (items.length === 0) {
      alert('Vui lòng chọn ít nhất một sản phẩm với số lượng lớn hơn 0');
      return;
    }
    if (!formReason.trim()) {
      alert('Vui lòng nhập lý do trả hàng');
      return;
    }

    const payload = {
      orderId: formOrderId,
      items: items.map((it) => ({ productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice })),
      reason: formReason.trim(),
      status: formStatus,
      refundMethod: formRefundMethod,
      refunded: formRefunded,
      note: formNote.trim() || undefined,
      createdAt: formDate ? new Date(formDate).toISOString() : undefined,
    };

    setSaving(true);
    try {
      if (editing) {
        await MockBackend.updateReturn(editing.id, payload);
        showNotice(`Đã cập nhật phiếu trả ${editing.id}`);
      } else {
        const created = await MockBackend.createReturn(payload);
        showNotice(`Đã tạo phiếu trả ${created.id}`);
      }
      setFormOpen(false);
      setEditing(null);
      await load({ silent: true });
    } catch (e: any) {
      alert(e?.message || 'Không thể lưu phiếu trả');
    } finally {
      setSaving(false);
    }
  };

  const handleProcess = async (record: ReturnRecord) => {
    if (!confirm(`Hoàn tất phiếu trả ${record.id}? Giá trị hàng trả sẽ được ghi giảm vào công nợ khách hàng.`))
      return;
    setBusyId(record.id);
    try {
      await MockBackend.updateReturnStatus(record.id, 'completed');
      await load({ silent: true });
      setDetailOpen(false);
      showNotice('Đã hoàn tất phiếu trả và ghi giảm công nợ');
    } catch (e: any) {
      alert(e?.message || 'Không thể cập nhật phiếu trả');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelReturn = async (record: ReturnRecord) => {
    const reason = prompt('Nhập lý do hủy phiếu trả:') || undefined;
    setBusyId(record.id);
    try {
      await MockBackend.updateReturnStatus(record.id, 'cancelled', reason);
      await load({ silent: true });
      setDetailOpen(false);
      showNotice('Đã hủy phiếu trả và hoàn tác công nợ');
    } catch (e: any) {
      alert(e?.message || 'Không thể hủy phiếu trả');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (record: ReturnRecord) => {
    if (!confirm(`Xóa phiếu trả ${record.id}? Bút toán công nợ liên quan cũng sẽ được gỡ bỏ.`)) return;
    setBusyId(record.id);
    try {
      await MockBackend.deleteReturn(record.id);
      await load({ silent: true });
      setDetailOpen(false);
      showNotice('Đã xóa phiếu trả');
    } catch (e: any) {
      alert(e?.message || 'Không thể xóa phiếu trả');
    } finally {
      setBusyId(null);
    }
  };

  const openDetail = (record: ReturnRecord) => {
    setDetail(record);
    setDetailOpen(true);
  };

  // In Phiếu trả hàng — tái sử dụng thông tin công ty, CSS và cơ chế in của Phiếu xuất kho.
  const printReturn = (record: ReturnRecord) => {
    const created = new Date(record.createdAt);
    const day = String(created.getDate()).padStart(2, '0');
    const month = String(created.getMonth() + 1).padStart(2, '0');
    const year = String(created.getFullYear());

    const order = orderById.get(record.orderId);

    const itemRows = record.items
      .map((it, idx) => {
        const unit = order?.items.find((oi) => oi.productId === it.productId)?.unit || 'Gói';
        return `
          <tr>
            <td class="c">${idx + 1}</td>
            <td>${escapeHtml(it.sku || '')}</td>
            <td></td>
            <td>${escapeHtml(it.name)}</td>
            <td class="c">${escapeHtml(unit)}</td>
            <td class="c">${it.quantity}</td>
          </tr>
        `;
      })
      .join('');

    const totalQty = record.items.reduce((s, it) => s + (it.quantity || 0), 0);

    const html = `<!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8" />
        <title>Phiếu trả hàng ${escapeHtml(record.id)}</title>
        <style>
          @page { size: A4 portrait; margin: 7mm 8mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #111;
            font-family: "Times New Roman", Times, serif;
            background: #fff;
          }
          .sheet { padding: 4px 4px 8px; min-height: 0; width: 100%; }
          .company { text-align: center; line-height: 1.35; }
          .company .name { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2px; }
          .company .tag { font-size: 12px; font-weight: 700; text-transform: uppercase; margin-top: 1px; }
          .company .addr { font-size: 11.5px; margin-top: 2px; }
          hr.line { border: 0; border-top: 1.5px solid #111; margin: 8px 0 10px; }
          .doc-title { text-align: center; font-size: 21px; font-weight: 700; letter-spacing: 0.6px; margin: 0; }
          .doc-date { text-align: center; font-size: 12.5px; margin: 3px 0 4px; }
          .meta-id { text-align: center; font-size: 11.5px; color: #444; margin-bottom: 8px; }
          .info { font-size: 13px; line-height: 1.75; margin-bottom: 8px; }
          table.grid {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            page-break-inside: auto;
          }
          table.grid th, table.grid td {
            border: 1px solid #111;
            padding: 3px 3px;
            font-size: 11px;
            vertical-align: middle;
          }
          table.grid thead { display: table-header-group; }
          table.grid tr { page-break-inside: avoid; page-break-after: auto; }
          table.grid th { font-weight: 700; text-align: center; background: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .c { text-align: center; }
          .sum-row td { background: #f5f5f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; border-top: 1px solid #111; font-weight: 700; }
          .sum-label { text-align: right; font-weight: 700; padding-right: 8px; }
          .signs { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; margin-top: 16px; text-align: center; gap: 4px; }
          .signs .role { font-size: 12.5px; font-weight: 700; }
          .signs .hint { font-size: 11px; font-style: italic; margin-top: 2px; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .sheet { min-height: auto; padding: 0; }
            @page { size: A4 portrait; margin: 7mm 8mm; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="company">
            <div class="name">CÔNG TY TNHH THƯƠNG MẠI VÀ DỊCH VỤ XỔ VIỆT</div>
            <div class="tag">CHUYÊN BÁN BUÔN - BÁN LẺ HÀNG THỰC PHẨM - MỸ PHẨM NGA - RUS</div>
            <div class="addr">Số 11, ngách 15, ngõ 158 Nguyễn Sơn, P. Bồ Đề, Q. Long Biên, Hà Nội - ĐT: 0981795469-0983272285</div>
          </div>
          <hr class="line" />
          <h1 class="doc-title">PHIẾU TRẢ HÀNG</h1>
          <div class="doc-date">Ngày ${day} tháng ${month} năm ${year}</div>
          <div class="meta-id">Số phiếu: <strong>${escapeHtml(record.id)}</strong></div>
          <div class="info">
            <div>Đối tượng nhận hàng: <strong>${escapeHtml(record.customerName || 'Khách lẻ')}</strong></div>
            <div>Điện thoại: ${escapeHtml(record.customerPhone || '')}</div>
            <div>Người giao hàng: ......................................................</div>
            <div>Nội dung diễn giải: ${escapeHtml(record.reason || '')}</div>
          </div>
          <table class="grid">
            <colgroup>
              <col style="width:6%" />
              <col style="width:14%" />
              <col style="width:16%" />
              <col style="width:40%" />
              <col style="width:12%" />
              <col style="width:12%" />
            </colgroup>
            <thead>
              <tr>
                <th>STT</th>
                <th>Mã SKU</th>
                <th>Mã vạch</th>
                <th>Tên hàng hóa</th>
                <th>ĐVT</th>
                <th>Số lượng</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
              <tr class="sum-row">
                <td colspan="5" class="sum-label">Tổng số lượng hàng trả:</td>
                <td class="c" style="font-size:12px;">${totalQty}</td>
              </tr>
            </tbody>
          </table>
          <div class="signs">
            <div>
              <div class="role">Người lập phiếu</div>
              <div class="hint">(Ký, họ tên)</div>
            </div>
            <div>
              <div class="role">Người giao hàng</div>
              <div class="hint">(Ký, họ tên)</div>
            </div>
            <div>
              <div class="role">Thủ kho</div>
              <div class="hint">(Ký, họ tên)</div>
            </div>
            <div>
              <div class="role">Kế toán trưởng</div>
              <div class="hint">(Ký, họ tên)</div>
            </div>
            <div>
              <div class="role">Giám đốc</div>
              <div class="hint">(Ký, họ tên)</div>
            </div>
          </div>
        </div>
      </body>
      </html>`;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 800);
    };

    iframe.onload = triggerPrint;
    setTimeout(triggerPrint, 250);
  };

  const customerHistory = useMemo(() => {
    if (!historyCustomer) return [];
    return returns
      .filter((r) => (r.customerName || 'Khách lẻ') === historyCustomer)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [returns, historyCustomer]);

  const historySummary = useMemo(() => {
    const active = customerHistory.filter((r) => r.status !== 'cancelled');
    return {
      count: customerHistory.length,
      total: active.reduce((s, r) => s + r.totalAmount, 0),
      refunded: active.filter((r) => r.refunded).reduce((s, r) => s + r.totalAmount, 0),
      pending: active.filter((r) => !r.refunded).reduce((s, r) => s + r.totalAmount, 0),
    };
  }, [customerHistory]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded shadow">
          {notice}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <RotateCcw className="text-indigo-600" size={24} /> Hàng Trả Lại
          </h2>
          <p className="text-gray-500 text-sm">
            Quản lý phiếu khách trả hàng — tự động ghi giảm công nợ, không thay đổi tồn kho
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-700 hover:shadow-md transition font-bold whitespace-nowrap"
        >
          <Plus size={18} /> Tạo phiếu trả
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded p-4">
          <p className="text-xs text-gray-500">Tổng phiếu trả</p>
          <p className="text-xl font-bold text-gray-800">{summary.count}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded p-4">
          <p className="text-xs text-gray-500">Tổng giá trị hàng trả</p>
          <p className="text-xl font-bold text-indigo-700">{formatMoney(summary.totalValue)} ₫</p>
        </div>
        <div className="bg-white border border-gray-200 rounded p-4">
          <p className="text-xs text-gray-500">Đã hoàn lại</p>
          <p className="text-xl font-bold text-emerald-700">{formatMoney(summary.refundedValue)} ₫</p>
        </div>
        <div className="bg-white border border-gray-200 rounded p-4">
          <p className="text-xs text-gray-500">Còn phải hoàn</p>
          <p className="text-xl font-bold text-orange-600">{formatMoney(summary.pendingRefund)} ₫</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            placeholder="Tìm theo mã phiếu, khách hàng, SĐT, đơn hàng, sản phẩm, lý do..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 border border-gray-300 rounded-lg"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ xử lý</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã hủy</option>
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="px-3 py-2 border border-gray-300 rounded-lg"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-gray-400">→</span>
          <input
            type="date"
            className="px-3 py-2 border border-gray-300 rounded-lg"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center justify-between">
          <p className="text-sm font-bold text-indigo-900 flex items-center gap-2">
            <RotateCcw size={16} /> DANH SÁCH PHIẾU TRẢ HÀNG
          </p>
          <p className="text-xs text-indigo-700/80">{filtered.length} phiếu</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Mã phiếu</th>
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Đơn hàng</th>
                <th className="px-6 py-4 text-center">Số SP</th>
                <th className="px-6 py-4 text-right">Giá trị trả</th>
                <th className="px-6 py-4">Lý do</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Hoàn tiền</th>
                <th className="px-6 py-4">Ngày trả</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => {
                const totalQty = r.items.reduce((s, it) => s + it.quantity, 0);
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                    onClick={() => openDetail(r)}
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-gray-800">{r.id}</p>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        className="flex items-center gap-3 text-left group"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryCustomer(r.customerName || 'Khách lẻ');
                        }}
                        title="Xem lịch sử trả hàng của khách"
                      >
                        <div className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-sm shadow-sm bg-gradient-to-br from-indigo-500 to-purple-500">
                          {(r.customerName || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate group-hover:text-indigo-700 flex items-center gap-1">
                            {r.customerName || 'Khách lẻ'} <History size={12} />
                          </p>
                          {r.customerPhone && (
                            <p className="text-xs text-gray-500 flex items-center gap-1.5">
                              <Phone size={11} /> {r.customerPhone}
                            </p>
                          )}
                        </div>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1 font-semibold text-gray-700">
                        <FileText size={12} /> {r.orderId}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center min-w-[36px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 text-sm font-black border border-indigo-200">
                        {totalQty}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-black text-gray-800">
                      {formatMoney(r.totalAmount)} ₫
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="px-6 py-4">{statusBadge(r.status)}</td>
                    <td className="px-6 py-4">{refundBadge(r)}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">{formatDate(r.createdAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(r);
                          }}
                          title="Xem chi tiết"
                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            printReturn(r);
                          }}
                          title="In phiếu trả hàng"
                          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(r);
                          }}
                          title="Sửa phiếu"
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Pencil size={16} />
                        </button>
                        {r.status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProcess(r);
                            }}
                            disabled={busyId === r.id}
                            title="Hoàn tất phiếu trả"
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition disabled:opacity-50"
                          >
                            {busyId === r.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <PlayCircle size={16} />
                            )}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(r);
                          }}
                          disabled={busyId === r.id}
                          title="Xóa phiếu"
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                        >
                          {busyId === r.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center text-gray-400">
                    <RotateCcw size={36} className="mx-auto mb-3 text-gray-300" />
                    Chưa có phiếu trả hàng nào phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Modal tạo/sửa phiếu trả ===== */}
      <Modal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? `Sửa phiếu trả ${editing.id}` : 'Tạo phiếu trả hàng'}
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Đơn hàng cần trả <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              value={formOrderId}
              onChange={(e) => handleOrderChange(e.target.value)}
            >
              <option value="">-- Chọn đơn hàng --</option>
              {orders
                .filter((o) => o.status !== OrderStatus.CANCELLED)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} • {o.customerName || 'Khách lẻ'} • {formatMoney(o.totalAmount)} ₫
                  </option>
                ))}
            </select>
            {orders.filter((o) => o.status !== OrderStatus.CANCELLED).length === 0 && (
              <p className="text-xs text-amber-600 mt-1.5">Chưa có đơn hàng nào để tạo phiếu trả.</p>
            )}
          </div>

          {selectedOrderDebt && (
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Tổng đơn</p>
                <p className="font-bold text-gray-800">{formatMoney(selectedOrderDebt.total)} ₫</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Đã thanh toán</p>
                <p className="font-bold text-emerald-700">{formatMoney(selectedOrderDebt.paid)} ₫</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Còn nợ</p>
                <p className="font-bold text-orange-600">{formatMoney(selectedOrderDebt.outstanding)} ₫</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Đã trả trước đó</p>
                <p className="font-bold text-gray-800">{formatMoney(selectedOrderDebt.alreadyReturned)} ₫</p>
              </div>
              <div className="col-span-2 md:col-span-4 flex items-start gap-1.5 text-xs text-indigo-800">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                {selectedOrderDebt.outstanding > 0
                  ? 'Đơn còn nợ: giá trị hàng trả sẽ được trừ trực tiếp vào số tiền khách còn nợ.'
                  : 'Đơn đã thanh toán đủ: giá trị hàng trả được ghi nhận là khoản cần hoàn lại cho khách.'}
              </div>
            </div>
          )}

          {formItems.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Hàng hóa trả lại</label>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] font-semibold">
                    <tr>
                      <th className="px-3 py-2">Sản phẩm</th>
                      <th className="px-3 py-2 w-28 text-center">SL trả</th>
                      <th className="px-3 py-2 w-32 text-right">Đơn giá</th>
                      <th className="px-3 py-2 w-28 text-right">Thành tiền</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {formItems.map((it) => (
                      <tr key={it.productId}>
                        <td className="px-3 py-2">
                          <p className="text-sm font-semibold text-gray-800">{it.name}</p>
                          <p className="text-xs text-gray-400">
                            SKU: {it.sku} • Còn có thể trả: {it.maxQuantity}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <NumberInput
                            value={it.quantity}
                            onChange={(v) =>
                              updateFormItem(it.productId, {
                                quantity: Math.max(0, Math.min(v, it.maxQuantity)),
                              })
                            }
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-center text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NumberInput
                            value={it.unitPrice}
                            onChange={(v) => updateFormItem(it.productId, { unitPrice: v })}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-right text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-gray-800">
                          {formatMoney(it.quantity * it.unitPrice)} ₫
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeFormItem(it.productId)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Bỏ sản phẩm"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-2">
                <p className="text-sm text-gray-600">
                  Tổng giá trị hàng trả:{' '}
                  <span className="text-lg font-black text-indigo-700">{formatMoney(formTotal)} ₫</span>
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Lý do trả hàng <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="VD: Hàng lỗi, giao sai mẫu..."
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Ngày trả hàng</label>
              <input
                type="datetime-local"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Trạng thái xử lý</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as ReturnStatus)}
              >
                <option value="completed">Hoàn thành (ghi giảm công nợ ngay)</option>
                <option value="pending">Chờ xử lý</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Hình thức hoàn tiền</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={formRefundMethod}
                onChange={(e) => setFormRefundMethod(e.target.value as RefundMethod)}
              >
                <option value="cash">Tiền mặt</option>
                <option value="bank">Chuyển khoản</option>
                <option value="wallet">Ví điện tử</option>
                <option value="credit">Giảm trừ công nợ</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg w-full cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-indigo-600"
                  checked={formRefunded}
                  onChange={(e) => setFormRefunded(e.target.checked)}
                />
                <span className="text-sm text-gray-700">Đã hoàn tiền cho khách</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Ghi chú</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Thông tin thêm về phiếu trả..."
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditing(null);
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition font-semibold"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-bold disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editing ? 'Lưu thay đổi' : 'Tạo phiếu trả'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== Modal chi tiết ===== */}
      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail ? `Chi tiết phiếu trả ${detail.id}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge(detail.status)}
              {refundBadge(detail)}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Khách hàng</p>
                <button
                  className="font-bold text-gray-800 hover:text-indigo-700 flex items-center gap-1"
                  onClick={() => setHistoryCustomer(detail.customerName || 'Khách lẻ')}
                >
                  {detail.customerName || 'Khách lẻ'} <History size={12} />
                </button>
                {detail.customerPhone && <p className="text-xs text-gray-500">{detail.customerPhone}</p>}
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Đơn hàng</p>
                <p className="font-bold text-gray-800">{detail.orderId}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Calendar size={11} /> Ngày trả hàng
                </p>
                <p className="font-semibold text-gray-800">{formatDate(detail.createdAt)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Ngày xử lý</p>
                <p className="font-semibold text-gray-800">{formatDate(detail.processedAt)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                <p className="text-xs text-gray-500">Lý do trả hàng</p>
                <p className="font-semibold text-gray-800">{detail.reason}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Hình thức hoàn tiền</p>
                <p className="font-semibold text-gray-800">
                  {detail.refundMethod ? REFUND_METHOD_LABEL[detail.refundMethod] : '—'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Tổng giá trị hàng trả</p>
                <p className="font-black text-indigo-700 text-base">{formatMoney(detail.totalAmount)} ₫</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Danh sách hàng trả</p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] font-semibold">
                    <tr>
                      <th className="px-3 py-2">Sản phẩm</th>
                      <th className="px-3 py-2 text-center">SL</th>
                      <th className="px-3 py-2 text-right">Đơn giá</th>
                      <th className="px-3 py-2 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.items.map((it) => (
                      <tr key={it.productId}>
                        <td className="px-3 py-2">
                          <p className="text-sm font-semibold text-gray-800">{it.name}</p>
                          <p className="text-xs text-gray-400">SKU: {it.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-center text-sm font-bold text-gray-700">{it.quantity}</td>
                        <td className="px-3 py-2 text-right text-sm text-gray-600">
                          {formatMoney(it.unitPrice)} ₫
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-gray-800">
                          {formatMoney(it.totalPrice)} ₫
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold text-gray-600">
                        Tổng cộng
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-black text-indigo-700">
                        {formatMoney(detail.totalAmount)} ₫
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {detail.note && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Ghi chú</p>
                <p className="text-sm text-gray-700">{detail.note}</p>
              </div>
            )}

            {detail.status === 'cancelled' && detail.cancelReason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-500 font-semibold">Lý do hủy</p>
                <p className="text-sm text-red-700">{detail.cancelReason}</p>
              </div>
            )}

            <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => handleDelete(detail)}
                disabled={busyId === detail.id}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition font-semibold disabled:opacity-50"
              >
                {busyId === detail.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Xóa phiếu
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => printReturn(detail)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition font-semibold"
                >
                  <Printer size={15} /> In phiếu
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(detail)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition font-semibold"
                >
                  <Pencil size={15} /> Sửa
                </button>
                {detail.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCancelReturn(detail)}
                      disabled={busyId === detail.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition font-semibold disabled:opacity-50"
                    >
                      <XCircle size={15} /> Hủy phiếu
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProcess(detail)}
                      disabled={busyId === detail.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-bold disabled:opacity-50"
                    >
                      {busyId === detail.id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <CheckCircle size={15} />
                      )}
                      Hoàn tất
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setDetailOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition font-semibold"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ===== Modal lịch sử trả hàng theo khách hàng ===== */}
      <Modal
        isOpen={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
        title={historyCustomer ? `Lịch sử trả hàng — ${historyCustomer}` : ''}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Số phiếu</p>
              <p className="font-bold text-gray-800">{historySummary.count}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Tổng giá trị</p>
              <p className="font-bold text-indigo-700">{formatMoney(historySummary.total)} ₫</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Đã hoàn lại</p>
              <p className="font-bold text-emerald-700">{formatMoney(historySummary.refunded)} ₫</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Còn phải hoàn</p>
              <p className="font-bold text-orange-600">{formatMoney(historySummary.pending)} ₫</p>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] font-semibold">
                <tr>
                  <th className="px-3 py-2">Mã phiếu</th>
                  <th className="px-3 py-2">Đơn hàng</th>
                  <th className="px-3 py-2 text-right">Giá trị</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Ngày trả</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customerHistory.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-indigo-50/40 cursor-pointer"
                    onClick={() => {
                      setHistoryCustomer(null);
                      openDetail(r);
                    }}
                  >
                    <td className="px-3 py-2 text-sm font-bold text-gray-800">{r.id}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{r.orderId}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-gray-800">
                      {formatMoney(r.totalAmount)} ₫
                    </td>
                    <td className="px-3 py-2">{statusBadge(r.status)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
                {customerHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-gray-400">
                      Khách hàng chưa có phiếu trả hàng.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setHistoryCustomer(null)}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition font-semibold"
            >
              Đóng
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
