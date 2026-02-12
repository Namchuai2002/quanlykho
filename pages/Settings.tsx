import React, { useRef, useState } from 'react';
import { MockBackend } from '../services/mockBackend';
import { Download, Upload, Save, Database, Loader2 } from 'lucide-react';

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
