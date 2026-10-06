import { Order, ImportRecord, PaymentRecord, OrderStatus } from '../types';

export type DebtStatus = 'unpaid' | 'partial' | 'paid';

export interface Receivable {
  id: string;
  name: string;
  phone?: string;
  total: number;
  paid: number;
  outstanding: number;
  status: DebtStatus;
  orderStatus: OrderStatus;
}

export interface Payable {
  id: string;
  name: string;
  total: number;
  paid: number;
  outstanding: number;
  status: DebtStatus;
}

export interface DebtSummary {
  total: number;
  paid: number;
  outstanding: number;
  debtCount: number;
  topDebtor?: { id: string; name: string; outstanding: number };
}

export interface HistoryGroup {
  name: string;
  total: number;
  latestAt: string;
  itemCount: number;
  items: HistoryItem[];
}

export interface HistoryItem {
  id: string;
  refId?: string;
  amount: number;
  method: PaymentRecord['method'];
  createdAt: string;
  isGap?: boolean;
  resolvedName: string;
}

export class DebtService {
  static computePaidForOrder(order: Order, payments: PaymentRecord[]): number {
    const paidFromPayments = payments
      .filter((p) => p.kind === 'receivable' && p.orderId === order.id)
      .reduce((s, p) => s + p.amount, 0);
    const paidFromOrder = typeof order.paidAmount === 'number' ? order.paidAmount : 0;
    return Math.max(paidFromPayments, paidFromOrder);
  }

  static computeReceivables(orders: Order[], payments: PaymentRecord[]): Receivable[] {
    return orders
      .map((o) => {
        const paid = this.computePaidForOrder(o, payments);
        return {
          id: o.id,
          name: o.customerName,
          phone: o.customerPhone,
          total: o.totalAmount,
          paid,
          outstanding: Math.max(0, o.totalAmount - paid),
          orderStatus: o.status,
          status: (paid <= 0
            ? 'unpaid'
            : paid >= o.totalAmount
              ? 'paid'
              : 'partial') as DebtStatus,
        };
      });
  }

  static computePaidForImport(imp: ImportRecord, payments: PaymentRecord[]): number {
    const paidFromPayments = payments
      .filter((p) => p.kind === 'payable' && p.importId === imp.id)
      .reduce((s, p) => s + p.amount, 0);
    const paidFromImport = typeof imp.paidAmount === 'number' ? imp.paidAmount : 0;
    return Math.max(paidFromPayments, paidFromImport);
  }

  static computePayables(imports: ImportRecord[], payments: PaymentRecord[]): Payable[] {
    return imports
      .filter((i) => typeof i.totalCost === 'number')
      .map((i) => {
        const paid = this.computePaidForImport(i, payments);
        const total = i.totalCost as number;
        return {
          id: i.id,
          name: i.supplierName || i.note || 'Nhà cung cấp',
          total,
          paid,
          outstanding: Math.max(0, total - paid),
          status: (paid <= 0
            ? 'unpaid'
            : paid >= total
              ? 'paid'
              : 'partial') as DebtStatus,
        };
      });
  }

  static computeReceivableSummary(receivables: Receivable[]): DebtSummary {
    const total = receivables.reduce((s, r) => s + r.total, 0);
    const paid = receivables.reduce((s, r) => s + r.paid, 0);
    const outstanding = receivables.reduce((s, r) => s + r.outstanding, 0);
    const debtList = receivables.filter((r) => r.outstanding > 0);
    const topDebtor = debtList.slice().sort((a, b) => b.outstanding - a.outstanding)[0];
    return {
      total,
      paid,
      outstanding,
      debtCount: debtList.length,
      topDebtor: topDebtor
        ? { id: topDebtor.id, name: topDebtor.name, outstanding: topDebtor.outstanding }
        : undefined,
    };
  }

