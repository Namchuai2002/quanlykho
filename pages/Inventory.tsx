import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MockBackend } from '../services/mockBackend';
import { Product, Category, Order, OrderStatus, ImportPaymentStatus, ImportLineItem, PaymentRecord } from '../types';
import { Search, Plus, Trash2, Edit2, Archive, Loader2, Image as ImageIcon, Filter, Tags, X, UploadCloud, Eye, PackagePlus, ChevronDown, PackageMinus, CheckCircle, XCircle, FileText, Clock, User, ChevronRight, Calendar } from 'lucide-react';
import { Modal } from '../components/Modal';
import { NumberInput } from '../components/NumberInput';
import { ImportRecord, ExportRecord } from '../types';
import { DebtService } from '../services/debtService';

type ImportViewMode = 'bySupplier' | 'bySlip';
type PayStatus = 'unpaid' | 'partial' | 'paid';
type SupplierDetailTab = 'overview' | 'history';

interface SupplierImportGroup {
  key: string;
  name: string;
  slipCount: number;
  itemCount: number;
  quantity: number;
  total: number;
  paid: number;
  outstanding: number;
  latestAt: string;
  importIds: string[];
}

const supplierKeyOf = (name: string) => (name || '').trim().toLowerCase() || 'unknown';

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
  const [viewingImport, setViewingImport] = useState<ImportRecord | null>(null);
  const [importForm, setImportForm] = useState<{
    supplierName: string;
    paymentStatus: ImportPaymentStatus | null;
  }>({ supplierName: '', paymentStatus: null });
  const [importLines, setImportLines] = useState<(ImportLineItem & { tempId: string })[]>([]);
  const [importFormError, setImportFormError] = useState('');
  const [importRequestId, setImportRequestId] = useState('');
  const importSubmittingRef = useRef(false);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [notice, setNotice] = useState<string>('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [importListSearch, setImportListSearch] = useState('');
  const [importListStatus, setImportListStatus] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [inventoryTab, setInventoryTab] = useState<'stock' | 'imports'>('stock');
  const [importViewMode, setImportViewMode] = useState<ImportViewMode>('bySupplier');
  const [supplierDetailOpen, setSupplierDetailOpen] = useState(false);
  const [selectedSupplierKey, setSelectedSupplierKey] = useState<string | null>(null);
  const [supplierReturnKey, setSupplierReturnKey] = useState<string | null>(null);
  const [supplierDetailTab, setSupplierDetailTab] = useState<SupplierDetailTab>('overview');
  const [expandedImportIds, setExpandedImportIds] = useState<Set<string>>(new Set());
  const [supplierSlipSearch, setSupplierSlipSearch] = useState('');
  const [supplierSlipStatus, setSupplierSlipStatus] = useState<'all' | PayStatus>('all');

  // Category Manage Input
  const [newCategoryName, setNewCategoryName] = useState('');

  // Image Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    stock: 0,
    category: '',
    image: '',
  });
  const [importPickerSearch, setImportPickerSearch] = useState('');
  const [importPickerCategory, setImportPickerCategory] = useState('');
  const [expandedHistoryProductId, setExpandedHistoryProductId] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pData, cData, iData, eData, oData, payData] = await Promise.all([
        MockBackend.getProducts(),
        MockBackend.getCategories(),
        MockBackend.getImports(),
        MockBackend.getExports(),
        MockBackend.getOrders(),
        MockBackend.getPayments(),
      ]);
      setProducts(pData);
      setCategories(cData);
      setImports(iData);
      setExports(eData);
      setOrders(oData);
      setPayments(payData);
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
      // Giá bán không cố định ở kho (mỗi đơn hàng khác nhau), mặc định 0 và nhập thủ công khi tạo đơn
      const finalData = {
        ...formData,
        price: 0,
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
  
  const formatMoney = (n: number) => Math.round(n || 0).toLocaleString('vi-VN');

  const newImportRequestId = () =>
    `IMP${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(2, 6)}`;

  const addProductToImport = (product: Product) => {
    setImportLines((prev) => {
      const found = prev.find((l) => l.productId === product.id);
      if (found) {
        return prev.map((l) =>
          l.productId === product.id
            ? { ...l, quantity: l.quantity + 1, totalCost: (l.quantity + 1) * l.unitCost }
            : l,
        );
      }
      return [
        ...prev,
        {
          tempId: `${product.id}_${Date.now()}`,
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: 1,
          unitCost: 0,
          totalCost: 0,
        },
      ];
    });
    setImportFormError('');
  };

  const updateImportLine = (tempId: string, patch: Partial<ImportLineItem>) => {
    setImportLines((prev) =>
      prev.map((l) => {
        if (l.tempId !== tempId) return l;
        const next = { ...l, ...patch };
        next.totalCost = (next.quantity || 0) * (next.unitCost || 0);
        return next;
      }),
    );
  };

  const removeImportLine = (tempId: string) => {
    setImportLines((prev) => prev.filter((l) => l.tempId !== tempId));
  };

  const resetImportForm = () => {
    setImportForm({ supplierName: '', paymentStatus: null });
    setImportLines([]);
    setImportFormError('');
    setViewingImport(null);
    setImportRequestId(newImportRequestId());
    setImportPickerSearch('');
    setImportPickerCategory('');
  };

  const openImportWorkspace = (product?: Product) => {
    setInventoryTab('imports');
    setSupplierReturnKey(null);
    resetImportForm();
    if (product) addProductToImport(product);
    setIsImportModalOpen(true);
  };

  const openImportModal = (product: Product) => {
    openImportWorkspace(product);
  };

  const closeImportModal = () => {
    setIsImportModalOpen(false);
    setViewingImport(null);
    setImportFormError('');
    importSubmittingRef.current = false;
    if (supplierReturnKey) {
      setSelectedSupplierKey(supplierReturnKey);
      setSupplierDetailOpen(true);
      setSupplierDetailTab('history');
    }
  };

  const openImportSlip = (imp: ImportRecord) => {
    setViewingImport(imp);
    const paid = DebtService.computePaidForImport(imp, payments);
    const total = typeof imp.totalCost === 'number' ? imp.totalCost : 0;
    const inferred: ImportPaymentStatus =
      imp.paymentStatus === 'paid' || (paid >= total && total > 0)
        ? 'paid'
        : 'unpaid';
    setImportForm({
      supplierName: imp.supplierName || '',
      paymentStatus: inferred,
    });
    setImportLines(
      DebtService.getImportLineItems(imp).map((l, idx) => ({
        ...l,
        tempId: `${imp.id}_${idx}`,
      })),
    );
    setImportFormError('');
    setIsImportModalOpen(true);
  };

  const importSlipPreview = useMemo(() => {
    if (viewingImport) {
      const total = typeof viewingImport.totalCost === 'number'
        ? viewingImport.totalCost
        : importLines.reduce((s, l) => s + l.totalCost, 0);
      const paid = DebtService.computePaidForImport(viewingImport, payments);
      return { total, paid, outstanding: Math.max(0, total - paid), count: importLines.length };
    }
    const total = importLines.reduce((s, l) => s + l.totalCost, 0);
    const paid = importForm.paymentStatus === 'paid' ? total : 0;
    return { total, paid, outstanding: Math.max(0, total - paid), count: importLines.length };
  }, [importLines, importForm.paymentStatus, viewingImport, payments]);

  const openSupplierDetail = (group: SupplierImportGroup) => {
    setSelectedSupplierKey(group.key);
    setSupplierDetailTab('overview');
    setExpandedImportIds(new Set());
    setSupplierSlipSearch('');
    setSupplierSlipStatus('all');
    setSupplierDetailOpen(true);
  };

  const openImportSlipFromSupplier = (imp: ImportRecord) => {
    setSupplierReturnKey(selectedSupplierKey);
    setSupplierDetailOpen(false);
    openImportSlip(imp);
  };

  const supplierGroups: SupplierImportGroup[] = useMemo(() => {
    const payables = DebtService.computePayables(imports, payments);
    const payableById = new Map(payables.map((p) => [p.id, p]));
    const map = new Map<string, SupplierImportGroup>();
    for (const imp of imports) {
      const name = (imp.supplierName || '').trim() || 'Nhà cung cấp';
      const key = supplierKeyOf(name);
      const p = payableById.get(imp.id);
      const total = p?.total ?? (imp.totalCost || 0);
      const paid = p?.paid ?? (imp.paidAmount || 0);
      const outstanding = p?.outstanding ?? Math.max(0, total - paid);
      const lines = DebtService.getImportLineItems(imp);
      const qty = lines.reduce((s, l) => s + l.quantity, 0);
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          key,
          name,
          slipCount: 1,
          itemCount: lines.length,
          quantity: qty,
          total,
          paid,
          outstanding,
          latestAt: imp.createdAt,
          importIds: [imp.id],
        });
      } else {
        cur.slipCount += 1;
        cur.itemCount += lines.length;
        cur.quantity += qty;
        cur.total += total;
        cur.paid += paid;
        cur.outstanding += outstanding;
        cur.importIds.push(imp.id);
        if (new Date(imp.createdAt).getTime() > new Date(cur.latestAt).getTime()) {
          cur.latestAt = imp.createdAt;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
    );
  }, [imports, payments]);

  const selectedSupplier = useMemo(
    () => supplierGroups.find((g) => g.key === selectedSupplierKey),
    [supplierGroups, selectedSupplierKey],
  );

  const selectedSupplierImports = useMemo(() => {
    if (!selectedSupplier) return [] as ImportRecord[];
    const ids = new Set(selectedSupplier.importIds);
    return imports
      .filter((imp) => ids.has(imp.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [imports, selectedSupplier]);

  const importPayStatusBadge = (s: 'unpaid' | 'partial' | 'paid') => {
    if (s === 'paid')
      return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-md border border-green-200"><CheckCircle size={11}/> Đã TT</span>;
    if (s === 'partial')
      return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200"><Clock size={11}/> Một phần</span>;
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-md border border-red-200"><XCircle size={11}/> Chưa TT</span>;
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (viewingImport) return;
    if (saving || importSubmittingRef.current) return;

    const errors: string[] = [];
    if (!importForm.supplierName.trim()) errors.push('Vui lòng nhập nhà cung cấp');
    if (importForm.paymentStatus !== 'paid' && importForm.paymentStatus !== 'unpaid') {
      errors.push('Vui lòng chọn trạng thái thanh toán (Đã thanh toán hoặc Chưa thanh toán)');
    }
    if (importLines.length === 0) errors.push('Vui lòng chọn hàng hóa');
    importLines.forEach((l, i) => {
      if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
        errors.push(`Dòng ${i + 1} (${l.name}): số lượng phải lớn hơn 0`);
      }
      if (!Number.isFinite(l.unitCost) || l.unitCost < 0) {
        errors.push(`Dòng ${i + 1} (${l.name}): giá nhập không hợp lệ`);
      }
    });
    if (errors.length) {
      setImportFormError(errors.map((msg, idx) => `${idx + 1}. ${msg}`).join('\n'));
      return;
    }

    importSubmittingRef.current = true;
    setSaving(true);
    setImportFormError('');
    try {
      const record = await MockBackend.importStock({
        requestId: importRequestId || newImportRequestId(),
        supplierName: importForm.supplierName.trim(),
        paymentStatus: importForm.paymentStatus as ImportPaymentStatus,
        items: importLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      });
      await loadData();
      closeImportModal();
      const qty = record.quantity;
      setNotice(`Đã nhập phiếu ${record.id}: +${qty} sản phẩm`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err: any) {
      setImportFormError(err?.message || 'Lỗi nhập hàng. Vui lòng thử lại.');
    } finally {
      importSubmittingRef.current = false;
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
      name: '', sku: '', stock: 0, 
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
           <h2 className="text-2xl font-bold text-gray-800">Quản Lý Kho Hàng</h2>
           <p className="text-sm text-gray-500 mt-1">
             {inventoryTab === 'stock'
               ? `Tổng: ${filteredProducts.length} sản phẩm`
               : 'Phiếu nhập kho, thanh toán và công nợ nhà cung cấp'}
           </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {inventoryTab === 'imports' ? (
            <button
              onClick={() => openImportWorkspace()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm transition-all"
            >
              <PackagePlus size={20} strokeWidth={2.2} />
              <span>Phiếu nhập mới</span>
            </button>
          ) : (
            <>
              <button
                onClick={openAddProductModal}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm transition-all"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Thêm Sản Phẩm</span>
              </button>
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg flex items-center space-x-2 shadow-sm transition-all"
              >
                <Tags size={18} />
                <span className="hidden sm:inline">QL Danh Mục</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-1 w-full sm:w-auto">
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => setInventoryTab('stock')}
            className={`px-4 py-2 rounded ${inventoryTab === 'stock' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            Tồn kho
          </button>
          <button
            onClick={() => setInventoryTab('imports')}
            className={`px-4 py-2 rounded ${inventoryTab === 'imports' ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            Nhập hàng
          </button>
        </div>
      </div>

      {inventoryTab === 'stock' && <>
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
                  <th className="px-6 py-4 text-center">Tồn Kho</th>
                  <th className="px-6 py-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.length > 0 ? (
                  visibleProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                      onClick={() => { setDetailProduct(product); setIsDetailOpen(true); }}
                    >
                      <td className="px-6 py-4">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-16 h-16 object-cover rounded-lg border border-gray-200 group-hover:border-blue-300 transition-colors"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/60?text=x';
                            }}
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 group-hover:border-blue-300 transition-colors">
                            <ImageIcon size={20} />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-800 group-hover:text-blue-700 transition-colors">{product.name}</td>
                      <td className="px-6 py-4 text-gray-500 text-sm">{product.sku}</td>
                      <td className="px-6 py-4 text-gray-500 text-sm">
                        <span className="px-2 py-1 bg-gray-100 rounded-md">{product.category}</span>
                      </td>
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
                        <div
                          className="flex items-center justify-end space-x-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => { setDetailProduct(product); setIsDetailOpen(true); }}
                            className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                            title="Xem lịch sử"
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
                            title="Sửa"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Xóa"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
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
      </>}

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
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số Lượng Tồn Ban Đầu</label>
              <NumberInput 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.stock}
                onChange={(val) => setFormData({...formData, stock: val})}
                placeholder="0"
              />
              <p className="text-[11px] text-gray-400 mt-1 italic">Giá bán được nhập thủ công trên từng Đơn Hàng (không cố định ở đây).</p>
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
      
      {/* --- IMPORT MODAL (bố cục giống Công nợ → Phải thu) --- */}
      <Modal 
        isOpen={isImportModalOpen} 
        onClose={closeImportModal} 
        title={viewingImport ? `Phiếu nhập ${viewingImport.id}` : 'Nhập Hàng'}
        maxWidthClass="max-w-6xl"
      >
        <form onSubmit={handleImportSubmit} className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-1 flex">
              <span className="px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 bg-indigo-600 text-white shadow-sm">
                <FileText size={15}/> {viewingImport ? 'Chi tiết phiếu' : 'Phiếu nhập mới'}
              </span>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Nhà cung cấp <span className="text-red-600">*</span>
              </label>
              <input
                placeholder="Tìm / nhập tên nhà cung cấp..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={importForm.supplierName}
                onChange={(e) => setImportForm({ ...importForm, supplierName: e.target.value })}
                disabled={!!viewingImport}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Trạng thái thanh toán <span className="text-red-600">*</span>
              </label>
              <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-indigo-600"
                    checked={importForm.paymentStatus === 'paid'}
                    disabled={!!viewingImport}
                    onChange={() => {
                      setImportForm((prev) => ({ ...prev, paymentStatus: 'paid' }));
                      setImportFormError('');
                    }}
                  />
                  Đã thanh toán
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-indigo-600"
                    checked={importForm.paymentStatus === 'unpaid'}
                    disabled={!!viewingImport}
                    onChange={() => {
                      setImportForm((prev) => ({ ...prev, paymentStatus: 'unpaid' }));
                      setImportFormError('');
                    }}
                  />
                  Chưa thanh toán
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Tổng tiền phiếu</p>
              <p className="text-xl font-bold text-gray-800">{formatMoney(importSlipPreview.total)} ₫</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Đã thanh toán</p>
              <p className="text-xl font-bold text-emerald-700">{formatMoney(importSlipPreview.paid)} ₫</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Còn nợ NCC</p>
              <p className="text-xl font-bold text-indigo-700">{formatMoney(importSlipPreview.outstanding)} ₫</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500">Số mặt hàng</p>
              <p className="text-xl font-bold text-gray-800">{importSlipPreview.count}</p>
            </div>
          </div>

          {!viewingImport && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center justify-between">
                <p className="text-sm font-bold text-indigo-900">CHỌN HÀNG HÓA</p>
                <p className="text-xs text-indigo-700/80">Nhấn “Thêm” để đưa vào phiếu</p>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Tìm tên hoặc mã SKU..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
                    value={importPickerSearch}
                    onChange={(e) => setImportPickerSearch(e.target.value)}
                  />
                </div>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  value={importPickerCategory}
                  onChange={(e) => setImportPickerCategory(e.target.value)}
                >
                  <option value="">Tất cả danh mục</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 border-t border-gray-100">
                {products.filter(p => {
                  const s = importPickerSearch.trim().toLowerCase();
                  const hitName = !s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s);
                  const hitCat = !importPickerCategory || p.category === importPickerCategory;
                  return hitName && hitCat;
                }).slice(0, 20).map(p => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-2 hover:bg-indigo-50/40">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.sku} • {p.category} • Tồn: {p.stock}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addProductToImport(p)}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                    >
                      Thêm
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50">
              <p className="text-sm font-bold text-indigo-900">DANH SÁCH HÀNG NHẬP</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Hàng hóa</th>
                    <th className="px-6 py-4">SKU</th>
                    <th className="px-6 py-4 text-right">Số lượng</th>
                    <th className="px-6 py-4 text-right">Giá nhập</th>
                    <th className="px-6 py-4 text-right">Thành tiền</th>
                    {!viewingImport && <th className="px-6 py-4 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {importLines.map((l) => (
                    <tr key={l.tempId} className="hover:bg-indigo-50/40">
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{l.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{l.sku}</td>
                      <td className="px-6 py-4 text-right">
                        {viewingImport ? (
                          <span className="text-sm font-semibold">{l.quantity}</span>
                        ) : (
                          <NumberInput
                            className="w-28 ml-auto px-3 py-2 border border-gray-300 rounded-lg text-right"
                            value={l.quantity}
                            onChange={(val) => updateImportLine(l.tempId, { quantity: val })}
                            placeholder="0"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {viewingImport ? (
                          <span className="text-sm">{formatMoney(l.unitCost)} ₫</span>
                        ) : (
                          <NumberInput
                            className="w-36 ml-auto px-3 py-2 border border-gray-300 rounded-lg text-right"
                            value={l.unitCost}
                            onChange={(val) => updateImportLine(l.tempId, { unitCost: val })}
                            placeholder="0"
                            suffix="₫"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-gray-800">
                        {formatMoney(l.totalCost)} ₫
                      </td>
                      {!viewingImport && (
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => removeImportLine(l.tempId)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {importLines.length === 0 && (
                    <tr>
                      <td colSpan={viewingImport ? 5 : 6} className="px-6 py-12 text-center text-gray-400">
                        Chưa chọn hàng hóa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {importFormError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 whitespace-pre-line">
              {importFormError}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeImportModal}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              {viewingImport ? 'Đóng' : 'Hủy'}
            </button>
            {!viewingImport && (
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="animate-spin" size={16} />}
                {saving ? 'Đang lưu...' : 'Xác nhận nhập hàng'}
              </button>
            )}
          </div>
        </form>
      </Modal>
      
      <Modal
        isOpen={isDetailOpen}
        onClose={() => { setIsDetailOpen(false); setDetailProduct(null); }}
        title="Chi Tiết & Lịch Sử Nhập Xuất"
        maxWidthClass="max-w-3xl"
      >
        {detailProduct && (() => {
          const prodImportLines = imports.flatMap((imp) =>
            DebtService.getImportLineItems(imp)
              .filter((line) => line.productId === detailProduct.id)
              .map((line) => ({ imp, line })),
          );
          const prodExports = exports.filter(e => e.productId === detailProduct.id);
          const totalIn = prodImportLines.reduce((s, i) => s + i.line.quantity, 0);
          const totalOut = prodExports.reduce((s, e) => s + e.quantity, 0);

          type TimelineItem =
            | { kind: 'in'; id: string; date: Date; quantity: number; unitCost?: number; totalCost?: number; supplierName?: string; paymentStatus?: ImportPaymentStatus }
            | { kind: 'out'; id: string; date: Date; quantity: number; orderId: string; customerName: string; customerPhone: string };

          const timeline: TimelineItem[] = [
            ...prodImportLines.map(({ imp, line }, idx) => ({
              kind: 'in' as const,
              id: `${imp.id}_${line.productId}_${idx}`,
              date: new Date(imp.createdAt),
              quantity: line.quantity,
              unitCost: line.unitCost,
              totalCost: line.totalCost,
              supplierName: imp.supplierName,
              paymentStatus: imp.paymentStatus,
            })),
            ...prodExports.map(e => ({
              kind: 'out' as const,
              id: e.id,
              date: new Date(e.createdAt),
              quantity: e.quantity,
              orderId: e.orderId,
              customerName: e.customerName,
              customerPhone: e.customerPhone,
            })),
          ].sort((a, b) => b.date.getTime() - a.date.getTime());

          return (
            <div className="space-y-5">
              {/* Thông tin SP */}
              <div className="flex gap-4 items-start">
                <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200 flex-shrink-0">
                  {detailProduct.image ? <img src={detailProduct.image} className="object-cover w-full h-full" /> : <ImageIcon className="text-gray-400" size={32} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-bold text-gray-800 truncate">{detailProduct.name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-medium text-gray-600">SKU:</span> {detailProduct.sku}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="font-medium text-gray-600">Danh mục:</span> {detailProduct.category}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3 thẻ tóm tắt */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/60 p-4 rounded-xl border border-blue-100">
                  <p className="text-xs text-blue-700/80 font-medium uppercase tracking-wide">Tồn kho hiện tại</p>
                  <p className="text-2xl font-bold text-blue-800 mt-1">{detailProduct.stock}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-4 rounded-xl border border-emerald-100">
                  <p className="text-xs text-emerald-700/80 font-medium uppercase tracking-wide">Tổng đã nhập</p>
                  <p className="text-2xl font-bold text-emerald-800 mt-1">+{totalIn}</p>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-red-100/60 p-4 rounded-xl border border-red-100">
                  <p className="text-xs text-red-700/80 font-medium uppercase tracking-wide">Tổng đã xuất</p>
                  <p className="text-2xl font-bold text-red-800 mt-1">-{totalOut}</p>
                </div>
              </div>

              {/* Timeline gộp nhập - xuất */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    Lịch sử nhập - xuất ({timeline.length})
                  </h4>
                  <span className="text-xs text-gray-500">Mới nhất ở trên</span>
                </div>

                {timeline.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <PackageMinus size={36} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Chưa có giao dịch nhập hoặc xuất cho sản phẩm này.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
                    {timeline.map(item => {
                      const isIn = item.kind === 'in';
                      return (
                        <li key={item.id} className="p-4 flex gap-3 hover:bg-gray-50/70 transition-colors">
                          {/* Dọc timeline indicator */}
                          <div className="flex flex-col items-center">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {isIn ? <PackagePlus size={16} /> : <PackageMinus size={16} />}
                            </div>
                          </div>

                          {/* Nội dung */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${isIn ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                    {isIn ? 'NHẬP KHO' : 'XUẤT KHO'}
                                  </span>
                                  <span className="text-xs text-gray-500 font-medium">
                                    {item.date.toLocaleString('vi-VN')}
                                  </span>
                                </div>

                                {isIn ? (
                                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                                    {item.supplierName && (
                                      <p className="flex items-center gap-2">
                                        <span className="text-gray-400">🏭 NCC:</span>
                                        <span className="font-medium text-gray-800">{item.supplierName}</span>
                                      </p>
                                    )}
                                    {typeof item.unitCost === 'number' && (
                                      <p className="flex items-center gap-2">
                                        <span className="text-gray-400">💰 Đơn giá nhập:</span>
                                        <span className="font-semibold text-emerald-700">
                                          {item.unitCost.toLocaleString('vi-VN')} ₫
                                        </span>
                                      </p>
                                    )}
                                    {item.paymentStatus && (
                                      <p className="flex items-center gap-2">
                                        {item.paymentStatus === 'paid'
                                          ? importPayStatusBadge('paid')
                                          : importPayStatusBadge('unpaid')}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                                    <p className="flex items-center gap-2">
                                      <span className="text-gray-400">📋 Đơn hàng:</span>
                                      <span className="font-semibold text-blue-700">#{item.orderId}</span>
                                    </p>
                                    <p className="flex items-center gap-2 flex-wrap">
                                      <span className="text-gray-400">👤 Khách:</span>
                                      <span className="font-medium text-gray-800">{item.customerName}</span>
                                      <span className="text-gray-500">({item.customerPhone})</span>
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Số lượng + thành tiền */}
                              <div className="text-right flex-shrink-0">
                                <p className={`text-lg font-extrabold ${isIn ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {isIn ? '+' : '-'}{item.quantity}
                                </p>
                                {isIn && typeof item.totalCost === 'number' && (
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    Thành tiền: <span className="font-semibold text-gray-700">{item.totalCost.toLocaleString('vi-VN')} ₫</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          );
        })()}
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
      
      {/* --- DANH SÁCH PHIẾU NHẬP (theo người nhập, giống Phải thu) --- */}
      {inventoryTab === 'imports' && (() => {
        const payables = DebtService.computePayables(imports, payments);
        const payableById = new Map(payables.map((p) => [p.id, p]));
        const s = importListSearch.trim().toLowerCase();
        const slipStatusOf = (imp: ImportRecord): PayStatus => {
          const p = payableById.get(imp.id);
          if (p?.status) return p.status;
          const total = imp.totalCost || 0;
          const paid = DebtService.computePaidForImport(imp, payments);
          if (imp.paymentStatus === 'paid' || (paid >= total && total > 0)) return 'paid';
          if (paid > 0) return 'partial';
          return 'unpaid';
        };
        const filteredSlips = imports.filter((imp) => {
          const status = slipStatusOf(imp);
          const matchSearch =
            !s ||
            imp.id.toLowerCase().includes(s) ||
            (imp.supplierName || '').toLowerCase().includes(s) ||
            DebtService.getImportLineItems(imp).some(
              (l) => l.name.toLowerCase().includes(s) || l.sku.toLowerCase().includes(s),
            );
          const matchStatus = importListStatus === 'all' ? true : status === importListStatus;
          return matchSearch && matchStatus;
        });
        const filteredSuppliers = supplierGroups.filter((g) => {
          const matchSearch =
            !s ||
            g.name.toLowerCase().includes(s) ||
            g.importIds.some((id) => id.toLowerCase().includes(s)) ||
            imports.filter((imp) => g.importIds.includes(imp.id)).some((imp) =>
              DebtService.getImportLineItems(imp).some(
                (l) => l.name.toLowerCase().includes(s) || l.sku.toLowerCase().includes(s),
              ),
            );
          const groupStatus: PayStatus = g.outstanding <= 0 ? 'paid' : g.paid <= 0 ? 'unpaid' : 'partial';
          const matchStatus = importListStatus === 'all' ? true : groupStatus === importListStatus;
          return matchSearch && matchStatus;
        });
        const summary = DebtService.computePayableSummary(payables);
        return (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="bg-white border border-gray-200 rounded-lg p-1 flex">
                <button
                  type="button"
                  onClick={() => setImportViewMode('bySupplier')}
                  className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition ${
                    importViewMode === 'bySupplier' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <User size={15}/> Theo người nhập
                </button>
                <button
                  type="button"
                  onClick={() => setImportViewMode('bySlip')}
                  className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition ${
                    importViewMode === 'bySlip' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <FileText size={15}/> Theo phiếu nhập
                </button>
              </div>
              <input
                placeholder={importViewMode === 'bySupplier'
                  ? 'Tìm theo tên người nhập, mã phiếu, hàng hóa...'
                  : 'Tìm theo nhà cung cấp, mã phiếu, hàng hóa...'}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                value={importListSearch}
                onChange={(e) => setImportListSearch(e.target.value)}
              />
              <select
                className="px-3 py-2 border border-gray-300 rounded-lg"
                value={importListStatus}
                onChange={(e) => setImportListStatus(e.target.value as any)}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="unpaid">Chưa thanh toán</option>
                <option value="partial">Còn nợ một phần</option>
                <option value="paid">Đã thanh toán</option>
              </select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-200 rounded p-4">
                <p className="text-xs text-gray-500">Tổng phải trả</p>
                <p className="text-xl font-bold text-gray-800">{summary.outstanding.toLocaleString()} ₫</p>
              </div>
              <div className="bg-white border border-gray-200 rounded p-4">
                <p className="text-xs text-gray-500">Đã thanh toán</p>
                <p className="text-xl font-bold text-emerald-700">{summary.paid.toLocaleString()} ₫</p>
              </div>
              <div className="bg-white border border-gray-200 rounded p-4">
                <p className="text-xs text-gray-500">
                  {importViewMode === 'bySupplier' ? 'Người còn nợ' : 'Phiếu nhập còn nợ'}
                </p>
                <p className="text-xl font-bold text-indigo-700">
                  {importViewMode === 'bySupplier'
                    ? supplierGroups.filter((g) => g.outstanding > 0).length
                    : summary.debtCount}
                </p>
              </div>
              <div className="bg-white border border-gray-200 rounded p-4">
                <p className="text-xs text-gray-500">
                  {importViewMode === 'bySupplier' ? 'Tổng người nhập' : 'Tổng phiếu nhập'}
                </p>
                <p className="text-xl font-bold text-gray-800">
                  {importViewMode === 'bySupplier' ? supplierGroups.length : imports.length}
                </p>
              </div>
            </div>

            {importViewMode === 'bySupplier' ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center justify-between">
                  <p className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                    <User size={16}/> DANH SÁCH NGƯỜI NHẬP HÀNG
                  </p>
                  <p className="text-xs text-indigo-700/80">Nhấn vào dòng để xem lịch sử nhập của người đó</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                      <tr>
                        <th className="px-6 py-4">Người nhập hàng</th>
                        <th className="px-6 py-4 text-center">Số phiếu</th>
                        <th className="px-6 py-4 text-right">Tổng tiền</th>
                        <th className="px-6 py-4 text-right">Đã trả</th>
                        <th className="px-6 py-4 text-right">Còn nợ</th>
                        <th className="px-6 py-4">TT thanh toán</th>
                        <th className="px-6 py-4 text-right">Nhập gần nhất</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredSuppliers.map((g) => {
                        const ps: PayStatus = g.outstanding <= 0 ? 'paid' : g.paid <= 0 ? 'unpaid' : 'partial';
                        return (
                          <tr
                            key={g.key}
                            className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                            onClick={() => openSupplierDetail(g)}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                                  {(g.name || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-800 truncate">{g.name}</p>
                                  <p className="text-xs text-gray-500">{g.itemCount} mặt hàng • SL {g.quantity}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="inline-flex items-center justify-center min-w-[36px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 text-sm font-black border border-indigo-200">
                                {g.slipCount}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-sm text-gray-800 font-semibold">{formatMoney(g.total)} ₫</td>
                            <td className="px-6 py-4 text-right text-sm text-emerald-700 font-semibold">{formatMoney(g.paid)} ₫</td>
                            <td className="px-6 py-4 text-right">
                              <span className={`text-sm font-black ${g.outstanding > 0 ? 'text-red-700' : 'text-green-600'}`}>
                                {formatMoney(g.outstanding)} ₫
                              </span>
                            </td>
                            <td className="px-6 py-4">{importPayStatusBadge(ps)}</td>
                            <td className="px-6 py-4 text-right text-xs text-gray-500">
                              {new Date(g.latestAt).toLocaleDateString('vi-VN')}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredSuppliers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                            Không tìm thấy người nhập hàng phù hợp.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center justify-between">
                  <p className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                    <FileText size={16}/> DANH SÁCH PHIẾU NHẬP
                  </p>
                  <p className="text-xs text-indigo-700/80">Nhấn vào dòng để xem chi tiết phiếu</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
                      <tr>
                        <th className="px-6 py-4">Phiếu nhập</th>
                        <th className="px-6 py-4">Người nhập hàng</th>
                        <th className="px-6 py-4 text-right">Tổng</th>
                        <th className="px-6 py-4 text-right">Đã trả</th>
                        <th className="px-6 py-4 text-right">Còn nợ</th>
                        <th className="px-6 py-4">TT thanh toán</th>
                        <th className="px-6 py-4 text-right">Ngày</th>
                        <th className="px-6 py-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredSlips.map((imp) => {
                        const p = payableById.get(imp.id);
                        const total = p?.total ?? (imp.totalCost || 0);
                        const paid = p?.paid ?? (imp.paidAmount || 0);
                        const outstanding = p?.outstanding ?? Math.max(0, total - paid);
                        const status = slipStatusOf(imp);
                        return (
                          <tr
                            key={imp.id}
                            className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                            onClick={() => openImportSlip(imp)}
                          >
                            <td className="px-6 py-4 text-sm font-medium text-gray-800">{imp.id}</td>
                            <td className="px-6 py-4 text-sm text-gray-700">{imp.supplierName || '—'}</td>
                            <td className="px-6 py-4 text-right text-sm text-gray-800 font-semibold">{formatMoney(total)} ₫</td>
                            <td className="px-6 py-4 text-right text-sm text-emerald-700 font-semibold">{formatMoney(paid)} ₫</td>
                            <td className="px-6 py-4 text-right">
                              <span className={`text-sm font-black ${outstanding > 0 ? 'text-red-700' : 'text-green-600'}`}>
                                {formatMoney(outstanding)} ₫
                              </span>
                            </td>
                            <td className="px-6 py-4">{importPayStatusBadge(status)}</td>
                            <td className="px-6 py-4 text-right text-xs text-gray-500">
                              {new Date(imp.createdAt).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => openImportSlip(imp)}
                                className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                              >
                                Xem
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredSlips.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                            Không có phiếu nhập phù hợp.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <Modal
        isOpen={supplierDetailOpen && !!selectedSupplier}
        onClose={() => {
          setSupplierDetailOpen(false);
          setSelectedSupplierKey(null);
          setSupplierReturnKey(null);
        }}
        title="Chi tiết người nhập hàng"
        maxWidthClass="max-w-6xl"
      >
        {selectedSupplier && (() => {
          const slipMeta = (imp: ImportRecord) => {
            const lines = DebtService.getImportLineItems(imp);
            const total = typeof imp.totalCost === 'number' ? imp.totalCost : lines.reduce((s, l) => s + l.totalCost, 0);
            const paid = DebtService.computePaidForImport(imp, payments);
            const outstanding = Math.max(0, total - paid);
            const status: PayStatus =
              imp.paymentStatus === 'paid' || (paid >= total && total > 0)
                ? 'paid'
                : paid > 0
                  ? 'partial'
                  : 'unpaid';
            return { lines, total, paid, outstanding, status, qty: lines.reduce((s, l) => s + l.quantity, 0) };
          };
          const q = supplierSlipSearch.trim().toLowerCase();
          const historySlips = selectedSupplierImports.filter((imp) => {
            const { status, lines } = slipMeta(imp);
            const matchSearch =
              !q ||
              imp.id.toLowerCase().includes(q) ||
              lines.some((l) => l.name.toLowerCase().includes(q) || l.sku.toLowerCase().includes(q));
            const matchStatus = supplierSlipStatus === 'all' ? true : status === supplierSlipStatus;
            return matchSearch && matchStatus;
          });
          const groupStatus: PayStatus =
            selectedSupplier.outstanding <= 0 ? 'paid' : selectedSupplier.paid <= 0 ? 'unpaid' : 'partial';
          return (
            <div className="space-y-5">
              <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-2xl shadow-lg">
                    {(selectedSupplier.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-black text-gray-900 truncate">{selectedSupplier.name}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-gray-600">
                      <span className="flex items-center gap-1.5"><FileText size={14}/> {selectedSupplier.slipCount} phiếu nhập</span>
                      <span className="flex items-center gap-1.5"><PackagePlus size={14}/> {selectedSupplier.quantity} sản phẩm</span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={14}/> Nhập gần nhất: <strong>{new Date(selectedSupplier.latestAt).toLocaleDateString('vi-VN')}</strong>
                      </span>
                      {importPayStatusBadge(groupStatus)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 text-center shadow-sm">
                      <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Số phiếu</p>
                      <p className="text-lg font-black text-indigo-700">{selectedSupplier.slipCount}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 text-center shadow-sm">
                      <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Tổng tiền</p>
                      <p className="text-md font-black text-gray-800 leading-tight">{formatMoney(selectedSupplier.total)}</p>
                      <p className="text-[9px] text-gray-500">VNĐ</p>
                    </div>
                    <div className="bg-white rounded-xl border border-green-200 px-3 py-2 text-center shadow-sm">
                      <p className="text-[10px] font-bold uppercase text-green-600 tracking-wide">Đã trả</p>
                      <p className="text-md font-black text-green-700 leading-tight">{formatMoney(selectedSupplier.paid)}</p>
                      <p className="text-[9px] text-green-500">VNĐ</p>
                    </div>
                    <div className={`rounded-xl border-2 px-3 py-2 text-center shadow-sm ${
                      selectedSupplier.outstanding > 0
                        ? 'bg-gradient-to-br from-red-50 to-amber-50 border-red-300'
                        : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300'
                    }`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wide ${selectedSupplier.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>Còn nợ</p>
                      <p className={`text-md font-black leading-tight ${selectedSupplier.outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {formatMoney(selectedSupplier.outstanding)}
                      </p>
                      <p className={`text-[9px] ${selectedSupplier.outstanding > 0 ? 'text-red-500' : 'text-green-500'}`}>VNĐ</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 border-b border-gray-200 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setSupplierDetailTab('overview')}
                    className={`py-3 px-3 text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                      supplierDetailTab === 'overview'
                        ? 'bg-white text-indigo-700 border-b-2 border-indigo-600 -mb-px'
                        : 'text-gray-600 hover:bg-gray-100/60'
                    }`}
                  >
                    <FileText size={15}/> Tổng quan
                  </button>
                  <button
                    type="button"
                    onClick={() => setSupplierDetailTab('history')}
                    className={`py-3 px-3 text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                      supplierDetailTab === 'history'
                        ? 'bg-white text-indigo-700 border-b-2 border-indigo-600 -mb-px'
                        : 'text-gray-600 hover:bg-gray-100/60'
                    }`}
                  >
                    <Clock size={15}/> Lịch sử nhập hàng
                  </button>
                </div>

                <div className="p-5">
                  {supplierDetailTab === 'overview' && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-xl p-4 shadow-md">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-50/90">Tổng phiếu nhập</p>
                          <p className="text-3xl font-black mt-1">{selectedSupplier.slipCount}</p>
                        </div>
                        <div className="bg-gradient-to-br from-slate-600 to-slate-800 text-white rounded-xl p-4 shadow-md">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-100/90">Tổng tiền nhập</p>
                          <p className="text-2xl font-black mt-1 leading-tight">{formatMoney(selectedSupplier.total)}</p>
                          <p className="text-[10px] text-slate-200/90 mt-0.5">{selectedSupplier.itemCount} dòng hàng</p>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-500 to-green-700 text-white rounded-xl p-4 shadow-md">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-50/90">Đã thanh toán</p>
                          <p className="text-2xl font-black mt-1 leading-tight">{formatMoney(selectedSupplier.paid)}</p>
                        </div>
                        <div className={`rounded-xl p-4 shadow-md text-white ${
                          selectedSupplier.outstanding > 0
                            ? 'bg-gradient-to-br from-red-500 to-rose-700'
                            : 'bg-gradient-to-br from-green-500 to-emerald-700'
                        }`}>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-white/90">Công nợ hiện tại</p>
                          <p className="text-2xl font-black mt-1 leading-tight">{formatMoney(selectedSupplier.outstanding)}</p>
                          <p className="text-[10px] text-white/90 mt-0.5">
                            {selectedSupplier.outstanding > 0 ? 'Chưa thanh toán xong' : 'Không còn nợ'}
                          </p>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                            <FileText size={14}/> 3 PHIẾU NHẬP GẦN NHẤT
                          </h4>
                          <button
                            type="button"
                            onClick={() => setSupplierDetailTab('history')}
                            className="text-xs font-bold text-indigo-700 hover:text-indigo-800 flex items-center gap-0.5"
                          >
                            Xem tất cả <ChevronRight size={13}/>
                          </button>
                        </div>
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          {selectedSupplierImports.slice(0, 3).map((imp) => {
                            const meta = slipMeta(imp);
                            return (
                              <div key={imp.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-indigo-50/30">
                                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-bold text-sm text-indigo-700 font-mono">{imp.id}</p>
                                      {importPayStatusBadge(meta.status)}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                      <Calendar size={11}/> {new Date(imp.createdAt).toLocaleString('vi-VN')} • {meta.qty} SP
                                    </p>
                                    <p className="text-xs text-gray-600 mt-0.5 truncate">
                                      {meta.lines.map((l) => `${l.name} (${l.quantity})`).join(' • ')}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3 md:gap-4 text-right">
                                    <div>
                                      <p className="text-[10px] font-bold uppercase text-gray-500">Tổng</p>
                                      <p className="text-sm font-bold text-gray-800">{formatMoney(meta.total)} ₫</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold uppercase text-green-600">Đã trả</p>
                                      <p className="text-sm font-bold text-green-700">{formatMoney(meta.paid)} ₫</p>
                                    </div>
                                    <div>
                                      <p className={`text-[10px] font-bold uppercase ${meta.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>Còn nợ</p>
                                      <p className={`text-sm font-black ${meta.outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>{formatMoney(meta.outstanding)} ₫</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => openImportSlipFromSupplier(imp)}
                                      className="px-3 py-1 text-xs font-bold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-1"
                                    >
                                      <Eye size={11}/> Xem phiếu
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {selectedSupplierImports.length === 0 && (
                            <div className="px-4 py-10 text-center text-gray-400 text-sm">Chưa có phiếu nhập.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {supplierDetailTab === 'history' && (
                    <div className="space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15}/>
                          <input
                            placeholder="Tìm mã phiếu hoặc tên hàng..."
                            value={supplierSlipSearch}
                            onChange={(e) => setSupplierSlipSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                          />
                        </div>
                        <select
                          value={supplierSlipStatus}
                          onChange={(e) => setSupplierSlipStatus(e.target.value as any)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        >
                          <option value="all">Tất cả trạng thái TT</option>
                          <option value="unpaid">Chưa thanh toán</option>
                          <option value="partial">Thanh toán một phần</option>
                          <option value="paid">Đã thanh toán đủ</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (historySlips.length === 0) return;
                            const allIds = new Set(historySlips.map((x) => x.id));
                            setExpandedImportIds((prev) => {
                              const allOpened = allIds.size > 0 && Array.from(allIds).every((id) => prev.has(id));
                              return allOpened ? new Set() : allIds;
                            });
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50"
                        >
                          {historySlips.length > 0 && historySlips.every((x) => expandedImportIds.has(x.id))
                            ? 'Thu gọn tất cả'
                            : 'Mở rộng tất cả'}
                        </button>
                      </div>

                      <p className="text-xs text-gray-500">{historySlips.length} phiếu nhập</p>
                      <div className="space-y-2">
                        {historySlips.map((imp) => {
                          const meta = slipMeta(imp);
                          const open = expandedImportIds.has(imp.id);
                          return (
                            <div key={imp.id} className="border border-gray-200 rounded-xl overflow-hidden">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedImportIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(imp.id)) next.delete(imp.id);
                                    else next.add(imp.id);
                                    return next;
                                  });
                                }}
                                className="w-full flex items-center justify-between p-3 hover:bg-indigo-50/40 text-left transition-colors"
                              >
                                <div className="min-w-0 flex-1 mr-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-indigo-700 font-mono">{imp.id}</span>
                                    {importPayStatusBadge(meta.status)}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {new Date(imp.createdAt).toLocaleString('vi-VN')} • {meta.lines.length} mặt hàng • SL {meta.qty}
                                  </p>
                                </div>
                                <div className="flex items-center gap-4 flex-shrink-0">
                                  <div className="text-right hidden sm:block">
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Tổng</p>
                                    <p className="text-sm font-bold text-gray-800">{formatMoney(meta.total)} ₫</p>
                                  </div>
                                  <span className={`transform transition-transform text-gray-500 ${open ? 'rotate-180' : ''}`}>
                                    <ChevronDown size={18} />
                                  </span>
                                </div>
                              </button>
                              {open && (
                                <div className="border-t border-gray-200 bg-gray-50/70 p-3 space-y-3">
                                  <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
                                      <p className="text-[10px] font-bold uppercase text-gray-500">Tổng tiền</p>
                                      <p className="text-sm font-black text-gray-800">{formatMoney(meta.total)} ₫</p>
                                    </div>
                                    <div className="bg-white rounded-lg border border-green-200 px-3 py-2">
                                      <p className="text-[10px] font-bold uppercase text-green-600">Đã trả</p>
                                      <p className="text-sm font-black text-green-700">{formatMoney(meta.paid)} ₫</p>
                                    </div>
                                    <div className="bg-white rounded-lg border border-red-200 px-3 py-2">
                                      <p className="text-[10px] font-bold uppercase text-red-600">Còn nợ</p>
                                      <p className={`text-sm font-black ${meta.outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>{formatMoney(meta.outstanding)} ₫</p>
                                    </div>
                                  </div>
                                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                      <thead className="bg-gray-50 text-gray-600 uppercase text-[11px] font-semibold">
                                        <tr>
                                          <th className="px-4 py-2">Sản phẩm</th>
                                          <th className="px-4 py-2">SKU</th>
                                          <th className="px-4 py-2 text-right">Số lượng</th>
                                          <th className="px-4 py-2 text-right">Đơn giá nhập</th>
                                          <th className="px-4 py-2 text-right">Thành tiền</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {meta.lines.map((l, idx) => (
                                          <tr key={`${imp.id}_${idx}`}>
                                            <td className="px-4 py-2 text-sm font-medium text-gray-800">{l.name}</td>
                                            <td className="px-4 py-2 text-sm text-gray-600">{l.sku}</td>
                                            <td className="px-4 py-2 text-sm text-right font-semibold">{l.quantity}</td>
                                            <td className="px-4 py-2 text-sm text-right">{formatMoney(l.unitCost)} ₫</td>
                                            <td className="px-4 py-2 text-sm text-right font-semibold">{formatMoney(l.totalCost)} ₫</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => openImportSlipFromSupplier(imp)}
                                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold flex items-center gap-1.5"
                                    >
                                      <Eye size={14}/> Xem chi tiết phiếu
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {historySlips.length === 0 && (
                          <div className="py-12 text-center text-gray-400 text-sm">Không có phiếu nhập phù hợp.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* --- LỊCH SỬ NHẬP XUẤT (theo từng sản phẩm) --- */}
      {inventoryTab === 'stock' && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Lịch Sử Nhập / Xuất Kho <span className="text-sm font-normal text-gray-500">(Nhấn vào sản phẩm để xem chi tiết)</span></h3>
        {(() => {
          // 1. Gộp tất cả productId (từ cả imports + exports + products)
          const productSet = new Map<string, { name: string; sku: string }>();
          products.forEach(p => productSet.set(p.id, { name: p.name, sku: p.sku }));
          imports.forEach((r) => {
            DebtService.getImportLineItems(r).forEach((line) => {
              if (!productSet.has(line.productId)) productSet.set(line.productId, { name: line.name, sku: line.sku });
            });
          });
          exports.forEach(r => { if (!productSet.has(r.productId)) productSet.set(r.productId, { name: r.name, sku: r.sku }); });

          const items = Array.from(productSet.entries())
            .map(([productId, meta]) => {
              const imps = imports.flatMap((i) =>
                DebtService.getImportLineItems(i)
                  .filter((line) => line.productId === productId)
                  .map((line) => ({ imp: i, line })),
              );
              const exps = exports.filter(e => e.productId === productId);
              const totalIn = imps.reduce((s, i) => s + i.line.quantity, 0);
              const totalOut = exps.reduce((s, e) => s + e.quantity, 0);
              const lastAct = [
                imps.length ? Math.max(...imps.map((x) => new Date(x.imp.createdAt).getTime())) : 0,
                exps.length ? Math.max(...exps.map((x) => new Date(x.createdAt).getTime())) : 0,
              ];
              const lastAt = Math.max(...lastAct);
              return { productId, name: meta.name, sku: meta.sku, totalIn, totalOut, lastAt };
            })
            .filter(x => x.totalIn + x.totalOut > 0)
            .sort((a, b) => b.lastAt - a.lastAt);

          if (items.length === 0) return <p className="text-gray-500 text-sm">Chưa có lịch sử nhập hoặc xuất kho.</p>;

          return (
            <div className="space-y-2">
              {items.map(it => {
                const open = expandedHistoryProductId === it.productId;
                return (
                  <div key={it.productId} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedHistoryProductId(open ? null : it.productId)}
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left transition-colors"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="font-semibold text-gray-800 truncate">{it.name} <span className="text-xs text-gray-500 font-normal">({it.sku})</span></p>
                        <div className="flex flex-wrap gap-3 text-[11px] text-gray-600 mt-0.5">
                          <span className="text-emerald-700 font-medium">Tổng nhập: +{it.totalIn}</span>
                          <span className="text-red-700 font-medium">Tổng xuất: -{it.totalOut}</span>
                          {it.lastAt > 0 && (
                            <span className="text-gray-500">Hoạt động gần nhất: {new Date(it.lastAt).toLocaleDateString('vi-VN')}</span>
                          )}
                        </div>
                      </div>
                      <span className={`transform transition-transform ${open ? 'rotate-180' : ''} text-gray-500`}>
                        <ChevronDown size={20} />
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-gray-200 bg-gray-50/70 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-white rounded-md border border-gray-200 p-3">
                          <p className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-1"><PackagePlus size={15} /> Lịch sử nhập ({imports.flatMap((i) => DebtService.getImportLineItems(i).filter((l) => l.productId === it.productId)).length})</p>
                          {(() => {
                            const arr = imports.flatMap((i) =>
                              DebtService.getImportLineItems(i)
                                .filter((l) => l.productId === it.productId)
                                .map((l) => ({ imp: i, line: l })),
                            );
                            return arr.length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có.</p>
                            ) : (
                              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                                {arr.slice().sort((a, b) => new Date(b.imp.createdAt).getTime() - new Date(a.imp.createdAt).getTime()).map(({ imp, line }, idx) => (
                                  <div key={`${imp.id}_${idx}`} className="flex items-start justify-between p-2 bg-gray-50 rounded border border-gray-200 text-xs gap-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-gray-700 font-medium">{new Date(imp.createdAt).toLocaleString('vi-VN')} • {imp.id}</p>
                                      <div className="mt-0.5 space-y-0.5 text-[11px] text-gray-500">
                                        {imp.supplierName && <p>NCC: <span className="text-gray-700">{imp.supplierName}</span></p>}
                                        <p>Đơn giá: <span className="font-semibold text-emerald-700">{line.unitCost.toLocaleString('vi-VN')} ₫</span></p>
                                        {imp.paymentStatus === 'paid'
                                          ? <p className="text-green-700 font-semibold">Đã thanh toán</p>
                                          : imp.paymentStatus === 'unpaid'
                                            ? <p className="text-red-700 font-semibold">Chưa thanh toán</p>
                                            : null}
                                      </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <span className="font-bold text-emerald-700 text-sm">+{line.quantity}</span>
                                      <span className="block text-[10px] text-gray-600 mt-0.5">Thành tiền<br />{line.totalCost.toLocaleString('vi-VN')} ₫</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="bg-white rounded-md border border-gray-200 p-3">
                          <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1"><PackageMinus size={15} /> Lịch sử xuất ({exports.filter(e => e.productId === it.productId).length})</p>
                          {(() => {
                            const arr = exports.filter(e => e.productId === it.productId);
                            return arr.length === 0 ? (
                              <p className="text-xs text-gray-500">Chưa có.</p>
                            ) : (
                              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                                {arr.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(r => (
                                  <div key={r.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200 text-xs">
                                    <div className="min-w-0">
                                      <p className="text-gray-700">{new Date(r.createdAt).toLocaleString('vi-VN')} • Đơn {r.orderId}</p>
                                      <p className="text-gray-500 truncate">{r.customerName} ({r.customerPhone})</p>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-bold text-red-700">-{r.quantity}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      )}
    </div>
  );
};
