import { GoogleGenAI } from "@google/genai";
import { Product, Order, OrderStatus } from "../types";

const initGenAI = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const analyzeBusinessData = async (products: Product[], orders: Order[]) => {
  const ai = initGenAI();
  if (!ai) return "Chưa cấu hình API Key. Vui lòng thêm API Key vào biến môi trường.";

  // Summarize data to send to Gemini (avoid sending too much data)
  const productSummary = products.map(p => `${p.name} (Tồn: ${p.stock}, Giá: ${p.price})`).join(', ');
  const orderSummary = orders.slice(0, 20).map(o => `Đơn ${o.id}: ${o.totalAmount} VND - ${o.status}`).join(', ');
  const totalRev = orders.filter(o => o.status !== OrderStatus.CANCELLED).reduce((sum, o) => sum + o.totalAmount, 0);

  const prompt = `
    Bạn là trợ lý cửa hàng. Hãy đưa ra gợi ý ngắn gọn dựa trên dữ liệu dưới đây để giúp chủ cửa hàng ra quyết định nhanh:
    
    TỔNG DOANH THU: ${totalRev.toLocaleString()} VND
    
    DANH SÁCH SẢN PHẨM VÀ TỒN KHO:
    ${productSummary}

    CÁC ĐƠN HÀNG GẦN ĐÂY:
    ${orderSummary}

    Viết 1 đoạn gợi ý (tiếng Việt) tóm tắt tình hình, cảnh báo mặt hàng sắp hết (tồn < 10), và đưa ra 2 lời khuyên cụ thể để tăng doanh thu hoặc quản lý kho tốt hơn.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Không thể phân tích dữ liệu lúc này.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Đã xảy ra lỗi khi kết nối với trợ lý AI.";
  }
};

export const askGemini = async (message: string, context?: string, options?: { fast?: boolean }) => {
  const ai = initGenAI();
  if (!ai) return "Chưa cấu hình API Key. Vui lòng thêm API Key vào biến môi trường.";
  const prompt = `
    Bạn đang trò chuyện với chủ cửa hàng. Trả lời ngắn gọn, súc tích, bằng tiếng Việt.${options?.fast ? ' Ưu tiên trả lời nhanh, tối đa 40 từ.' : ''}
    Bối cảnh: ${context || '—'}
    Câu hỏi: ${message}
  `;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Không thể trả lời lúc này.";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "Đã xảy ra lỗi khi kết nối với trợ lý AI.";
  }
};
