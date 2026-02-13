import React, { useEffect, useState } from 'react';
import { askGemini } from '../services/geminiService';
import { MessageSquare, Send, X, Loader2 } from 'lucide-react';
import { Order, Product } from '../types';
import { MockBackend } from '../services/mockBackend';

interface ChatWidgetProps {
  context?: {
    products?: Product[];
    orders?: Order[];
  };
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ context }) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fast, setFast] = useState(true);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: 'Xin chào! Tôi là trợ lý Gemini. Bạn cần hỗ trợ gì?' }
  ]);

  const [ctxSummary, setCtxSummary] = useState('—');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat_ai_messages');
      if (saved) setMessages(JSON.parse(saved));
      const openSaved = localStorage.getItem('chat_ai_open');
      if (openSaved) setOpen(openSaved === '1');
      const fastSaved = localStorage.getItem('chat_ai_fast');
      if (fastSaved) setFast(fastSaved === '1');
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('chat_ai_messages', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem('chat_ai_open', open ? '1' : '0');
    } catch {}
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem('chat_ai_fast', fast ? '1' : '0');
    } catch {}
  }, [fast]);

  useEffect(() => {
    const compute = async () => {
      try {
        if (context && ((context.products && context.products.length) || (context.orders && context.orders.length))) {
          const p = context.products || [];
          const o = context.orders || [];
          const productSummary = p.slice(0, 10).map(pp => `${pp.name} tồn ${pp.stock}`).join(', ');
          const orderSummary = o.slice(0, 5).map(oo => `${oo.id} ${oo.totalAmount.toLocaleString()}₫`).join(', ');
          setCtxSummary(`Sản phẩm: ${productSummary || '—'} | Đơn gần đây: ${orderSummary || '—'}`);
          return;
        }
        const p = await MockBackend.getProducts();
        const o = await MockBackend.getOrders();
        const productSummary = p.slice(0, 10).map(pp => `${pp.name} tồn ${pp.stock}`).join(', ');
        const orderSummary = o.slice(0, 5).map(oo => `${oo.id} ${oo.totalAmount.toLocaleString()}₫`).join(', ');
        setCtxSummary(`Sản phẩm: ${productSummary || '—'} | Đơn gần đây: ${orderSummary || '—'}`);
      } catch {
        setCtxSummary('—');
      }
    };
    compute();
  }, [context]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    const reply = await askGemini(text, ctxSummary, { fast });
    setMessages(prev => [...prev, { role: 'ai', text: reply }]);
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-indigo-700"
        aria-label="Mở chat AI"
      >
        <MessageSquare size={18} />
        <span className="hidden sm:block">Chat AI</span>
      </button>

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[320px] sm:w-[380px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-indigo-600 text-white px-3 py-2">
            <p className="text-sm font-semibold">Trợ Lý Gemini</p>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-indigo-700 rounded">
              <X size={16} />
            </button>
          </div>
          <div className="h-64 p-3 overflow-y-auto space-y-2">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`max-w-[85%] p-2 rounded-lg text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="animate-spin" size={16} />
                Đang trả lời...
              </div>
            )}
          </div>
          <div className="border-t border-gray-200 p-2 flex items-center gap-2">
            <label className="flex items-center gap-1 text-[12px] text-gray-500">
              <input
                type="checkbox"
                checked={fast}
                onChange={(e) => setFast(e.target.checked)}
              />
              Trả lời nhanh
            </label>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Nhập câu hỏi..."
            />
            <button
              onClick={send}
              disabled={loading}
              className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
