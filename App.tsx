import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Orders } from './pages/Orders';
import { Settings } from './pages/Settings';
import { Customers } from './pages/Customers';
import { Login } from './pages/Login';
import { User } from './types';
import { MockBackend } from './services/mockBackend';
import { ChatWidget } from './components/ChatWidget';
import { Debts } from './pages/Debts';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(() => {
    return localStorage.getItem('current_page') || 'dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bootReady, setBootReady] = useState(false);

  useEffect(() => {
    localStorage.setItem('current_page', currentPage);
  }, [currentPage]);

  useEffect(() => {
    let cancelled = false;
    let intervalTimer: any = null;

    const bootAuth = async () => {
      // 1. Sync auth config (tài khoản admin) từ Firebase về trước, bao gồm cả migration nếu có
      try {
        await MockBackend.refreshAuthCache();
      } catch {}

      // 2. Đọc user từ local cache và set optimistic (tránh flash màn hình login)
      const currentUser = MockBackend.getCurrentUser();
      if (currentUser) setUser(currentUser);

      if (currentUser) {
        // 3. Kiểm tra phiên so với server (tránh trường hợp đổi mật khẩu nơi khác)
        try {
          const result = await MockBackend.validateSession();
          if (cancelled) return;
          if (result.valid && result.user) {
            setUser(result.user);
            if (MockBackend.isOnlineMode()) {
              MockBackend.syncLocalDataToFirebase().catch(console.error);
            }
          } else {
            // Phiên không hợp lệ (đổi mật khẩu nơi khác) → force logout
            MockBackend.logout();
            setUser(null);
          }
        } catch {
          // Check lỗi mạng → giữ phiên local (tốt nhất có thể)
        }
      }

      if (!cancelled) setBootReady(true);
    };

    bootAuth();

    // --- Định kỳ kiểm tra lại session (đổi mật khẩu nơi khác sẽ logout) ---
    intervalTimer = setInterval(async () => {
      if (!MockBackend.getCurrentUser()) return;
      try {
        const r = await MockBackend.validateSession();
        if (!r.valid) {
          MockBackend.logout();
          setUser(null);
        } else if (r.user) {
          // Update user state nếu có thay đổi tên (tránh re-render thừa nếu giống)
          setUser((prev) => {
            if (!prev) return r.user;
            if (prev.name === r.user.name && prev.username === r.user.username) return prev;
            return r.user;
          });
        }
      } catch {}
    }, 30 * 1000);

    // --- Kiểm tra lại khi cửa sổ được focus trở lại (chuyển tab / máy khác quay lại) ---
    const onFocus = async () => {
      if (!MockBackend.getCurrentUser()) return;
      try {
        const r = await MockBackend.validateSession();
        if (!r.valid) {
          MockBackend.logout();
          setUser(null);
        }
      } catch {}
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      if (intervalTimer) clearInterval(intervalTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleUserUpdated = (updatedUser: User) => {
    setUser(updatedUser);
  };

  const handleLogout = () => {
    MockBackend.logout();
    setUser(null);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return <Inventory />;
      case 'orders':
        return <Orders />;
      case 'customers':
        return <Customers />;
      case 'settings':
        return <Settings user={user} onUserUpdated={handleUserUpdated} />;
      case 'debts':
        return <Debts />;
      default:
        return <Dashboard />;
    }
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Sidebar for Desktop */}
      <Sidebar 
        currentPage={currentPage} 
        onNavigate={(page) => {
          setCurrentPage(page);
          setSidebarOpen(false); // Close mobile drawer on nav
        }} 
        onLogout={handleLogout}
      />

      {/* Mobile Drawer (Overlay) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)}></div>
          <div className="absolute left-0 top-0 h-full w-64 bg-primary z-50 animate-in slide-in-from-left duration-200">
             <div className="p-6 text-white border-b border-gray-700">
                <h1 className="text-2xl font-bold">QuanLyKho</h1>
             </div>
             <nav className="p-4 space-y-2">
                <button onClick={() => { setCurrentPage('dashboard'); setSidebarOpen(false); }} className="block w-full text-left text-gray-300 p-3 hover:bg-gray-800 rounded">Tổng Quan</button>
                <button onClick={() => { setCurrentPage('inventory'); setSidebarOpen(false); }} className="block w-full text-left text-gray-300 p-3 hover:bg-gray-800 rounded">Kho Hàng</button>
                <button onClick={() => { setCurrentPage('orders'); setSidebarOpen(false); }} className="block w-full text-left text-gray-300 p-3 hover:bg-gray-800 rounded">Đơn Hàng</button>
                <button onClick={() => { setCurrentPage('customers'); setSidebarOpen(false); }} className="block w-full text-left text-gray-300 p-3 hover:bg-gray-800 rounded">Khách Hàng</button>
                <button onClick={() => { setCurrentPage('settings'); setSidebarOpen(false); }} className="block w-full text-left text-gray-300 p-3 hover:bg-gray-800 rounded">Cài Đặt</button>
                <button onClick={handleLogout} className="block w-full text-left text-red-400 p-3 hover:bg-gray-800 rounded mt-10">Đăng Xuất</button>
             </nav>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="md:ml-64 min-h-screen flex flex-col transition-all duration-300">
        <TopBar
          user={user}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          onLogout={handleLogout}
          onOpenSettings={() => setCurrentPage('settings')}
        />
        
        <main className="flex-1 p-4 md:p-8 mt-16 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {renderPage()}
          </div>
        </main>
        <ChatWidget />
      </div>
    </div>
  );
};

export default App;
