import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import { sendMessageComplete, sendMessageFailed, sendMessageProcessingRequest, sendMessageQuery, sendMessageStateQuote } from "../../chat-zalo/chat-style/chat-style.js";
import { nameServer } from "../../../database/index.js";

const geminiApiKey = "AIzaSyCG4xn5IZSjfdBhwZ2DMC5GfMIwi_ZseQA";
const genAI = new GoogleGenerativeAI(geminiApiKey);

const chatSessions = new Map();

let geminiModel;

export function initGeminiModel() {
  if (geminiModel) return;
  const systemInstruction = `Bạn tên là AIMI
Bạn được tạo ra bởi duy nhất Hà Huy Hoàng
Mọi Câu Hỏi Đều Sẽ Có Cấu Trúc [Tên Người Hỏi: Câu Hỏi]
Nếu tên người hỏi là Hoàng thì bạn sẽ nhận họ là Đại Ca
Còn với người khác bạn sẽ là Cậu, Tui
Trả lời đầy đủ những thông tin người khác cần
Khi trả lời sẽ Không đề cập tên người hỏi
Trả lời dễ thương vào nha
Có thể sử dụng emoji phù hợp để tăng tính tương tác`;

  geminiModel = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.9,
      topK: 40,
      topP: 0.8,
    },
    systemInstruction: systemInstruction
  });
}

const requestQueue = [];
let isProcessing = false;
const DELAY_THINKING = 0;
const DELAY_BETWEEN_REQUESTS = 3000;

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  isProcessing = true;

  while (requestQueue.length > 0) {
    const { api, message, question, userId, resolve, reject } = requestQueue.shift();

    if (DELAY_THINKING > 0) {
      await sendMessageProcessingRequest(api, message, {
        caption: "Chờ suy nghĩ xíu..."
      }, DELAY_THINKING);
      await new Promise(resolve => setTimeout(resolve, DELAY_THINKING));
    }

    try {
      initGeminiModel();
      const session = getChatSession(userId);
      session.lastInteraction = Date.now();

      session.history.push({
        role: "user",
        content: question
      });

      if (session.history.length > 20) {
        session.history = session.history.slice(-20);
      }

      const result = await session.chat.sendMessage(question);
      const response = result.response.text();

      session.history.push({
        role: "assistant",
        content: response
      });

      cleanupOldSessions();

      resolve(response);
    } catch (error) {
      reject(error);
    }

    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
  }

  isProcessing = false;
}

function getChatSession(userId) {
  if (!chatSessions.has(userId)) {
    const chat = geminiModel.startChat({
      history: [],
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.8,
      }
    });
    chatSessions.set(userId, {
      chat,
      history: [],
      lastInteraction: Date.now()
    });
  }
  return chatSessions.get(userId);
}

function cleanupOldSessions() {
  const MAX_IDLE_TIME = 30 * 60 * 1000;
  const now = Date.now();

  for (const [userId, session] of chatSessions.entries()) {
    if (now - session.lastInteraction > MAX_IDLE_TIME) {
      chatSessions.delete(userId);
    }
  }
}

export async function callGeminiAPI(api, message, question, userId) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ api, message, question, userId, resolve, reject });
    processQueue();
  });
}

export async function askGeminiCommand(api, message, aliasCommand) {
  const content = getContent(message);
  const userId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();

  const question = content.replace(`${prefix}${aliasCommand}`, "").trim();
  if (question === "") {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp! 🤔");
    return;
  }

  if (question.toLowerCase() === "reset") {
    chatSessions.delete(userId);
    await sendMessageComplete(api, message, "Đã xóa lịch sử cuộc trò chuyện của bạn! 🔄", false);
    return;
  }

  try {
    const replyText = await callGeminiAPI(api, message, senderName + ": " + question, userId);

    if (replyText === null) {
      replyText = "Xin lỗi, hiện tại tôi Không thể trả lời câu hỏi này. Bạn vui lòng thử lại sau nhé! 🙏";
    }

    // Hiển thị số tin nhắn trong lịch sử
    // const session = getChatSession(userId);
    // const historyCount = session.history.length;
    // replyText += `\n\n[Tin nhắn: ${historyCount}/20]`;

    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu Gemini:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn. 😢", true);
  }
}

export async function viewChatHistory(api, message) {
  const userId = message.senderID;
  const session = chatSessions.get(userId);

  if (!session || session.history.length === 0) {
    await sendMessageComplete(api, message, "Bạn chưa có lịch sử trò chuyện nào! 📝", false);
    return;
  }

  const history = session.history.map((msg, index) => {
    const role = msg.role === "user" ? "Bạn" : nameServer;
    return `${index + 1}. ${role}: ${msg.content}`;
  }).join("\n\n");

  await sendMessageComplete(api, message, `Lịch sử trò chuyện của bạn:\n\n${history}`, false);
}