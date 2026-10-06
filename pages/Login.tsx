import React, { useEffect, useState } from 'react';
import { MockBackend } from '../services/mockBackend';
import { User } from '../types';
import { ShieldCheck, User as UserIcon, Lock, Loader2, Store } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [detectingMode, setDetectingMode] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await MockBackend.refreshAuthCache();
        const has = await MockBackend.hasAdminAccountAsync();
        if (alive) setSetupMode(!has);
      } catch {
        if (alive) setSetupMode(!MockBackend.hasAdminAccount());
      } finally {
        if (alive) setDetectingMode(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (setupMode) {
        if (password !== confirmPassword) {
          setError('Mật khẩu xác nhận không khớp.');
          return;
        }
        await MockBackend.setupAdminAccount(username, password);
        setSetupMode(false);
        setPassword('');
        setConfirmPassword('');
        return;
      }
      const user = await MockBackend.login(username, password);
      if (user) {
        onLogin(user);
      } else {
        setError('Thông tin đăng nhập không chính xác.');
      }
    } catch (e) {
      setError((e as Error).message || 'Đã xảy ra lỗi hệ thống.');
    } finally {
      setLoading(false);
    }
  };

  const hint = detectingMode
    ? 'Đang kết nối hệ thống...'
    : setupMode
      ? 'Thiết lập tài khoản quản trị lần đầu'
      : 'Đăng nhập tài khoản quản trị';

  const titleAction = detectingMode
    ? 'Đang tải...'
    : loading
      ? 'Đang xác thực...'
      : setupMode
        ? 'Tạo Tài Khoản Quản Trị'
        : 'Truy Cập Hệ Thống';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border-t-4 border-blue-600">
        <div className="text-center mb-8">
          <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 ring-4 ring-blue-50">
            <Store size={40} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Quản Lý Nội Bộ</h2>
          <p className="text-gray-500 mt-2">{hint}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center flex items-center justify-center gap-2">
              <ShieldCheck size={16} />
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Tài khoản quản trị</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                disabled={detectingMode}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:bg-gray-100 disabled:text-gray-400"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-400">
              Tài khoản quản trị được đồng bộ trên toàn bộ thiết bị.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Mã bảo mật</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="password"
                disabled={detectingMode}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:bg-gray-100 disabled:text-gray-400"
                placeholder={setupMode ? 'Tạo mật khẩu quản trị' : 'Nhập mật khẩu quản trị'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {setupMode && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Xác nhận mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="password"
                  disabled={detectingMode}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:bg-gray-100 disabled:text-gray-400"
                  placeholder="Nhập lại mật khẩu"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || detectingMode}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg hover:shadow-xl flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {(loading || detectingMode) && <Loader2 className="animate-spin" size={20} />}
            {titleAction}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-gray-100 pt-6">
          <p className="text-xs text-gray-400">
            Hệ thống quản lý độc quyền. <br/>
            Vui lòng liên hệ kỹ thuật nếu quên mật khẩu.
          </p>
        </div>
      </div>
    </div>
  );
};
