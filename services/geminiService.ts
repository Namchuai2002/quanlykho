import { GoogleGenAI } from "@google/genai";
import { Product, Order } from "../types";

const initGenAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const analyzeBusinessData = async (products: Product[], orders: Order[]) => {
  const ai = initGenAI();
  if (!ai) return "Chưa cấu hình API Key. Vui lòng thêm API Key vào biến môi trường.";

  // Summarize data to send to Gemini (avoid sending too much data)
  const productSummary = products.map(p => `${p.name} (Tồn: ${p.stock}, Giá: ${p.price})`).join(', ');
  const orderSummary = orders.slice(0, 20).map(o => `Đơn ${o.id}: ${o.totalAmount} VND - ${o.status}`).join(', ');
  const totalRev = orders.reduce((sum, o) => sum + o.totalAmount, 0);

  const prompt = `
    Bạn là một trợ lý ảo chuyên gia cho chủ cửa hàng bán lẻ. Dưới đây là dữ liệu hiện tại của cửa hàng:
    
    TỔNG DOANH THU: ${totalRev.toLocaleString()} VND
    
    DANH SÁCH SẢN PHẨM VÀ TỒN KHO:
    ${productSummary}

    CÁC ĐƠN HÀNG GẦN ĐÂY:
    ${orderSummary}

    Hãy phân tích ngắn gọn trong 1 đoạn văn (tiếng Việt) về tình hình kinh doanh, cảnh báo các mặt hàng sắp hết (nếu tồn < 10), và đưa ra 2 lời khuyên cụ thể để tăng doanh thu hoặc quản lý kho tốt hơn.
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
