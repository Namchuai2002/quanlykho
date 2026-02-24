import React, { useState, useEffect, useRef } from 'react';
import { MockBackend } from '../services/mockBackend';
import { Product, Category, Order, OrderStatus } from '../types';
import { Search, Plus, Trash2, Edit2, Archive, Loader2, Image as ImageIcon, Filter, Tags, X, UploadCloud, Eye, PackagePlus } from 'lucide-react';
import { Modal } from '../components/Modal';
import { ImportRecord, ExportRecord } from '../types';

export const Inventory: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStock, setFilterStock] = useState('all'); // all, low, out

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;
  
  // Import modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importProduct, setImportProduct] = useState<Product | null>(null);
  const [importForm, setImportForm] = useState({ quantity: 1, unitCost: 0, note: '', supplierName: '', paidNow: false });
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [notice, setNotice] = useState<string>('');
  const [orders, setOrders] = useState<Order[]>([]);

  // Category Manage Input
  const [newCategoryName, setNewCategoryName] = useState('');

  // Image Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    price: 0,
    stock: 0,
    category: '',
    image: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [pData, cData, iData, eData, oData] = await Promise.all([
        MockBackend.getProducts(),
        MockBackend.getCategories(),
        MockBackend.getImports(),
        MockBackend.getExports(),
        MockBackend.getOrders()
      ]);
      setProducts(pData);
      setCategories(cData);
      setImports(iData);
      setExports(eData);
      setOrders(oData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const oData = await MockBackend.getOrders();
        setOrders(oData);
      } catch {}
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterCategory, filterStock, products]);

  // --- LOGIC LỌC SẢN PHẨM ---
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory ? p.category === filterCategory : true;
    
    let matchesStock = true;
    if (filterStock === 'low') matchesStock = p.stock > 0 && p.stock < 10;
    if (filterStock === 'out') matchesStock = p.stock === 0;
    if (filterStock === 'in') matchesStock = p.stock >= 10;

    return matchesSearch && matchesCategory && matchesStock;
  });

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PER_PAGE));
  const visibleProducts = filteredProducts.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const totalCount = filteredProducts.length;
  const dangerCount = filteredProducts.filter(p => p.stock > 0 && p.stock < 5).length;
  const lowCount = filteredProducts.filter(p => p.stock >= 5 && p.stock < 10).length;
  const inCount = filteredProducts.filter(p => p.stock >= 10).length;
  const outCount = filteredProducts.filter(p => p.stock === 0).length;
  
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
  const totalReserved = Array.from(reservedMap.values()).reduce((a, b) => a + b, 0);

  // --- XỬ LÝ ẢNH ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Nén ảnh đơn giản bằng Canvas để giảm dung lượng
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const MAX_WIDTH = 800;
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7); // Chất lượng 70%
          setFormData(prev => ({ ...prev, image: compressedBase64 }));
        };
      };
      reader.readAsDataURL(file);
    }
  };

  // --- XỬ LÝ SẢN PHẨM ---
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Nếu chưa chọn danh mục, gán mặc định nếu có
      const finalData = {
        ...formData,
        category: formData.category || (categories.length > 0 ? categories[0].name : 'Chưa phân loại')
      };

      if (editingProduct) {
        await MockBackend.updateProduct({ ...editingProduct, ...finalData });
      } else {
        await MockBackend.addProduct(finalData);
      }
      await loadData();
      closeProductModal();
    } catch (e) {
      alert("Lỗi khi lưu. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Bạn có chắc muốn xóa sản phẩm này?')) {
      await MockBackend.deleteProduct(id);
      await loadData();
    }
  };
  
  // --- NHẬP HÀNG ---
  const openImportModal = (product: Product) => {
    setImportProduct(product);
    setImportForm({ quantity: 1, unitCost: 0, note: '', supplierName: '', paidNow: false });
    setIsImportModalOpen(true);
  };
  const closeImportModal = () => {
    setIsImportModalOpen(false);
    setImportProduct(null);
  };
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importProduct) return;
    try {
      setSaving(true);
      await MockBackend.importStock(
        importProduct.id,
        importForm.quantity,
        importForm.unitCost || undefined,
        importForm.note || undefined,
        importForm.supplierName || undefined,
        importForm.paidNow || false
      );
      await loadData();
      closeImportModal();
      setNotice(`Đã nhập +${importForm.quantity} cho "${importProduct.name}"`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      alert("Lỗi nhập hàng. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  // --- XỬ LÝ DANH MỤC ---
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setSaving(true);
    await MockBackend.addCategory(newCategoryName);
    setNewCategoryName('');
    const newCats = await MockBackend.getCategories();
    setCategories(newCats);
    setSaving(false);
  };

  const handleDeleteCategory = async (id: string) => {
    if (confirm('Xóa danh mục này? Các sản phẩm thuộc danh mục này sẽ giữ nguyên tên danh mục cũ.')) {
      await MockBackend.deleteCategory(id);
      const newCats = await MockBackend.getCategories();
      setCategories(newCats);
    }
  };

  // --- MODAL CONTROLS ---
  const openAddProductModal = () => {
    setEditingProduct(null);
    setFormData({ 
      name: '', sku: '', price: 0, stock: 0, 
      category: categories.length > 0 ? categories[0].name : '', 
      image: '' 
    });
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      price: product.price,
      stock: product.stock,
      category: product.category,
      image: product.image || '',
    });
    setIsProductModalOpen(true);
  };

  const closeProductModal = () => {
    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded shadow">
          {notice}
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-gray-800">Quản Lý Kho Hàng</h2>
           <p className="text-sm text-gray-500 mt-1">Tổng: {filteredProducts.length} sản phẩm</p>
        </div>
        <div className="flex space-x-2">
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm transition-all"
          >
            <Tags size={18} />
            <span className="hidden sm:inline">QL Danh Mục</span>
          </button>
          <button 
            onClick={openAddProductModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Thêm Sản Phẩm</span>
          </button>
        </div>
      </div>

      {/* --- FILTER BAR --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
         <div className="md:col-span-5 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Tìm tên hoặc mã SKU..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         
         <div className="md:col-span-3">
            <select 
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">-- Tất cả danh mục --</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
         </div>

         <div className="md:col-span-3">
             <select 
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
            >
              <option value="all">-- Tất cả trạng thái --</option>
              <option value="in">Còn hàng nhiều (10+)</option>
              <option value="low">Sắp hết (&lt; 10)</option>
              <option value="out">Hết hàng (0)</option>
            </select>
         </div>
         
         <div className="md:col-span-1 text-center">
            <button 
              onClick={() => { setSearchTerm(''); setFilterCategory(''); setFilterStock('all'); }}
              className="text-gray-400 hover:text-gray-600" title="Xóa bộ lọc"
            >
              <Filter size={20} />
            </button>
         </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Tổng sản phẩm</p>
          <p className="text-lg font-bold text-gray-800">{totalCount}</p>
        </div>
        <div className="bg-white border border-emerald-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Còn hàng (≥10)</p>
          <p className="text-lg font-bold text-emerald-700">{inCount}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Sắp hết (5–9)</p>
          <p className="text-lg font-bold text-amber-700">{lowCount}</p>
        </div>
        <div className="bg-white border border-red-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Nguy hiểm (1–4)</p>
          <p className="text-lg font-bold text-red-700">{dangerCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Hết hàng (0)</p>
          <p className="text-lg font-bold text-gray-700">{outCount}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Sắp xuất (đơn chưa hoàn thành)</p>
          <p className="text-lg font-bold text-amber-700">{totalReserved}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="animate-spin text-blue-600" size={32} />
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4">Ảnh</th>
                  <th className="px-6 py-4">Tên Sản Phẩm</th>
                  <th className="px-6 py-4">Mã SKU</th>
                  <th className="px-6 py-4">Danh Mục</th>
                  <th className="px-6 py-4 text-right">Giá Bán</th>
                  <th className="px-6 py-4 text-center">Tồn Kho</th>
                  <th className="px-6 py-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.length > 0 ? (
                  visibleProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        {product.image ? (
                          <img 
                            src={product.image} 
                            alt={product.name} 
                            className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/60?text=x';
                            }}
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400">
                            <ImageIcon size={20} />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-800">{product.name}</td>
                      <td className="px-6 py-4 text-gray-500 text-sm">{product.sku}</td>
                      <td className="px-6 py-4 text-gray-500 text-sm">
                        <span className="px-2 py-1 bg-gray-100 rounded-md">{product.category}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-800">{product.price.toLocaleString()} ₫</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          product.stock === 0 ? 'bg-gray-200 text-gray-700' :
                          product.stock < 5 ? 'bg-red-100 text-red-700' :
                          product.stock < 10 ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {product.stock}
                        </span>
                        {reservedMap.get(product.id) ? (
                          <span className="block text-[11px] text-amber-600 mt-1">Sắp xuất: {reservedMap.get(product.id)}</span>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => { setDetailProduct(product); setIsDetailOpen(true); }}
                            className="p-1.5 text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => openImportModal(product)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                            title="Nhập hàng"
                          >
                            <PackagePlus size={16} />
                          </button>
                          <button 
                            onClick={() => openEditProductModal(product)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteProduct(product.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                      <Archive size={48} className="mx-auto mb-3 opacity-20" />
                      <p>Không tìm thấy sản phẩm nào phù hợp.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
            <div className="text-sm text-gray-500">
              Trang {page} / {totalPages}
            </div>
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

      {/* --- PRODUCT MODAL --- */}
      <Modal 
        isOpen={isProductModalOpen} 
        onClose={closeProductModal} 
        title={editingProduct ? "Cập Nhật Sản Phẩm" : "Thêm Sản Phẩm Mới"}
      >
        <form onSubmit={handleSubmitProduct} className="space-y-4">
          {/* Image Upload Area */}
          <div className="flex justify-center mb-4">
            <div 
              className="relative w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-blue-400 transition-colors group overflow-hidden"
              onClick={() => fileInputRef.current?.click()}
            >
               {formData.image ? (
                  <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
               ) : (
                  <>
                    <UploadCloud className="text-gray-400 group-hover:text-blue-500 mb-1" size={24} />
                    <span className="text-xs text-gray-500 group-hover:text-blue-600">Tải ảnh lên</span>
                  </>
               )}
               <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
               />
               {formData.image && (
                 <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-medium">Thay đổi</span>
                 </div>
               )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên Sản Phẩm</label>
            <input 
              required
              type="text" 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mã SKU</label>
              <input 
                required
                type="text" 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.sku}
                onChange={(e) => setFormData({...formData, sku: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Danh Mục</label>
              <select 
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
              >
                <option value="">-- Chọn danh mục --</option>
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giá Bán (VNĐ)</label>
              <input 
                required
                type="number" 
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số Lượng Tồn</label>
              <input 
                required
                type="number" 
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.stock}
                onChange={(e) => setFormData({...formData, stock: Number(e.target.value)})}
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button 
              type="button" 
              onClick={closeProductModal}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition-colors flex items-center gap-2"
            >
              {saving && <Loader2 className="animate-spin" size={16} />}
              {saving ? 'Đang Lưu...' : 'Lưu Thông Tin'}
            </button>
          </div>
        </form>
      </Modal>
      
      {/* --- IMPORT MODAL --- */}
      <Modal 
        isOpen={isImportModalOpen} 
        onClose={closeImportModal} 
        title="Nhập Hàng"
      >
        <form onSubmit={handleImportSubmit} className="space-y-4">
          {importProduct && (
            <div className="bg-indigo-50 border border-indigo-100 rounded p-3 text-sm">
              <p className="font-semibold text-indigo-700">{importProduct.name}</p>
              <p className="text-indigo-600">SKU: {importProduct.sku} • Tồn hiện tại: {importProduct.stock}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng nhập</label>
              <input 
                required
                type="number" 
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={importForm.quantity}
                onChange={(e) => setImportForm({...importForm, quantity: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giá nhập (VNĐ)</label>
              <input 
                type="number" 
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={importForm.unitCost}
                onChange={(e) => setImportForm({...importForm, unitCost: Number(e.target.value)})}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label>
              <input 
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={importForm.supplierName}
                onChange={(e) => setImportForm({...importForm, supplierName: e.target.value})}
              />
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input 
                  type="checkbox" 
                  checked={importForm.paidNow}
                  onChange={(e)=>setImportForm({...importForm, paidNow: e.target.checked})}
                />
                Đã thanh toán ngay
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={importForm.note}
              onChange={(e) => setImportForm({...importForm, note: e.target.value})}
              rows={3}
              placeholder="Ví dụ: Nhập từ nhà cung cấp A"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={closeImportModal} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2">
              {saving && <Loader2 className="animate-spin" size={16} />}
              {saving ? 'Đang nhập...' : 'Nhập Hàng'}
            </button>
          </div>
        </form>
      </Modal>
      
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => { setIsDetailOpen(false); setDetailProduct(null); }} 
        title="Chi Tiết Sản Phẩm"
      >
        {detailProduct && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-24 h-24 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                {detailProduct.image ? <img src={detailProduct.image} className="object-cover w-full h-full" /> : <ImageIcon className="text-gray-400" />}
              </div>
              <div className="flex-1">
                <p className="text-lg font-bold text-gray-800">{detailProduct.name}</p>
                <p className="text-sm text-gray-500">SKU: {detailProduct.sku}</p>
                <p className="text-sm text-gray-500">Danh mục: {detailProduct.category}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-500">Giá bán</p>
                <p className="text-xl font-bold text-blue-600">{detailProduct.price.toLocaleString()} ₫</p>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-500">Tồn kho</p>
                <p className="text-xl font-bold text-gray-800">{detailProduct.stock}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded p-3">
                <p className="font-semibold text-gray-800 mb-2">Lịch sử nhập</p>
                {imports.filter(i => i.productId === detailProduct.id).length === 0 ? (
                  <p className="text-sm text-gray-500">Chưa có lịch sử nhập cho sản phẩm này.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {imports.filter(i => i.productId === detailProduct.id).slice(0, 20).map(rec => (
                      <div key={rec.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-600">{new Date(rec.createdAt).toLocaleString('vi-VN')} • {rec.note || '—'}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-emerald-700">+{rec.quantity}</span>
                          {typeof rec.totalCost === 'number' && (
                            <span className="block text-[10px] text-gray-600">{rec.totalCost.toLocaleString()} ₫</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white border border-gray-200 rounded p-3">
                <p className="font-semibold text-gray-800 mb-2">Lịch sử xuất</p>
                {exports.filter(e => e.productId === detailProduct.id).length === 0 ? (
                  <p className="text-sm text-gray-500">Chưa có lịch sử xuất cho sản phẩm này.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {exports.filter(e => e.productId === detailProduct.id).slice(0, 20).map(rec => (
                      <div key={rec.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-600">{new Date(rec.createdAt).toLocaleString('vi-VN')} • Đơn {rec.orderId} • {rec.customerName}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-red-700">-{rec.quantity}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* --- CATEGORY MANAGE MODAL --- */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Quản Lý Danh Mục"
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Tên danh mục mới..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <button 
              onClick={handleAddCategory}
              disabled={saving || !newCategoryName.trim()}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              Thêm
            </button>
          </div>

          <div className="bg-gray-50 rounded-lg p-2 max-h-60 overflow-y-auto space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="flex justify-between items-center bg-white p-3 rounded shadow-sm border border-gray-100">
                <span className="font-medium text-gray-700">{cat.name}</span>
                <button 
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-center text-gray-400 py-4 text-sm">Chưa có danh mục nào.</p>
            )}
          </div>
        </div>
      </Modal>
      
      {/* --- LỊCH SỬ NHẬP HÀNG --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Lịch Sử Nhập Hàng</h3>
        {imports.length === 0 ? (
          <p className="text-gray-500 text-sm">Chưa có lịch sử nhập hàng.</p>
        ) : (
          <div className="space-y-2">
            {imports.slice(0, 20).map(rec => (
              <div key={rec.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{rec.name} <span className="text-gray-500">({rec.sku})</span></p>
                  <p className="text-xs text-gray-500">{new Date(rec.createdAt).toLocaleString('vi-VN')} • {rec.note || '—'}</p>
                </div>
                <div className="text-right">
                  <span className="block text-sm font-bold text-emerald-700">+{rec.quantity}</span>
                  {typeof rec.totalCost === 'number' && (
                    <span className="text-[10px] text-gray-600">{rec.totalCost.toLocaleString()} ₫</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* --- LỊCH SỬ XUẤT KHO --- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Lịch Sử Xuất Kho</h3>
        {exports.length === 0 ? (
          <p className="text-gray-500 text-sm">Chưa có lịch sử xuất kho.</p>
        ) : (
          <div className="space-y-2">
            {exports.slice(0, 20).map(rec => (
              <div key={rec.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{rec.name} <span className="text-gray-500">({rec.sku})</span></p>
                  <p className="text-xs text-gray-500">{new Date(rec.createdAt).toLocaleString('vi-VN')} • Đơn {rec.orderId} • {rec.customerName} ({rec.customerPhone})</p>
                </div>
                <div className="text-right">
                  <span className="block text-sm font-bold text-red-700">-{rec.quantity}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
