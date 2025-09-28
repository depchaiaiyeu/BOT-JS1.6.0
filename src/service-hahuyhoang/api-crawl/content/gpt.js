import axios from "axios";
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest, sendMessageFailed, sendMessageQuery } from "../../chat-zalo/chat-style/chat-style.js";
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
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();

  const question = content.replace(`${prefix}gpt`, "").trim();

  try {
    let replyText = await callOpenAIAPI(question, message.data.dName);

    if (replyText === null) {
      replyText = "Tôi không thể trả lời câu hỏi này ngay bây giờ.";
    }

    await sendMessageCompleteRequest(api, message, {
      caption: replyText,
    }, 600000);

  } catch (error) {
    console.error("Lỗi khi gọi API OpenAI:", error);
    try {
      await sendMessageCompleteRequest(api, message, {
        caption: "Xin lỗi, tôi không thể trả lời câu hỏi này ngay bây giờ.",
      }, 600000);
    } catch (sendError) {
      console.error("Lỗi khi gửi tin nhắn xin lỗi:", sendError);
    }
  }
}

export async function callOpenAIAPI(question, senderName) {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${openaiApiKey}`
  };

  const data = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Bạn GPT. Bạn được tạo ra bởi duy nhất Vũ Xuân Kiên. Trả lời dễ thương, có thể dùng emoji để tăng tính tương tác."
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
    let replyText = `${senderName}\n\n`;
    replyText += json_data.choices[0].message.content;
    return replyText;
  } catch (error) {
    console.error("Lỗi khi gọi API OpenAI:", error);
    return null;
  }
}

export async function askGemini(api, message) {
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;

  const content = getContent(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();

  const question = content.replace(`${prefix}gpt`, "").trim();
  if (question === "") {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp!");
    return;
  }

  try {
    const replyText = await callOpenAIAPI(question, senderName);

    if (!replyText) {
      throw new Error("Không nhận được phản hồi từ API");
    }

    const fullMessage = `${senderName}\n\n${replyText.replace(`${senderName}\n`, "")}`;
    const style = MultiMsgStyle([
      MessageStyle(senderName.length + 1, fullMessage.length, COLOR_GREEN, SIZE_16, IS_BOLD)
    ]);
    
    await api.sendMessage(
      {
        msg: fullMessage,
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        style: style,
        ttl: 300000,
      },
      message.threadId,
      message.type
    );

  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu GPT:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn.");
  }
}
