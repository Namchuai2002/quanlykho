import React, { useEffect, useRef, useState } from 'react';
import { Menu, User as UserIcon, Bell, Cloud, HardDrive, RefreshCw, Check, LogOut, Settings, ChevronDown } from 'lucide-react';
import { User } from '../types';
import { MockBackend } from '../services/mockBackend';

interface TopBarProps {
  user: User | null;
  onMenuClick: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ user, onMenuClick, onLogout, onOpenSettings }) => {
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsOnline(MockBackend.isOnlineMode());
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    
    setIsSyncing(true);
    setSyncStatus('idle');
    try {
      await MockBackend.syncLocalDataToFirebase();
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e) {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-xs font-medium" title="Dữ liệu được đồng bộ Online">
              <Cloud size={14} />
              <span>Online Mode</span>
            </div>
            
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                syncStatus === 'success' 
                  ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                  : syncStatus === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
              title="Đồng bộ dữ liệu từ thiết bị này lên hệ thống"
            >
              {syncStatus === 'success' ? (
                <Check size={14} />
              ) : (
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              )}
              <span className="hidden xs:inline">{isSyncing ? 'Đang đồng bộ...' : syncStatus === 'success' ? 'Đã đồng bộ' : 'Đồng bộ'}</span>
            </button>
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
        
        <div ref={profileMenuRef} className="relative border-l pl-4 border-gray-200">
          <button
            onClick={() => setProfileMenuOpen((v) => !v)}
            className="flex items-center space-x-3 hover:bg-gray-50 rounded-xl px-2 py-1.5 transition-colors"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-gray-800">{user?.name || 'Admin'}</p>
              <p className="text-xs text-gray-500">Chủ cửa hàng</p>
            </div>
            <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
              <UserIcon size={20} />
            </div>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20">
              <button
                onClick={() => {
                  setProfileMenuOpen(false);
                  onOpenSettings();
                }}
                className="w-full px-4 py-2.5 text-sm text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Settings size={16} />
                Cài đặt tài khoản
              </button>
              <button
                onClick={() => {
                  setProfileMenuOpen(false);
                  onLogout();
                }}
                className="w-full px-4 py-2.5 text-sm text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <LogOut size={16} />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
