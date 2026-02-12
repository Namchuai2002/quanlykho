import React from 'react';
import { LayoutDashboard, Package, ShoppingCart, LogOut, Settings, Users } from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, onLogout }) => {
  const navItems = [
    { id: 'dashboard', label: 'Tổng Quan', icon: <LayoutDashboard size={20} /> },
    { id: 'inventory', label: 'Kho Hàng', icon: <Package size={20} /> },
    { id: 'orders', label: 'Đơn Hàng', icon: <ShoppingCart size={20} /> },
    { id: 'customers', label: 'Khách Hàng', icon: <Users size={20} /> },
    { id: 'settings', label: 'Cài Đặt', icon: <Settings size={20} /> },
  ];

  return (
    <div className="w-64 bg-primary text-white flex flex-col h-screen fixed left-0 top-0 shadow-xl z-10 transition-all hidden md:flex">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-blue-400">QuanLyKho</h1>
        <p className="text-xs text-gray-400 mt-1">Hệ thống quản lý nội bộ</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
              currentPage === item.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={onLogout}
          className="w-full flex items-center space-x-3 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <LogOut size={20} />
          <span>Đăng Xuất</span>
        </button>
      </div>
    </div>
  );
};
