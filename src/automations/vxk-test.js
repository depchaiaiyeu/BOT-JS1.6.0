import { getSimsimiReply } from "../service-hahuyhoang/chat-bot/simsimi/simsimi-api.js";
import { getBotId } from "../index.js";

export async function superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox) {
  if (isSelf || !message.data?.mentions?.length) return false;

  const threadId = message.threadId;
  const mentions = message.data.mentions;
  const botUid = getBotId();

  const botMentioned = mentions.some(m => m.uid === botUid);
  if (!botMentioned) return false;

  const mention = mentions.find(m => m.uid === botUid);
  const userMessage = mention ? message.data.content.slice(mention.len).trim() : "";

  if (!userMessage) {
    await api.sendMessage(
      { msg: "Hót đi chim..?", quote: message },
      threadId,
      message.type
    );
    return true;
  }

  try {
    const simsimiReply = await getSimsimiReply(userMessage, 0.9);
    await api.sendMessage(
      { msg: simsimiReply, quote: message },
      threadId,
      message.type
    );
  } catch {
    await api.sendMessage(
      { msg: "Lỗi mọe rồi...", quote: message },
      threadId,
      message.type
    );
  }

  return true;
}
