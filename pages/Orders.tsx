import React, { useState, useEffect } from 'react';
import { MockBackend } from '../services/mockBackend';
import { Order, OrderStatus, Product, CartItem, Customer } from '../types';
import { Search, Plus, Eye, CheckCircle, Truck, XCircle, Clock, Loader2, Edit2, Trash2, Printer } from 'lucide-react';
import { Modal } from '../components/Modal';
import { NumberInput } from '../components/NumberInput';

export const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create Order Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newOrderCustomer, setNewOrderCustomer] = useState({ name: '', phone: '', address: '' });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [processingOrder, setProcessingOrder] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newOrderQuantity, setNewOrderQuantity] = useState(1);
  const [saveNewCustomer, setSaveNewCustomer] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [newOrderUnit, setNewOrderUnit] = useState<'Thùng' | 'Gói'>('Gói');
  const [newOrderLinePrice, setNewOrderLinePrice] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [newOrderLineDiscount, setNewOrderLineDiscount] = useState(0);

  const loadData = async () => {
    setLoading(true);
    try {
      const [o, p, c] = await Promise.all([
        MockBackend.getOrders(),
        MockBackend.getProducts(),
        MockBackend.getCustomers()
      ]);
      setOrders(o);
      setProducts(p);
      setCustomers(c);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrders = orders.filter(o => 
    o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    o.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PER_PAGE));
  const visibleOrders = filteredOrders.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  useEffect(() => { setPage(1); }, [searchTerm, orders]);

  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === today);
  const todayCount = todayOrders.length;
  const todayRevenue = todayOrders.filter(o => o.status !== OrderStatus.CANCELLED).reduce((sum, o) => sum + o.totalAmount, 0);
  const pendingCount = orders.filter(o => o.status === OrderStatus.PENDING).length;
  const completedCount = orders.filter(o => o.status === OrderStatus.COMPLETED).length;

  const reservedMap = (() => {
    const map = new Map<string, number>();
    orders
      .filter(o => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.COMPLETED)
      .forEach(o => {
        o.items.forEach(it => {
          const cur = map.get(it.productId) || 0;
          map.set(it.productId, cur + it.quantity);
        });
      });
    return map;
  })();
  const reservedTotal = Array.from(reservedMap.values()).reduce((a,b)=>a+b,0);
  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.COMPLETED:
        return <span className="flex items-center gap-1 text-green-600 bg-green-100 px-2 py-1 rounded-md text-xs font-bold"><CheckCircle size={12}/> Hoàn thành</span>;
      case OrderStatus.SHIPPING:
        return <span className="flex items-center gap-1 text-blue-600 bg-blue-100 px-2 py-1 rounded-md text-xs font-bold"><Truck size={12}/> Đang giao</span>;
      case OrderStatus.CANCELLED:
        return <span className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-1 rounded-md text-xs font-bold"><XCircle size={12}/> Đã hủy</span>;
      default:
        return <span className="flex items-center gap-1 text-yellow-600 bg-yellow-100 px-2 py-1 rounded-md text-xs font-bold"><Clock size={12}/> Chờ xử lý</span>;
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    const current = orders.find(o => o.id === orderId);
    if (current && current.status === OrderStatus.COMPLETED) return;
    let reason: string | undefined = undefined;
    if (newStatus === OrderStatus.CANCELLED) {
      reason = prompt('Nhập lý do hủy đơn:') || undefined;
    }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, cancelReason: reason || o.cancelReason } : o));
    await MockBackend.updateOrderStatus(orderId, newStatus, reason);
    await loadData();
  };
  
  const handleDeleteOrder = async (orderId: string) => {
    if (confirm('Bạn có chắc muốn xóa đơn này? Tồn kho sẽ được khôi phục.')) {
      await MockBackend.deleteOrder(orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      await loadData();
    }
  };

  const escapeHtml = (value: string) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch
    ));

  const formatMoney = (value: number) =>
    Math.round(value).toLocaleString('vi-VN');

  const numberToVietnamese = (value: number) => {
    const chuSo = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const hang = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
    const n = Math.round(Math.abs(value));
    if (n === 0) return 'Không đồng';

    const readBlock = (block: number, full: boolean) => {
      const tram = Math.floor(block / 100);
      const chuc = Math.floor((block % 100) / 10);
      const donvi = block % 10;
      let text = '';
      if (tram > 0) {
        text += `${chuSo[tram]} trăm`;
        if (chuc === 0 && donvi > 0) text += ' lẻ';
      } else if (full && (chuc > 0 || donvi > 0)) {
        text += 'không trăm';
        if (chuc === 0) text += ' lẻ';
      }
      if (chuc > 1) {
        text += `${text ? ' ' : ''}${chuSo[chuc]} mươi`;
        if (donvi === 1) text += ' mốt';
        else if (donvi === 4) text += ' tư';
        else if (donvi === 5) text += ' lăm';
        else if (donvi > 0) text += ` ${chuSo[donvi]}`;
      } else if (chuc === 1) {
        text += `${text ? ' ' : ''}mười`;
        if (donvi === 5) text += ' lăm';
        else if (donvi > 0) text += ` ${chuSo[donvi]}`;
      } else if (donvi > 0) {
        text += `${text ? ' ' : ''}${chuSo[donvi]}`;
      }
      return text.trim();
    };

    const blocks: number[] = [];
    let remaining = n;
    while (remaining > 0) {
      blocks.push(remaining % 1000);
      remaining = Math.floor(remaining / 1000);
    }

    const parts: string[] = [];
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (block === 0) continue;
      const full = i !== blocks.length - 1;
      const blockText = readBlock(block, full);
      if (blockText) parts.push(`${blockText}${hang[i] ? ` ${hang[i]}` : ''}`);
    }

    const words = parts.join(' ').replace(/\s+/g, ' ').trim();
    return `${words.charAt(0).toUpperCase()}${words.slice(1)} đồng`;
  };

  const printInvoice = (order: Order) => {
    const created = new Date(order.createdAt);
    const day = String(created.getDate()).padStart(2, '0');
    const month = String(created.getMonth() + 1).padStart(2, '0');
    const year = String(created.getFullYear());

    const printLineStats = (it: CartItem) => {
      const qty = it.quantity;
      const price = it.price || 0;
      const pct = Math.max(0, Math.min(100, it.discountPercent ?? 0));
      const subTotal = qty * price;
      const lineDiscount = Math.round(subTotal * (pct / 100));
      const lineAfterDisc = subTotal - lineDiscount;
      return { qty, price, pct, subTotal, lineDiscount, lineAfterDisc };
    };

    const beforeLineDisc = order.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const lineDiscountTotal = order.items.reduce((sum, it) => sum + printLineStats(it).lineDiscount, 0);
    const goodsTotal = beforeLineDisc - lineDiscountTotal;
    const discPct = Math.max(0, Math.min(100, order.discountPercent ?? 0));
    const orderDiscountAmount = Math.round(goodsTotal * (discPct / 100));
    const vatAmount = 0;
    const paymentTotal = goodsTotal - orderDiscountAmount + vatAmount;

    const itemRows = order.items.map((it, idx) => {
      const product = products.find(p => p.id === it.productId);
      const ls = printLineStats(it);
      const discCell = ls.pct > 0
        ? `<td class="r">${ls.pct}%<br/><span style="color:#b45309">− ${formatMoney(ls.lineDiscount)}</span></td>`
        : `<td class="r">—</td>`;
      return `
        <tr>
          <td class="c">${idx + 1}</td>
          <td>${escapeHtml(product?.sku || '')}</td>
          <td>${escapeHtml(it.name)}</td>
          <td class="c">${escapeHtml(it.unit || 'Gói')}</td>
          <td class="c">${ls.qty}</td>
          <td class="r">${formatMoney(ls.price)}</td>
          <td class="r">${formatMoney(ls.subTotal)}</td>
          ${discCell}
          <td class="r" style="font-weight:700">${formatMoney(ls.lineAfterDisc)}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8" />
        <title>Phiếu xuất kho ${escapeHtml(order.id)}</title>
        <style>
          @page { size: A4 portrait; margin: 7mm 8mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #111;
            font-family: "Times New Roman", Times, serif;
            background: #fff;
          }
          .sheet {
            padding: 4px 4px 8px;
            min-height: 0;
            width: 100%;
          }
          .company { text-align: center; line-height: 1.35; }
          .company .name { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2px; }
          .company .tag { font-size: 12px; font-weight: 700; text-transform: uppercase; margin-top: 1px; }
          .company .addr { font-size: 11.5px; margin-top: 2px; }
          hr.line { border: 0; border-top: 1.5px solid #111; margin: 8px 0 10px; }
          .doc-title { text-align: center; font-size: 21px; font-weight: 700; letter-spacing: 0.6px; margin: 0; }
          .doc-date { text-align: center; font-size: 12.5px; margin: 3px 0 11px; }
          .info { font-size: 13px; line-height: 1.7; margin-bottom: 8px; }
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
          .r { text-align: right; }
          .sum-row td { background: #fdfdfd; -webkit-print-color-adjust: exact; print-color-adjust: exact; border-top: 1px solid #111; }
          .sum-row.total td { background: #f5f5f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: 900; }
          .sum-label { text-align: right; font-weight: 700; padding-right: 8px; }
          .words { font-size: 13px; margin: 10px 0 4px; line-height: 1.6; }
          .signs { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; margin-top: 14px; text-align: center; gap: 4px; }
          .signs .role { font-size: 13px; font-weight: 700; }
          .signs .hint { font-size: 11.5px; font-style: italic; margin-top: 2px; }
          .meta-id { text-align: right; font-size: 11px; color: #444; margin-bottom: 2px; }
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
          <h1 class="doc-title">PHIẾU XUẤT KHO BÁN HÀNG</h1>
          <div class="doc-date">Ngày ${day} tháng ${month} năm ${year}</div>
          <div class="meta-id">Mã phiếu: <strong>${escapeHtml(order.id)}</strong></div>
          <div class="info">
            <div>Tên khách hàng: <strong>${escapeHtml(order.customerName || '')}</strong></div>
            <div>Điện thoại: ${escapeHtml(order.customerPhone || '')}</div>
            <div>Địa chỉ: ${escapeHtml(order.address || '')}</div>
          </div>
          <table class="grid">
            <colgroup>
              <col style="width:4.5%" />
              <col style="width:9%" />
              <col style="width:22%" />
              <col style="width:5.5%" />
              <col style="width:5%" />
              <col style="width:10.5%" />
              <col style="width:10.5%" />
              <col style="width:12%" />
              <col style="width:11%" />
            </colgroup>
            <thead>
              <tr>
                <th>STT</th>
                <th>Mã hàng</th>
                <th>Tên hàng</th>
                <th>ĐVT</th>
                <th>SL</th>
                <th>Đơn giá</th>
                <th>Thành tiền<br/>(trước CK)</th>
                <th>% CK & Tiền giảm</th>
                <th>Thành tiền<br/>(sau CK)</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
              <tr class="sum-row">
                <td colspan="6" class="sum-label">Tổng tiền hàng (SL × Giá):</td>
                <td class="r" colspan="2">${formatMoney(beforeLineDisc)}</td>
                <td></td>
              </tr>
              ${lineDiscountTotal > 0 ? `
              <tr class="sum-row">
                <td colspan="6" class="sum-label" style="color:#b45309">Chiết khấu theo từng sản phẩm:</td>
                <td class="r" colspan="2" style="color:#b45309;font-weight:700;">− ${formatMoney(lineDiscountTotal)}</td>
                <td></td>
              </tr>
              <tr class="sum-row" style="background:#fbfbfb">
                <td colspan="6" class="sum-label">→ Sau CK từng SP:</td>
                <td class="r" colspan="2" style="font-weight:800">${formatMoney(goodsTotal)}</td>
                <td></td>
              </tr>
              ` : `
              <tr class="sum-row">
                <td colspan="6" class="sum-label">→ Sau CK từng SP:</td>
                <td class="r" colspan="2">${formatMoney(goodsTotal)}</td>
                <td></td>
              </tr>
              `}
              ${discPct > 0 ? `
              <tr class="sum-row discount">
                <td colspan="6" class="sum-label" style="color:#9a3412">Chiết khấu toàn đơn ${escapeHtml(String(discPct))}%:</td>
                <td class="r" colspan="2" style="color:#9a3412;font-weight:700;">− ${formatMoney(orderDiscountAmount)}</td>
                <td></td>
              </tr>
              ` : ''}
              <tr class="sum-row">
                <td colspan="6" class="sum-label">Tiền thuế GTGT:</td>
                <td class="r" colspan="2">${formatMoney(vatAmount)}</td>
                <td></td>
              </tr>
              <tr class="sum-row total">
                <td colspan="6" class="sum-label">Tổng tiền thanh toán:</td>
                <td class="r" colspan="2"></td>
                <td class="r" style="font-size:13px;">${formatMoney(paymentTotal)}</td>
              </tr>
            </tbody>
          </table>
          <div class="words">
            Số tiền viết bằng chữ: <em>${escapeHtml(numberToVietnamese(paymentTotal))}</em>
          </div>
          <div class="signs">
            <div>
              <div class="role">Người mua hàng</div>
              <div class="hint">(Ký, họ tên)</div>
            </div>
            <div>
              <div class="role">Người giao hàng</div>
              <div class="hint">(Ký, họ tên)</div>
            </div>
            <div>
              <div class="role">Thủ quỹ</div>
              <div class="hint">(Ký, họ tên)</div>
            </div>
            <div>
              <div class="role">Kế toán</div>
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

  // --- Cart Logic ---
  const addToCart = () => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (product.stock <= 0) {
      alert("Sản phẩm này đã hết hàng!");
      return;
    }
    const linePrice = Math.max(0, newOrderLinePrice);
    const lineDisc = Math.max(0, Math.min(100, newOrderLineDiscount || 0));

    const existingItem = cart.find(item => item.productId === selectedProductId);
    if (existingItem) {
      const newQty = existingItem.quantity + newOrderQuantity;
      if (newQty > product.stock) {
        alert(`Chỉ còn ${product.stock} sản phẩm trong kho.`);
        return;
      }
      setCart(cart.map(item => item.productId === selectedProductId ? {
        ...item,
        quantity: newQty,
        unit: newOrderUnit || item.unit || 'Gói',
        price: linePrice > 0 ? linePrice : item.price,
        discountPercent: lineDisc > 0 ? lineDisc : (item.discountPercent ?? 0),
      } : item));
    } else {
      if (newOrderQuantity > product.stock) {
        alert(`Chỉ còn ${product.stock} sản phẩm trong kho.`);
        return;
      }
      setCart([...cart, {
        productId: product.id,
        name: product.name,
        price: linePrice,
        quantity: newOrderQuantity,
        unit: newOrderUnit || 'Gói',
        discountPercent: lineDisc,
      }]);
    }
    setSelectedProductId('');
    setNewOrderQuantity(1);
    setNewOrderUnit('Gói');
    setNewOrderLinePrice(0);
    setNewOrderLineDiscount(0);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  // Tính toán từng dòng (trước CK chung)
  const lineStats = (item: CartItem) => {
    const qty = item.quantity;
    const price = item.price || 0;
    const pct = Math.max(0, Math.min(100, item.discountPercent ?? 0));
    const subTotal = qty * price;
    const lineDiscount = Math.round(subTotal * (pct / 100));
    const lineAfterDisc = subTotal - lineDiscount;
    return { qty, price, pct, subTotal, lineDiscount, lineAfterDisc };
  };

  const calculateTotals = (discountPct?: number, itemsOverride?: CartItem[]) => {
    const items = itemsOverride ?? cart;
    // Tổng sau CK từng sản phẩm (chưa áp dụng CK chung)
    const afterLineDisc = items.reduce((sum, item) => sum + lineStats(item).lineAfterDisc, 0);
    // Tổng tiền hàng trước CK từng SP (dùng để hiển thị chi tiết)
    const beforeLineDisc = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const lineDiscountTotal = items.reduce((sum, item) => sum + lineStats(item).lineDiscount, 0);

    // CK chung áp dụng trên Tổng sau CK từng SP
    const pct = Math.max(0, Math.min(100, (discountPct ?? discountPercent) || 0));
    const orderDiscountAmount = Math.round(afterLineDisc * (pct / 100));

    const goodsTotal = afterLineDisc;
    const discountAmount = orderDiscountAmount;
    const vatAmount = 0;
    const paymentTotal = goodsTotal - discountAmount + vatAmount;

    return {
      goodsTotal,                          // Sử dụng sau CK từng sản phẩm
      beforeLineDisc,                      // Tổng SL × Giá, trước CK từng SP (dùng để hiển thị nếu cần)
      lineDiscountTotal,                   // Tổng tiền CK riêng từng SP
      orderDiscountPercent: pct,           // % CK chung
      discountPercent: pct,
      orderDiscountAmount: discountAmount, // Tiền CK chung
      discountAmount,
      vatAmount,
      paymentTotal,
    };
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert("Vui lòng thêm sản phẩm vào đơn hàng.");
      return;
    }
    setProcessingOrder(true);

    try {
      const totals = calculateTotals();
      if (editingOrder) {
        // --- Cập nhật đơn hàng ---
        await MockBackend.updateOrder(editingOrder.id, {
          customerName: newOrderCustomer.name,
          customerPhone: newOrderCustomer.phone,
          address: newOrderCustomer.address,
          totalAmount: totals.paymentTotal,
          discountPercent: totals.discountPercent,
          items: cart,
        });
        if (!selectedCustomerId && saveNewCustomer) {
          await MockBackend.addCustomer(newOrderCustomer.name, newOrderCustomer.phone, newOrderCustomer.address);
        }
      } else {
        // --- Tạo mới đơn hàng ---
        await MockBackend.createOrder({
          customerName: newOrderCustomer.name,
          customerPhone: newOrderCustomer.phone,
          address: newOrderCustomer.address,
          totalAmount: totals.paymentTotal,
          status: OrderStatus.PENDING,
          discountPercent: totals.discountPercent,
          items: cart,
        });
        if (!selectedCustomerId && saveNewCustomer) {
          await MockBackend.addCustomer(newOrderCustomer.name, newOrderCustomer.phone, newOrderCustomer.address);
        }
      }

      // Refresh Data
      await loadData();

      // Reset & Close
      setEditingOrder(null);
      setNewOrderCustomer({ name: '', phone: '', address: '' });
      setCart([]);
      setDiscountPercent(0);
      setIsModalOpen(false);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Quản Lý Đơn Hàng</h2>
        <button
          onClick={() => {
            setEditingOrder(null);
            setNewOrderCustomer({ name: '', phone: '', address: '' });
            setCart([]);
            setSelectedCustomerId('');
            setSelectedProductId('');
            setNewOrderQuantity(1);
            setNewOrderUnit('Gói');
            setNewOrderLinePrice(0);
            setNewOrderLineDiscount(0);
            setDiscountPercent(0);
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm transition-all"
        >
          <Plus size={18} />
          <span>Tạo Đơn Mới</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Tìm mã đơn hoặc tên khách hàng..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-gray-600">Tổng đơn hôm nay</p>
            <p className="text-lg font-bold text-blue-700">{todayCount}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
            <p className="text-xs text-gray-600">Doanh thu hôm nay</p>
            <p className="text-lg font-bold text-emerald-700">{todayRevenue.toLocaleString()} ₫</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
            <p className="text-xs text-gray-600">Đơn chờ xử lý</p>
            <p className="text-lg font-bold text-yellow-700">{pendingCount}</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-lg p-3">
            <p className="text-xs text-gray-600">Đơn hoàn thành</p>
            <p className="text-lg font-bold text-green-700">{completedCount}</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <p className="text-xs text-gray-600">Sắp xuất (đơn chưa hoàn thành)</p>
            <p className="text-lg font-bold text-amber-700">{reservedTotal}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
             <div className="flex justify-center items-center py-20">
              <Loader2 className="animate-spin text-blue-600" size={32} />
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4">Mã Đơn</th>
                  <th className="px-6 py-4">Khách Hàng</th>
                  <th className="px-6 py-4 text-right">Tổng Tiền</th>
                  <th className="px-6 py-4">Ngày Tạo</th>
                  <th className="px-6 py-4">Trạng Thái</th>
                  <th className="px-6 py-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-blue-50">
                    <td className="px-6 py-4 font-mono text-sm text-blue-600 font-medium">{order.id}</td>
                  <td className="px-6 py-4">
                      <p className="font-medium text-gray-800">{order.customerName}</p>
                      <p className="text-xs text-gray-500">{order.customerPhone}</p>
                    <p className="text-xs text-gray-500">{order.address}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-800">{order.totalAmount.toLocaleString()} ₫</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        className="p-1.5 text-gray-700 hover:bg-gray-50 rounded-md mr-2"
                        title="Xem chi tiết"
                        onClick={() => { setDetailOrder(order); setIsDetailOpen(true); }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md mr-2"
                        title={order.status === OrderStatus.COMPLETED ? 'Đơn đã hoàn thành, chỉ có thể sửa thông tin khách hàng' : 'Sửa đơn hàng'}
                        onClick={() => {
                          setEditingOrder(order);
                          setNewOrderCustomer({
                            name: order.customerName,
                            phone: order.customerPhone,
                            address: order.address,
                          });
                          setCart(order.items.map(it => ({
                            ...it,
                            unit: it.unit || 'Gói',
                            discountPercent: it.discountPercent ?? 0,
                          })));
                          setDiscountPercent(Math.max(0, Math.min(100, order.discountPercent ?? 0)));
                          setSelectedCustomerId('');
                          setSelectedProductId('');
                          setNewOrderQuantity(1);
                          setNewOrderUnit('Gói');
                          setNewOrderLinePrice(0);
                          setNewOrderLineDiscount(0);
                          setIsModalOpen(true);
                        }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md mr-2"
                        title="In hóa đơn"
                        onClick={() => printInvoice(order)}
                      >
                        <Printer size={16} />
                      </button>
                      <button
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-md mr-2"
                        title="Xóa đơn hàng"
                        onClick={() => handleDeleteOrder(order.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="relative inline-block">
                        <button
                          className="px-2 py-1.5 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 inline-flex items-center gap-1"
                          onClick={() => setOpenMenuFor(id => id === order.id ? null : order.id)}
                          disabled={order.status === OrderStatus.COMPLETED}
                          title="Cập nhật trạng thái"
                        >
                          <Clock size={14} />
                          <span className="text-xs">Trạng thái</span>
                        </button>
                        {openMenuFor === order.id && (
                          <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                            <button
                              className="w-full text-left px-3 py-2 hover:bg-yellow-50 text-yellow-700 text-sm flex items-center gap-2"
                              onClick={() => { setOpenMenuFor(null); handleStatusChange(order.id, OrderStatus.PENDING); }}
                            >
                              <Clock size={14}/> Chờ xử lý
                            </button>
                            <button
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-blue-700 text-sm flex items-center gap-2"
                              onClick={() => { setOpenMenuFor(null); handleStatusChange(order.id, OrderStatus.SHIPPING); }}
                            >
                              <Truck size={14}/> Đang giao
                            </button>
                            <button
                              className="w-full text-left px-3 py-2 hover:bg-green-50 text-green-700 text-sm flex items-center gap-2"
                              onClick={() => { setOpenMenuFor(null); handleStatusChange(order.id, OrderStatus.COMPLETED); }}
                            >
                              <CheckCircle size={14}/> Hoàn thành
                            </button>
                            <button
                              className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-700 text-sm flex items-center gap-2"
                              onClick={() => { setOpenMenuFor(null); handleStatusChange(order.id, OrderStatus.CANCELLED); }}
                            >
                              <XCircle size={14}/> Đã hủy
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
            <div className="text-sm text-gray-500">Trang {page} / {totalPages}</div>
            <div className="flex items-center gap-2">
              <button 
                className="px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Trước
              </button>
              <button 
                className="px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Order Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingOrder(null);
          setNewOrderCustomer({ name: '', phone: '', address: '' });
          setCart([]);
          setSelectedCustomerId('');
          setSelectedProductId('');
          setNewOrderQuantity(1);
          setNewOrderUnit('Gói');
          setNewOrderLinePrice(0);
          setNewOrderLineDiscount(0);
          setDiscountPercent(0);
        }}
        maxWidthClass="max-w-4xl"
        title={editingOrder ? `Chỉnh sửa đơn hàng ${editingOrder.id}` : 'Tạo Đơn Hàng Mới'}
      >
        <form onSubmit={handleCreateOrder} className="space-y-6">
          {/* Thông tin KH */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Thông Tin Khách Hàng
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên Khách Hàng <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  value={newOrderCustomer.name}
                  onChange={(e) => setNewOrderCustomer({...newOrderCustomer, name: e.target.value})}
                  placeholder="Nhập tên khách..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số Điện Thoại <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  value={newOrderCustomer.phone}
                  onChange={(e) => setNewOrderCustomer({...newOrderCustomer, phone: e.target.value})}
                  placeholder="09xx xxx xxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Địa Chỉ <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  value={newOrderCustomer.address}
                  onChange={(e) => setNewOrderCustomer({...newOrderCustomer, address: e.target.value})}
                  placeholder="Số nhà, đường..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chọn Khách Hàng Có Sẵn</label>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <select
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  value={selectedCustomerId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedCustomerId(id);
                    const c = customers.find(c => c.id === id);
                    if (c) setNewOrderCustomer({ name: c.name, phone: c.phone, address: c.address || '' });
                  }}
                >
                  <option value="">-- Chọn khách hàng --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={saveNewCustomer}
                    onChange={(e) => setSaveNewCustomer(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Lưu khách mới
                </label>
              </div>
            </div>
          </div>

          {/* Chọn & chỉnh SP */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              Danh Sách Sản Phẩm
              {editingOrder?.status === OrderStatus.COMPLETED && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                  ⚠ Đơn đã hoàn thành - chỉ sửa được thông tin khách
                </span>
              )}
            </h4>

            {/* Thêm SP vào giỏ */}
            <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-gray-200">
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Sản phẩm</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  disabled={editingOrder?.status === OrderStatus.COMPLETED}
                >
                  <option value="">-- Chọn sản phẩm --</option>
                  {products.filter(p => p.stock > 0).map(p => {
                    const rv = reservedMap.get(p.id) || 0;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} (Còn: {p.stock} • Sắp xuất: {rv})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">ĐVT</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  value={newOrderUnit}
                  onChange={(e) => setNewOrderUnit(e.target.value as any)}
                  disabled={editingOrder?.status === OrderStatus.COMPLETED}
                >
                  <option value="Gói">Gói</option>
                  <option value="Thùng">Thùng</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Số lượng</label>
                <NumberInput
                  value={newOrderQuantity}
                  onChange={(val) => setNewOrderQuantity(Math.max(1, val))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  placeholder="SL"
                  disabled={editingOrder?.status === OrderStatus.COMPLETED}
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Đơn giá bán (VNĐ)</label>
                <NumberInput
                  value={newOrderLinePrice}
                  onChange={(val) => setNewOrderLinePrice(Math.max(0, val))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  placeholder="0"
                  suffix="₫"
                  disabled={editingOrder?.status === OrderStatus.COMPLETED}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">% Chiết khấu riêng</label>
                <div className="relative">
                  <NumberInput
                    value={newOrderLineDiscount}
                    onChange={(val) => setNewOrderLineDiscount(Math.max(0, Math.min(100, val)))}
                    className="w-full px-3 py-2 pr-8 border border-amber-200 bg-amber-50 rounded-lg focus:ring-2 focus:ring-amber-400 text-sm font-semibold"
                    placeholder="0"
                    suffix="%"
                    disabled={editingOrder?.status === OrderStatus.COMPLETED}
                  />
                </div>
              </div>
              <div className="md:col-span-1">
                <button
                  type="button"
                  onClick={addToCart}
                  disabled={editingOrder?.status === OrderStatus.COMPLETED}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 h-[42px] flex items-center justify-center font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {/* Cart Items */}
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="grid grid-cols-12 text-[11px] font-bold uppercase text-gray-600 bg-gray-100 px-3 py-2">
                <div className="col-span-3">Sản phẩm</div>
                <div className="col-span-1 text-center">ĐVT</div>
                <div className="col-span-1 text-right">Giá bán</div>
                <div className="col-span-1 text-center">SL</div>
                <div className="col-span-2 text-right">Thành tiền (trước CK)</div>
                <div className="col-span-1 text-center">% CK</div>
                <div className="col-span-1 text-right text-amber-700">Giảm</div>
                <div className="col-span-1 text-right text-indigo-700">Sau CK</div>
                <div className="col-span-1 text-right">#</div>
              </div>
              <div className="divide-y divide-gray-100 max-h-[40vh] overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Chưa có sản phẩm nào — hãy chọn và THÊM sản phẩm ở trên ⬆
                  </div>
                ) : (
                  cart.map((item, idx) => {
                    const ls = lineStats(item);
                    return (
                      <div
                        key={`${item.productId}_${idx}`}
                        className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 hover:bg-blue-50/40 transition-colors"
                      >
                        <div className="col-span-3 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                        </div>
                        <div className="col-span-1">
                          <select
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:ring-2 focus:ring-blue-500"
                            value={item.unit || 'Gói'}
                            onChange={(e) => {
                              const unit = e.target.value as any;
                              setCart(cart.map((ci, i) => i === idx ? { ...ci, unit } : ci));
                            }}
                            disabled={editingOrder?.status === OrderStatus.COMPLETED}
                          >
                            <option value="Gói">Gói</option>
                            <option value="Thùng">Thùng</option>
                          </select>
                        </div>
                        <div className="col-span-1">
                          <NumberInput
                            value={item.price}
                            onChange={(p) => {
                              const finalP = Math.max(0, p);
                              setCart(cart.map((ci, i) => i === idx ? { ...ci, price: finalP } : ci));
                            }}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-[11px] bg-white"
                            disabled={editingOrder?.status === OrderStatus.COMPLETED}
                            suffix="₫"
                          />
                        </div>
                        <div className="col-span-1">
                          <NumberInput
                            value={item.quantity}
                            onChange={(q) => {
                              const finalQ = Math.max(1, q);
                              const product = products.find(p => p.id === item.productId);
                              if (product && finalQ > product.stock) {
                                alert(`Chỉ còn ${product.stock} sản phẩm trong kho.`);
                                return;
                              }
                              setCart(cart.map((ci, i) => i === idx ? { ...ci, quantity: finalQ } : ci));
                            }}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white text-center"
                            disabled={editingOrder?.status === OrderStatus.COMPLETED}
                          />
                        </div>
                        <div className="col-span-2 text-right">
                          <p className="text-xs font-medium text-gray-600">{ls.subTotal.toLocaleString()} ₫</p>
                        </div>
                        <div className="col-span-1">
                          <NumberInput
                            value={item.discountPercent ?? 0}
                            onChange={(d) => {
                              const finalD = Math.max(0, Math.min(100, d));
                              setCart(cart.map((ci, i) => i === idx ? { ...ci, discountPercent: finalD } : ci));
                            }}
                            className="w-full px-2 py-1.5 border border-amber-200 bg-amber-50 rounded-md text-[11px] font-semibold text-amber-900 text-center"
                            disabled={editingOrder?.status === OrderStatus.COMPLETED}
                            suffix="%"
                          />
                        </div>
                        <div className="col-span-1 text-right">
                          {ls.pct > 0 ? (
                            <p className="text-xs font-bold text-amber-700">− {ls.lineDiscount.toLocaleString()} ₫</p>
                          ) : (
                            <p className="text-xs text-gray-400">0 ₫</p>
                          )}
                        </div>
                        <div className="col-span-1 text-right">
                          <p className="text-sm font-bold text-indigo-700">{ls.lineAfterDisc.toLocaleString()} ₫</p>
                        </div>
                        <div className="col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.productId)}
                            disabled={editingOrder?.status === OrderStatus.COMPLETED}
                            className="text-red-500 hover:bg-red-50 p-1.5 rounded-md inline-flex disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Xóa khỏi giỏ"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Chiết khấu & Tổng thanh toán & Nút submit */}
          {(() => {
            const {
              goodsTotal,
              beforeLineDisc,
              lineDiscountTotal,
              orderDiscountPercent: pctDisplay,
              orderDiscountAmount,
              discountAmount,
              vatAmount,
              paymentTotal
            } = calculateTotals();
            const anyLineDiscount = lineDiscountTotal > 0;
            return (
              <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4 pt-2">
                {/* Khối Chiết khấu % + chi tiết tiền */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-amber-50/80 border-2 border-amber-300 rounded-xl p-4 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" /></svg>
                        CHIẾT KHẤU TOÀN BỘ ĐƠN
                      </h5>
                      <span className="text-xs font-medium text-amber-700/80 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200">
                        Tách biệt với CK từng SP • Mặc định 0%
                      </span>
                    </div>

                    {/* Hiển thị số % cực lớn */}
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-amber-800 mb-1.5">Tỷ lệ chiết khấu toàn đơn</label>
                        <div className="relative">
                          <NumberInput
                            value={discountPercent}
                            onChange={(v) => {
                              const clamped = Math.max(0, Math.min(100, v || 0));
                              setDiscountPercent(clamped);
                            }}
                            suffix="%"
                            placeholder="0"
                            className="w-full pl-4 pr-14 py-3.5 border-2 border-amber-400 rounded-xl bg-white text-4xl font-black text-amber-900 focus:ring-4 focus:ring-amber-200 focus:border-amber-600 tracking-tight shadow-inner"
                          />
                        </div>
                      </div>

                      {/* Hộp hiển thị tiền được giảm */}
                      <div className={`rounded-xl px-4 py-3 min-w-[180px] border-2 transition-all ${
                        pctDisplay > 0
                          ? 'bg-gradient-to-br from-amber-500 to-orange-500 border-amber-600 shadow-md shadow-amber-200'
                          : 'bg-white border-gray-200'
                      }`}>
                        <p className={`text-[11px] font-bold uppercase tracking-wide ${pctDisplay > 0 ? 'text-amber-50' : 'text-gray-400'}`}>
                          Giảm thêm (CK toàn đơn)
                        </p>
                        <p className={`text-xl font-black mt-0.5 ${pctDisplay > 0 ? 'text-white' : 'text-gray-500'}`}>
                          − {orderDiscountAmount.toLocaleString('vi-VN')} ₫
                        </p>
                        {pctDisplay > 0 && (
                          <p className="text-[11px] text-amber-100 mt-0.5 font-medium">
                            {pctDisplay}% × {goodsTotal.toLocaleString('vi-VN')} ₫
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Thanh trượt kéo dễ dàng */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800">
                        <span>Kéo thanh trượt để chọn %</span>
                        <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                          {discountPercent}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(Number(e.target.value))}
                        className="w-full h-3 bg-amber-200 rounded-full appearance-none cursor-pointer accent-amber-600"
                        style={{
                          background: `linear-gradient(to right, #d97706 0%, #d97706 ${discountPercent}%, #fde68a ${discountPercent}%, #fde68a 100%)`
                        }}
                      />
                      <div className="flex justify-between text-[10px] text-amber-700/60 font-medium px-0.5">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Các nút preset nhanh */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">
                        Chọn nhanh
                      </p>
                      <div className="grid grid-cols-8 gap-1.5">
                        {[0, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 75].map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setDiscountPercent(q)}
                            className={`px-2 py-2 rounded-lg text-sm font-black border-2 transition-all active:scale-95 ${
                              discountPercent === q
                                ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-600 shadow-md shadow-amber-200'
                                : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
                            }`}
                          >
                            {q}%
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Thông tin xác nhận áp dụng */}
                    <div className={`rounded-xl px-4 py-3 border-2 flex items-center gap-3 transition-all ${
                      pctDisplay > 0 || anyLineDiscount
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        pctDisplay > 0 || anyLineDiscount ? 'bg-green-500' : 'bg-gray-300'
                      }`}>
                        {pctDisplay > 0 || anyLineDiscount ? (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5"/>
                          </svg>
                        ) : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {anyLineDiscount ? (
                          <p className="text-xs text-green-700 font-semibold">
                            ✔ Đã có CK riêng trên sản phẩm ({lineDiscountTotal.toLocaleString('vi-VN')} ₫)
                          </p>
                        ) : null}
                        {pctDisplay > 0 ? (
                          <>
                            <p className="text-sm font-black text-green-800">
                              Đã áp dụng thêm CK toàn đơn {pctDisplay}%
                            </p>
                            <p className="text-xs text-green-700 font-medium">
                              Sau CK từng SP: {goodsTotal.toLocaleString('vi-VN')} ₫ → Còn {(goodsTotal - discountAmount).toLocaleString('vi-VN')} ₫
                            </p>
                          </>
                        ) : anyLineDiscount ? (
                          <>
                            <p className="text-sm font-black text-green-800">
                              Chỉ áp dụng CK riêng theo từng sản phẩm
                            </p>
                            <p className="text-xs text-green-700 font-medium">
                              Tổng ban đầu {beforeLineDisc.toLocaleString('vi-VN')} ₫ → Sau CK từng SP {goodsTotal.toLocaleString('vi-VN')} ₫
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-gray-600">
                              Chưa áp dụng chiết khấu
                            </p>
                            <p className="text-xs text-gray-500">
                              Có thể nhập CK riêng ở từng sản phẩm hoặc CK toàn đơn tại đây
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Chi tiết tính tiền */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 space-y-2">
                    <h5 className="text-sm font-bold text-blue-900 uppercase tracking-wide mb-1">Chi Tiết Tính Tiền</h5>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-700">Tổng tiền hàng (SL × Giá)</span>
                      <span className="font-semibold text-gray-800">{beforeLineDisc.toLocaleString('vi-VN')} ₫</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-amber-700 flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l9.2-9.2M17 17 7.8 7.8"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/></svg>
                        Chiết khấu theo từng SP
                      </span>
                      <span className="font-bold text-amber-700">− {lineDiscountTotal.toLocaleString('vi-VN')} ₫</span>
                    </div>
                    <div className="flex justify-between items-center text-sm pl-4 border-l-2 border-amber-200/60 ml-2">
                      <span className="text-gray-500 text-xs">→ Sau CK từng SP</span>
                      <span className="font-bold text-gray-700 text-xs">{goodsTotal.toLocaleString('vi-VN')} ₫</span>
                    </div>
                    {pctDisplay > 0 && (
                      <>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-orange-700 flex items-center gap-1.5">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/></svg>
                            Chiết khấu toàn đơn {pctDisplay}%
                          </span>
                          <span className="font-bold text-orange-700">− {orderDiscountAmount.toLocaleString('vi-VN')} ₫</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-700">Tiền thuế GTGT</span>
                      <span className="font-semibold text-gray-800">{vatAmount.toLocaleString('vi-VN')} ₫</span>
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-blue-300 to-transparent my-1" />
                    <div className="flex justify-between items-center pt-0.5">
                      <span className="text-sm font-bold text-blue-900 uppercase tracking-wide">Tổng tiền thanh toán</span>
                      <span className="text-2xl font-extrabold text-blue-700">{paymentTotal.toLocaleString('vi-VN')} ₫</span>
                    </div>
                    <p className="text-[11px] text-blue-600/80 italic mt-0.5">
                      = (Tổng hàng − CK từng SP) − CK toàn đơn + Thuế GTGT
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={processingOrder}
                  className="xl:w-[320px] h-[120px] px-7 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 font-semibold flex flex-col items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-95"
                >
                  {processingOrder && <Loader2 className="animate-spin" size={22} />}
                  {processingOrder ? (
                    <span className="text-base">Đang Xử Lý...</span>
                  ) : editingOrder ? (
                    <>
                      <span className="text-lg">💾 LƯU THAY ĐỔI ĐƠN</span>
                      <span className="text-[11px] opacity-80 uppercase tracking-wide">Tổng thanh toán {paymentTotal.toLocaleString('vi-VN')} ₫</span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg">✅ HOÀN TẤT ĐƠN HÀNG</span>
                      <span className="text-[11px] opacity-80 uppercase tracking-wide">Tổng thanh toán {paymentTotal.toLocaleString('vi-VN')} ₫</span>
                    </>
                  )}
                </button>
              </div>
            );
          })()}
        </form>
      </Modal>

      <Modal
        isOpen={isDetailOpen}
        onClose={() => { setIsDetailOpen(false); setDetailOrder(null); }}
        title="Chi Tiết Đơn Hàng"
        maxWidthClass="max-w-3xl"
      >
        {detailOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Mã Đơn</p>
                <p className="text-lg font-bold font-mono text-blue-700 mt-1">{detailOrder.id}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Trạng Thái</p>
                <div className="mt-1">{getStatusBadge(detailOrder.status)}</div>
              </div>
            </div>
            {detailOrder.cancelReason && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Lý do hủy:</p>
                <p className="text-sm text-red-600 mt-1">{detailOrder.cancelReason}</p>
              </div>
            )}
            <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Thông Tin Khách Hàng</p>
              <p className="font-semibold text-gray-800 mt-2">{detailOrder.customerName}</p>
              <p className="text-sm text-gray-600">📞 {detailOrder.customerPhone}</p>
              <p className="text-sm text-gray-600">📍 {detailOrder.address}</p>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {(() => {
                // Dùng lineStats reuseable tương tự
                const itemLineStats = (it: CartItem) => {
                  const qty = it.quantity;
                  const price = it.price || 0;
                  const pct = Math.max(0, Math.min(100, it.discountPercent ?? 0));
                  const subTotal = qty * price;
                  const lineDiscount = Math.round(subTotal * (pct / 100));
                  const lineAfterDisc = subTotal - lineDiscount;
                  return { qty, price, pct, subTotal, lineDiscount, lineAfterDisc };
                };
                const beforeLineDisc = detailOrder.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
                const lineDiscountTotal = detailOrder.items.reduce((sum, it) => sum + itemLineStats(it).lineDiscount, 0);
                const goodsTotal = beforeLineDisc - lineDiscountTotal;
                const pct = Math.max(0, Math.min(100, detailOrder.discountPercent ?? 0));
                const orderDiscountAmount = Math.round(goodsTotal * (pct / 100));
                const vatAmount = 0;
                const paymentTotal = goodsTotal - orderDiscountAmount + vatAmount;
                const anyLineDisc = lineDiscountTotal > 0;
                return (
                  <>
                    <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-800">Sản Phẩm ({detailOrder.items.length})</p>
                      <div className="flex items-center gap-2">
                        {anyLineDisc && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            🏷 CK riêng từng SP
                          </span>
                        )}
                        {pct > 0 && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                            🎁 CK toàn đơn {pct}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-12 text-[11px] font-bold uppercase text-gray-600 bg-gray-50/70 px-4 py-2 border-b border-gray-200">
                      <div className="col-span-1 text-center">STT</div>
                      <div className="col-span-3">Tên hàng</div>
                      <div className="col-span-1 text-center">ĐVT</div>
                      <div className="col-span-1 text-center">SL</div>
                      <div className="col-span-1 text-right">Đơn giá</div>
                      <div className="col-span-1 text-right">Thành tiền</div>
                      <div className="col-span-1 text-center">% CK</div>
                      <div className="col-span-1 text-right text-amber-700">Giảm</div>
                      <div className="col-span-2 text-right text-indigo-700">Sau CK</div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {detailOrder.items.map((it, idx) => {
                        const ls = itemLineStats(it);
                        return (
                          <div key={idx} className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-blue-50/40">
                            <div className="col-span-1 text-center text-xs text-gray-500 font-semibold">{idx + 1}</div>
                            <div className="col-span-3 text-sm text-gray-800 font-medium truncate">{it.name}</div>
                            <div className="col-span-1 text-center text-xs text-gray-600">{it.unit || 'Gói'}</div>
                            <div className="col-span-1 text-center text-sm font-semibold">{ls.qty}</div>
                            <div className="col-span-1 text-right text-xs text-gray-600">{ls.price.toLocaleString('vi-VN')} ₫</div>
                            <div className="col-span-1 text-right text-xs text-gray-600">{ls.subTotal.toLocaleString('vi-VN')} ₫</div>
                            <div className="col-span-1 text-center">
                              {ls.pct > 0 ? (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">
                                  {ls.pct}%
                                </span>
                              ) : (
                                <span className="text-[11px] text-gray-400">—</span>
                              )}
                            </div>
                            <div className="col-span-1 text-right">
                              {ls.pct > 0 ? (
                                <span className="text-xs font-bold text-amber-700">−{ls.lineDiscount.toLocaleString('vi-VN')}</span>
                              ) : (
                                <span className="text-[11px] text-gray-400">0</span>
                              )}
                            </div>
                            <div className="col-span-2 text-right text-sm font-bold text-indigo-700">{ls.lineAfterDisc.toLocaleString('vi-VN')} ₫</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="border-t-2 border-gray-200 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 space-y-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <p className="font-medium text-gray-700">Tổng tiền hàng (SL × Giá):</p>
                        <p className="font-semibold text-gray-800">{beforeLineDisc.toLocaleString('vi-VN')} ₫</p>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <p className="font-medium text-amber-700">Chiết khấu theo từng SP:</p>
                        <p className="font-bold text-amber-700">− {lineDiscountTotal.toLocaleString('vi-VN')} ₫</p>
                      </div>
                      <div className="flex justify-between items-center text-xs pl-4 border-l-2 border-amber-200/60 ml-2">
                        <p className="text-gray-500">→ Sau CK từng SP</p>
                        <p className="font-bold text-gray-700">{goodsTotal.toLocaleString('vi-VN')} ₫</p>
                      </div>
                      {pct > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <p className="font-medium text-orange-700">Chiết khấu toàn đơn ({pct}%):</p>
                          <p className="font-bold text-orange-700">− {orderDiscountAmount.toLocaleString('vi-VN')} ₫</p>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm">
                        <p className="font-medium text-gray-700">Tiền thuế GTGT:</p>
                        <p className="font-semibold text-gray-800">{vatAmount.toLocaleString('vi-VN')} ₫</p>
                      </div>
                      <div className="h-px bg-blue-300/60 my-1.5" />
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-bold text-blue-900 uppercase tracking-wide">Tổng tiền thanh toán:</p>
                        <p className="text-xl font-extrabold text-blue-700">{paymentTotal.toLocaleString('vi-VN')} ₫</p>
                      </div>
                      <div className="mt-1 pt-2 border-t border-blue-200/70">
                        <p className="text-xs text-blue-900/80">
                          <strong>Bằng chữ:</strong> <em>{numberToVietnamese(paymentTotal)}</em>
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex justify-end pt-2 gap-2">
              <button
                type="button"
                onClick={() => printInvoice(detailOrder)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm font-medium flex items-center gap-2"
              >
                <Printer size={16} />
                In hóa đơn
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
