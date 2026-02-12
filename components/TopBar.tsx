import React, { useEffect, useState } from 'react';
import { Menu, User as UserIcon, Bell, Cloud, HardDrive, Wifi } from 'lucide-react';
import { User } from '../types';
import { MockBackend } from '../services/mockBackend';

interface TopBarProps {
  user: User | null;
  onMenuClick: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ user, onMenuClick }) => {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(MockBackend.isOnlineMode());
  }, []);

  return (
    <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 md:px-8 fixed top-0 right-0 left-0 md:left-64 z-10">
      <div className="flex items-center gap-3">
        <button 
          className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-md"
          onClick={onMenuClick}
        >
          <Menu size={24} />
        </button>
        
        {/* Storage Indicator */}
        {isOnline ? (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-xs font-medium" title="Dữ liệu được đồng bộ Online">
            <Cloud size={14} />
            <span>Online Mode</span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-full text-xs font-medium" title="Dữ liệu chỉ được lưu trên thiết bị này">
            <HardDrive size={14} />
            <span>Offline Mode</span>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-4 ml-auto">
        <div className="relative cursor-pointer text-gray-500 hover:text-blue-600">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
        </div>
        
        <div className="flex items-center space-x-3 border-l pl-4 border-gray-200">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-800">{user?.name || 'Admin'}</p>
            <p className="text-xs text-gray-500">Chủ cửa hàng</p>
          </div>
          <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
            <UserIcon size={20} />
          </div>
        </div>
      </div>
    </header>
  );
};