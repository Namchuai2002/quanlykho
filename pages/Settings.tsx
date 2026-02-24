import React, { useRef, useState } from 'react';
import { MockBackend } from '../services/mockBackend';
import { Download, Upload, Save, Database, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export const Settings: React.FC = () => {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  // --- EXPORT JSON ---
  const handleExport = async () => {
    setLoading(true);
    const dataStr = await MockBackend.exportData();
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `quanlykho_backup_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    setLoading(false);
  };
  
  const handleExportExcel = async () => {
    setLoading(true);
    try {
      const [products, orders, customers, categories, imports, exports, payments] = await Promise.all([
        MockBackend.getProducts(),
        MockBackend.getOrders(),
        MockBackend.getCustomers(),
        MockBackend.getCategories(),
        MockBackend.getImports(),
        MockBackend.getExports(),
        MockBackend.getPayments?.() || Promise.resolve([] as any)
      ]);
      
      const wb = XLSX.utils.book_new();
      
      const productsSheet = XLSX.utils.json_to_sheet(products.map(p => ({
        ID: p.id, Tên: p.name, SKU: p.sku, Giá: p.price, Tồn: p.stock, DanhMục: p.category, NgàyNhập: p.importDate
      })));
      XLSX.utils.book_append_sheet(wb, productsSheet, 'Sản phẩm');
      
      const ordersSheet = XLSX.utils.json_to_sheet(orders.map(o => ({
        MãĐơn: o.id, Khách: o.customerName, SĐT: o.customerPhone, ĐịaChỉ: o.address, Tổng: o.totalAmount,
        TrạngThái: o.status, NgàyTạo: o.createdAt, ĐãTrả: o.paidAmount || 0, HạnTT: o.dueDate || '', GhiChú: o.note || ''
      })));
      XLSX.utils.book_append_sheet(wb, ordersSheet, 'Đơn hàng');
      
      const orderItems = orders.flatMap(o => o.items.map(it => ({
        MãĐơn: o.id, SP_ID: it.productId, TênSP: it.name, ĐơnGiá: it.price, SL: it.quantity
      })));
      const itemsSheet = XLSX.utils.json_to_sheet(orderItems);
      XLSX.utils.book_append_sheet(wb, itemsSheet, 'Chi tiết đơn');
      
      const customersSheet = XLSX.utils.json_to_sheet(customers.map(c => ({
        ID: c.id, Tên: c.name, SĐT: c.phone, ĐịaChỉ: c.address, NgàyTạo: c.createdAt, GhiChú: c.note || ''
      })));
      XLSX.utils.book_append_sheet(wb, customersSheet, 'Khách hàng');
      
      const categoriesSheet = XLSX.utils.json_to_sheet(categories.map(c => ({ ID: c.id, Tên: c.name })));
      XLSX.utils.book_append_sheet(wb, categoriesSheet, 'Danh mục');
      
      const importsSheet = XLSX.utils.json_to_sheet(imports.map(im => ({
        MãNhập: im.id, SP_ID: im.productId, TênSP: im.name, SKU: im.sku, SL: im.quantity, GiáNhập: im.unitCost || 0,
        TổngGiá: im.totalCost || 0, Ngày: im.createdAt, NCC: im.supplierName || '', GhiChú: im.note || ''
      })));
      XLSX.utils.book_append_sheet(wb, importsSheet, 'Nhập kho');
      
      const exportsSheet = XLSX.utils.json_to_sheet(exports.map(ex => ({
        MãXuất: ex.id, SP_ID: ex.productId, TênSP: ex.name, SKU: ex.sku, SL: ex.quantity, Ngày: ex.createdAt,
        MãĐơn: ex.orderId, Khách: ex.customerName, SĐT: ex.customerPhone
      })));
      XLSX.utils.book_append_sheet(wb, exportsSheet, 'Xuất kho');
      
      const paymentsSheet = XLSX.utils.json_to_sheet((payments || []).map((p: any) => ({
        MãGD: p.id, Loại: p.kind, MãĐơn: p.orderId || '', MãNhập: p.importId || '', SốTiền: p.amount, PhươngThức: p.method,
        Ngày: p.createdAt, GhiChú: p.note || '', Khách: p.customerName || '', NCC: p.supplierName || ''
      })));
      XLSX.utils.book_append_sheet(wb, paymentsSheet, 'Thanh toán');
      
      const filename = `bao_cao_quanlykho_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
      XLSX.writeFile(wb, filename);
    } finally {
      setLoading(false);
    }
  };

  // --- IMPORT JSON ---
  const handleJsonImportClick = () => {
    jsonInputRef.current?.click();
  };

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = await MockBackend.importData(content);
        if (success) {
          alert("Khôi phục dữ liệu hệ thống thành công! Trang web sẽ tải lại.");
          window.location.reload();
        } else {
          alert("File JSON lỗi hoặc không đúng định dạng.");
        }
      }
      setLoading(false);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Cài Đặt Hệ Thống</h2>
        <p className="text-gray-500">Quản lý dữ liệu và cấu hình tài khoản</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* JSON BACKUP CARD */}
        <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Database size={100} className="text-blue-600" />
          </div>
          <div className="flex items-center space-x-3 mb-6 relative z-10">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Database size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Sao Lưu & Khôi Phục (JSON)</h3>
          </div>
          
          <p className="text-sm text-gray-600 mb-6 relative z-10">
            Sao lưu toàn bộ dữ liệu hệ thống (bao gồm đơn hàng và sản phẩm) để phòng trường hợp mất dữ liệu hoặc chuyển thiết bị.
          </p>

          <div className="space-y-3 relative z-10">
            <button 
              onClick={handleExport}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 rounded-lg transition-colors font-medium"
            >
              <Download size={18} />
              <span>Tải Xuống Backup (.json)</span>
            </button>
            <button 
              onClick={handleExportExcel}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg transition-colors font-medium"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
              <span>Xuất Báo Cáo Excel (.xlsx)</span>
            </button>

            <input 
              type="file" 
              ref={jsonInputRef}
              onChange={handleJsonFileChange}
              accept=".json"
              className="hidden"
            />
            <button 
              onClick={handleJsonImportClick}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors font-medium shadow-sm"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
              <span>Khôi Phục Từ File Backup</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 opacity-60 mt-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-gray-100 text-gray-600 rounded-lg">
            <Save size={24} />
          </div>
          <h3 className="text-lg font-bold text-gray-800">Trạng Thái Kết Nối</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {MockBackend.isOnlineMode() 
            ? "Hệ thống đang kết nối với Firebase Online. Dữ liệu sẽ đồng bộ lên mây." 
            : "Hệ thống đang chạy Offline. Dữ liệu được lưu trên trình duyệt này."}
        </p>
      </div>
    </div>
  );
};
