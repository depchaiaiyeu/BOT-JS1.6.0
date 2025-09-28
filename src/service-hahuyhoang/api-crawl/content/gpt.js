import axios from "axios";
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest, sendMessageFailed, sendMessageQuery, sendMessageStateQuote } from "../../chat-zalo/chat-style/chat-style.js";
import { MultiMsgStyle, MessageStyle, MessageMention } from "../../../api-zalo/index.js";

export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_PINK = "FF1493";
export const COLOR_GREEN = "15a85f";
export const SIZE_18 = "18";
export const SIZE_16 = "14";
export const IS_BOLD = true;

const openaiApiKey = "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";
const openaiUrl = "https://api.openai.com/v1/chat/completions";

export async function askGPTCommand(api, message) {
  const content = getContent(message);
  const prefix = getGlobalPrefix();
  const question = content.replace(`${prefix}gpt`, "").trim();

  if (!question) {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp! 🤔");
    return;
  }

  try {
    let replyText = await callGPTAPI(question);
    if (!replyText) replyText = "Xin lỗi, hiện tại tôi không thể trả lời câu hỏi này. 🙏";
    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu OpenAI:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn. 😢", true);
  }
}

export async function callGPTAPI(question) {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${openaiApiKey}`
  };

  const data = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Bạn tên là GPT. Bạn được tạo ra bởi duy nhất Vũ Xuân Kiên. Trả lời dễ thương, có thể dùng emoji để tăng tính tương tác."
      },
      {
        role: "user",
        content: question
      }
    ],
    temperature: 0.9,
    max_tokens: 2048
  };

  try {
    const response = await axios.post(openaiUrl, data, { headers });
    const json_data = response.data;
    return json_data.choices[0].message.content;
  } catch (error) {
    console.error("Lỗi khi gọi API OpenAI:", error);
    return null;
  }
}

export async function askGemini(api, message) {
  const content = getContent(message);
  const prefix = getGlobalPrefix();
  const question = content.replace(`${prefix}gpt`, "").trim();
  
  if (question === "") {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp! 🤔");
    return;
  }

  try {
    const replyText = await callGPTAPI(question);
    if (!replyText) {
      throw new Error("Không nhận được phản hồi từ API");
    }
    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu GPT:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn. 😢", true);
  }
}
