import React, { useState, useEffect } from 'react';
import { MockBackend } from '../services/mockBackend';
import { Order, OrderStatus, Product, CartItem, Customer } from '../types';
import { Search, Plus, Eye, CheckCircle, Truck, XCircle, Clock, Loader2, Edit2, Trash2 } from 'lucide-react';
import { Modal } from '../components/Modal';

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
  const [newOrderNote, setNewOrderNote] = useState('');

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

  // --- Cart Logic ---
  const addToCart = () => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (product.stock <= 0) {
      alert("Sản phẩm này đã hết hàng!");
      return;
    }

    const existingItem = cart.find(item => item.productId === selectedProductId);
    if (existingItem) {
      const newQty = existingItem.quantity + newOrderQuantity;
      if (newQty > product.stock) {
        alert(`Chỉ còn ${product.stock} sản phẩm trong kho.`);
        return;
      }
      setCart(cart.map(item => item.productId === selectedProductId ? { ...item, quantity: newQty } : item));
    } else {
      if (newOrderQuantity > product.stock) {
        alert(`Chỉ còn ${product.stock} sản phẩm trong kho.`);
        return;
      }
      setCart([...cart, { productId: product.id, name: product.name, price: product.price, quantity: newOrderQuantity }]);
    }
    setSelectedProductId('');
    setNewOrderQuantity(1);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert("Vui lòng thêm sản phẩm vào đơn hàng.");
      return;
    }
    setProcessingOrder(true);

    try {
      await MockBackend.createOrder({
        customerName: newOrderCustomer.name,
        customerPhone: newOrderCustomer.phone,
        address: newOrderCustomer.address,
        totalAmount: calculateTotal(),
        status: OrderStatus.PENDING,
        note: newOrderNote,
        items: cart,
      });
      if (!selectedCustomerId && saveNewCustomer) {
        await MockBackend.addCustomer(newOrderCustomer.name, newOrderCustomer.phone, newOrderCustomer.address);
      }
      
      // Refresh Data
      await loadData();
      
      // Reset & Close
      setNewOrderCustomer({ name: '', phone: '', address: '' });
      setCart([]);
      setNewOrderNote('');
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
          onClick={() => setIsModalOpen(true)}
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
                  <th className="px-6 py-4">Chú Thích</th>
                  <th className="px-6 py-4">Trạng Thái</th>
                  <th className="px-6 py-4 text-right">Cập Nhật</th>
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
                    <td className="px-6 py-4 text-sm text-gray-700">{order.note || '—'}</td>
                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        className="p-1.5 text-gray-700 hover:bg-gray-50 rounded-md mr-2"
                        onClick={() => { setDetailOrder(order); setIsDetailOpen(true); }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-md mr-2"
                        title="Xóa đơn hàng"
                        onClick={() => handleDeleteOrder(order.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        className="p-1.5 text-gray-700 hover:bg-gray-50 rounded-md mr-2"
                        title="Thêm/Sửa chú thích"
                        onClick={async () => {
                          const note = prompt('Nhập chú thích cho đơn:', order.note || '') ?? undefined;
                          if (typeof note !== 'undefined') {
                            await MockBackend.updateOrderNote(order.id, note);
                            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, note } : o));
                          }
                        }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <div className="relative inline-block">
                        <button
                          className="px-2 py-1.5 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 inline-flex items-center gap-1"
                          onClick={() => setOpenMenuFor(id => id === order.id ? null : order.id)}
                          disabled={order.status === OrderStatus.COMPLETED}
                          title="Cập nhật trạng thái"
                        >
                          <Edit2 size={14} />
                          <span className="text-xs">Chỉnh sửa</span>
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

      {/* New Order Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Tạo Đơn Hàng Mới"
      >
        <form onSubmit={handleCreateOrder} className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên Khách Hàng</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={newOrderCustomer.name}
                onChange={(e) => setNewOrderCustomer({...newOrderCustomer, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số Điện Thoại</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={newOrderCustomer.phone}
                onChange={(e) => setNewOrderCustomer({...newOrderCustomer, phone: e.target.value})}
              />
            </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Địa Chỉ</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={newOrderCustomer.address}
                  onChange={(e) => setNewOrderCustomer({...newOrderCustomer, address: e.target.value})}
                />
              </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chọn Khách Hàng Có Sẵn</label>
            <div className="flex gap-2">
              <select 
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input 
                  type="checkbox" 
                  checked={saveNewCustomer} 
                  onChange={(e) => setSaveNewCustomer(e.target.checked)} 
                />
                Lưu khách mới
              </label>
            </div>
          </div>

          <div className="border-t border-b border-gray-100 py-4">
            <h4 className="text-sm font-bold text-gray-700 mb-3">Chọn Sản Phẩm</h4>
            <div className="flex gap-2 mb-3">
              <select 
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                <option value="">-- Chọn sản phẩm --</option>
                {products.filter(p => p.stock > 0).map(p => {
                  const rv = reservedMap.get(p.id) || 0;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.price.toLocaleString()}đ (Còn: {p.stock} • Sắp xuất: {rv})
                    </option>
                  );
                })}
              </select>
              <input 
                type="number"
                min={1}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={newOrderQuantity}
                onChange={(e) => setNewOrderQuantity(Math.max(1, Number(e.target.value)))}
              />
              <button 
                type="button"
                onClick={addToCart}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
              >
                Thêm
              </button>
            </div>

            {/* Cart Items */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
              {cart.length === 0 ? (
                <p className="text-center text-gray-400 text-sm">Chưa có sản phẩm nào</p>
              ) : (
                cart.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.price.toLocaleString()} x {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        min={1}
                        className="w-20 px-2 py-1 border border-gray-300 rounded"
                        value={item.quantity}
                        onChange={(e) => {
                          const q = Math.max(1, Number(e.target.value));
                          const product = products.find(p => p.id === item.productId);
                          if (product && q > product.stock) {
                            alert(`Chỉ còn ${product.stock} sản phẩm trong kho.`);
                            return;
                          }
                          setCart(cart.map(ci => ci.productId === item.productId ? { ...ci, quantity: q } : ci));
                        }}
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      className="text-red-500 hover:bg-red-50 p-1 rounded"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Chú Thích Đơn</label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={newOrderNote}
              onChange={(e) => setNewOrderNote(e.target.value)}
              placeholder="Ví dụ: Giao buổi tối, gọi trước khi giao..."
            />
          </div>

          <div className="flex justify-between items-center pt-2">
            <div>
              <p className="text-sm text-gray-500">Tổng thanh toán</p>
              <p className="text-2xl font-bold text-blue-600">{calculateTotal().toLocaleString()} ₫</p>
            </div>
            <button 
              type="submit" 
              disabled={processingOrder}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md font-medium flex items-center gap-2"
            >
              {processingOrder && <Loader2 className="animate-spin" size={20} />}
              {processingOrder ? 'Đang Xử Lý...' : 'Hoàn Tất Đơn Hàng'}
            </button>
          </div>
        </form>
      </Modal>
      
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => { setIsDetailOpen(false); setDetailOrder(null); }} 
        title="Chi Tiết Đơn Hàng"
      >
        {detailOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-500">Mã Đơn</p>
                <p className="text-lg font-bold">{detailOrder.id}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-500">Trạng Thái</p>
                <p className="text-lg font-bold">{detailOrder.status}</p>
              </div>
            </div>
            {detailOrder.cancelReason && (
              <div className="bg-red-50 border border-red-100 rounded p-3">
                <p className="text-sm text-red-700">Lý do hủy:</p>
                <p className="text-sm text-red-600">{detailOrder.cancelReason}</p>
              </div>
            )}
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-500">Khách Hàng</p>
              <p className="font-medium text-gray-800">{detailOrder.customerName}</p>
              <p className="text-sm text-gray-500">{detailOrder.customerPhone}</p>
              <p className="text-sm text-gray-500">{detailOrder.address}</p>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Sản Phẩm</p>
              <div className="space-y-2">
                {detailOrder.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between bg-white border rounded p-2">
                    <span className="text-sm">{it.name}</span>
                    <span className="text-sm text-gray-600">{it.price.toLocaleString()} x {it.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="text-right font-bold text-blue-600 mt-2">
                Tổng: {detailOrder.totalAmount.toLocaleString()} ₫
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
