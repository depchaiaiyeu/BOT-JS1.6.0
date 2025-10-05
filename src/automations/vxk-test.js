import { getSimsimiReply } from "../service-hahuyhoang/chat-bot/simsimi/simsimi-api.js";
import { getBotId } from "../index.js";

const lastAutoReplyMap = new Map();
const AUTO_REPLY_COOLDOWN = 5 * 60 * 1000;
const MESSAGE_TTL = AUTO_REPLY_COOLDOWN;

export async function superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox) {
  if (isSelf || !message.data?.mentions?.length) return false;

  const threadId = message.threadId;
  const mentions = message.data.mentions;
  const senderId = message.data.uidFrom;
  const botUid = getBotId();

  const botMentioned = mentions.some(m => m.uid === botUid);
  if (!botMentioned) return false;

  const mention = mentions.find(m => m.uid === botUid);
  const userMessage = mention ? message.data.content.slice(mention.len).trim() : "";

  const now = Date.now();
  if (!lastAutoReplyMap.has(threadId)) lastAutoReplyMap.set(threadId, new Map());
  const groupMap = lastAutoReplyMap.get(threadId);
  const lastSent = groupMap.get(senderId) || 0;

  if (!userMessage) {
    if (now - lastSent >= AUTO_REPLY_COOLDOWN) {
      groupMap.set(senderId, now);
      await api.sendMessage(
        {
          msg:
            "Xin chào, mình là bot của anh Kiên.\n" +
            "Hiện tại anh Kiên đang offine, nếu bạn cần giúp đỡ có thể để lại tin nhắn, anh ấy sẽ đọc lại sau!",
          ttl: MESSAGE_TTL
        },
        threadId,
        message.type
      );
    }
    return true;
  }

  try {
    const simsimiReply = await getSimsimiReply(userMessage, 0.9);
    await api.sendMessage(
      { msg: simsimiReply, quote: message, ttl: MESSAGE_TTL },
      threadId,
      message.type
    );
  } catch {
    await api.sendMessage(
      { msg: "Xin lỗi, tôi chưa hiểu bạn nói gì, bạn có thể nói rõ hơn được không ạ?", quote: message, ttl: MESSAGE_TTL },
      threadId,
      message.type
    );
  }

  return true;
}
