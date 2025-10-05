import { getSimsimiReply } from "../service-hahuyhoang/chat-bot/simsimi/simsimi-api.js";

export async function superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox) {
  if (isSelf || !message.data?.mentions?.length) return false;

  const threadId = message.threadId;
  const mentions = message.data.mentions;
  const content = message.data.content || "";

  if (mentions.length !== 1) return false;

  const mention = mentions[0];
  const mentionLength = mention.len;
  const mentionPosition = mention.pos;
  const mentionUid = mention.uid;
  const botUid = message.botId || api.botId;
  if (mentionUid !== botUid || mentionPosition !== 0) return false;

  const userMessage = content.slice(mentionLength).trim();
  if (!userMessage) return false;

  try {
    const simsimiReply = await getSimsimiReply(userMessage);
    await api.sendMessage(
      { msg: simsimiReply, quote: message },
      threadId,
      message.type
    );
  } catch {
    await api.sendMessage(
      { msg: "Xin lỗi, tôi chưa hiểu bạn nói gì.", quote: message },
      threadId,
      message.type
    );
  }

  return true;
}