  static computePayableSummary(payables: Payable[]): DebtSummary {
    const total = payables.reduce((s, r) => s + r.total, 0);
    const paid = payables.reduce((s, r) => s + r.paid, 0);
    const outstanding = payables.reduce((s, r) => s + r.outstanding, 0);
    const debtList = payables.filter((r) => r.outstanding > 0);
    const topSupplier = debtList.slice().sort((a, b) => b.outstanding - a.outstanding)[0];
    return {
      total,
      paid,
      outstanding,
      debtCount: debtList.length,
      topDebtor: topSupplier
        ? { id: topSupplier.id, name: topSupplier.name, outstanding: topSupplier.outstanding }
        : undefined,
    };
  }

  static filterReceivables(
    list: Receivable[],
    search: string,
    statusFilter: 'all' | DebtStatus,
  ): Receivable[] {
    const s = search.trim().toLowerCase();
    return list.filter((r) => {
      const matchSearch =
        !s || r.name.toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
      const matchStatus = statusFilter === 'all' ? true : r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }

  static filterPayables(
    list: Payable[],
    search: string,
    statusFilter: 'all' | DebtStatus,
  ): Payable[] {
    const s = search.trim().toLowerCase();
    return list.filter((r) => {
      const matchSearch =
        !s || r.name.toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
      const matchStatus = statusFilter === 'all' ? true : r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }

  static getReceivableHistory(
    orders: Order[],
    payments: PaymentRecord[],
    search = '',
  ): HistoryGroup[] {
    const orderById = new Map<string, Order>(orders.map((o) => [o.id, o]));
    const s = search.trim().toLowerCase();

    const actualPayments: (PaymentRecord & { resolvedCustomerName: string })[] = payments
      .filter((p) => p.kind === 'receivable')
      .map((p) => {
        const fallbackName = p.orderId ? orderById.get(p.orderId)?.customerName : undefined;
        return {
          ...p,
          resolvedCustomerName: p.customerName || fallbackName || 'Khách',
        };
      });

    const actualPaidByOrder = actualPayments.reduce((acc, p) => {
      if (!p.orderId) return acc;
      acc.set(p.orderId, (acc.get(p.orderId) || 0) + p.amount);
      return acc;
    }, new Map<string, number>());

    const fallbackPayments: (PaymentRecord & {
      resolvedCustomerName: string;
      isGap: boolean;
    })[] = orders
      .filter((o) => (o.paidAmount || 0) > (actualPaidByOrder.get(o.id) || 0))
      .map((o) => ({
        id: `gap_${o.id}`,
        kind: 'receivable' as const,
        orderId: o.id,
        amount: (o.paidAmount || 0) - (actualPaidByOrder.get(o.id) || 0),
        method: 'other' as const,
        createdAt: o.lastPaidAt || o.createdAt,
        resolvedCustomerName: o.customerName || 'Khách',
        isGap: true,
      }));

    const unified = [...actualPayments, ...fallbackPayments]
      .filter((p) => {
        if (!s) return true;
        return (
          p.resolvedCustomerName.toLowerCase().includes(s) ||
          (p.orderId && p.orderId.toLowerCase().includes(s))
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const groupMap = new Map<
      string,
      { customerName: string; total: number; latestAt: string; items: typeof unified }
    >();
    for (const p of unified) {
      const key = p.resolvedCustomerName;
      const cur = groupMap.get(key);
      if (!cur) {
        groupMap.set(key, {
          customerName: key,
          total: p.amount,
          latestAt: p.createdAt,
          items: [p],
        });
      } else {
        cur.total += p.amount;
        if (new Date(p.createdAt).getTime() > new Date(cur.latestAt).getTime())
          cur.latestAt = p.createdAt;
        cur.items.push(p);
      }
    }

    return Array.from(groupMap.values())
      .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
      .map((g) => ({
        name: g.customerName,
        total: g.total,
        latestAt: g.latestAt,
        itemCount: g.items.length,
        items: g.items.map((p) => ({
          id: p.id,
          refId: p.orderId,
          amount: p.amount,
          method: p.method,
          createdAt: p.createdAt,
          isGap: 'isGap' in p && p.isGap ? true : undefined,
          resolvedName: p.resolvedCustomerName,
        })),
      }));
  }

  static getPayableHistory(
    imports: ImportRecord[],
    payments: PaymentRecord[],
    search = '',
  ): HistoryGroup[] {
    const s = search.trim().toLowerCase();

    const actualPayments: (PaymentRecord & { resolvedSupplierName: string })[] = payments
      .filter((p) => p.kind === 'payable')
      .map((p) => ({
        ...p,
        resolvedSupplierName: p.supplierName || 'Nhà cung cấp',
      }));

    const actualPaidByImport = actualPayments.reduce((acc, p) => {
      if (!p.importId) return acc;
      acc.set(p.importId, (acc.get(p.importId) || 0) + p.amount);
      return acc;
    }, new Map<string, number>());

    const fallbackPayments: (PaymentRecord & {
      resolvedSupplierName: string;
      isGap: boolean;
    })[] = imports
      .filter(
        (i) =>
          typeof i.totalCost === 'number' &&
          (i.paidAmount || 0) > (actualPaidByImport.get(i.id) || 0),
      )
      .map((i) => ({
        id: `gap_imp_${i.id}`,
        kind: 'payable' as const,
        importId: i.id,
        amount: (i.paidAmount || 0) - (actualPaidByImport.get(i.id) || 0),
        method: 'other' as const,
        createdAt: i.lastPaidAt || i.createdAt,
        resolvedSupplierName: i.supplierName || i.note || 'Nhà cung cấp',
        isGap: true,
      }));

    const unified = [...actualPayments, ...fallbackPayments]
      .filter((p) => {
        if (!s) return true;
        return (
          p.resolvedSupplierName.toLowerCase().includes(s) ||
          (p.importId && p.importId.toLowerCase().includes(s))
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const groupMap = new Map<
      string,
      { supplierName: string; total: number; latestAt: string; items: typeof unified }
    >();
    for (const p of unified) {
      const key = p.resolvedSupplierName;
      const cur = groupMap.get(key);
      if (!cur) {
        groupMap.set(key, {
          supplierName: key,
          total: p.amount,
          latestAt: p.createdAt,
          items: [p],
        });
      } else {
        cur.total += p.amount;
        if (new Date(p.createdAt).getTime() > new Date(cur.latestAt).getTime())
          cur.latestAt = p.createdAt;
        cur.items.push(p);
      }
    }

    return Array.from(groupMap.values())
      .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
      .map((g) => ({
        name: g.supplierName,
        total: g.total,
        latestAt: g.latestAt,
        itemCount: g.items.length,
        items: g.items.map((p) => ({
          id: p.id,
          refId: p.importId,
          amount: p.amount,
          method: p.method,
          createdAt: p.createdAt,
          isGap: 'isGap' in p && p.isGap ? true : undefined,
          resolvedName: p.resolvedSupplierName,
        })),
      }));
  }

  static validateReceivablePayment(
    receivable: Receivable | undefined,
    amount: number,
  ): { ok: true } | { ok: false; reason: string } {
    if (!receivable) return { ok: false, reason: 'Đơn hàng không tồn tại' };
    if (receivable.orderStatus !== OrderStatus.COMPLETED)
      return { ok: false, reason: 'Đơn hàng chưa hoàn thành, không thể thu tiền' };
    if (receivable.outstanding <= 0)
      return { ok: false, reason: 'Đơn hàng đã thanh toán đủ' };
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, reason: 'Số tiền thanh toán phải > 0' };
    if (amount > receivable.outstanding)
      return { ok: false, reason: 'Số tiền thanh toán vượt quá số còn nợ' };
    return { ok: true };
  }

  static validatePayablePayment(
    payable: Payable | undefined,
    amount: number,
  ): { ok: true } | { ok: false; reason: string } {
    if (!payable) return { ok: false, reason: 'Phiếu nhập không tồn tại' };
    if (payable.outstanding <= 0)
      return { ok: false, reason: 'Phiếu nhập đã thanh toán đủ' };
    if (!Number.isFinite(amount) || amount <= 0)
      return { ok: false, reason: 'Số tiền thanh toán phải > 0' };
    if (amount > payable.outstanding)
      return { ok: false, reason: 'Số tiền thanh toán vượt quá số còn nợ' };
    return { ok: true };
  }
}
