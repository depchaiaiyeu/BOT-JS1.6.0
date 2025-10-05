import { getSimsimiReply } from "../service-hahuyhoang/chat-bot/simsimi/simsimi-api.js";
import { getBotId } from "../index.js";

export async function superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox) {
  if (isSelf || !message.data?.mentions?.length) return false;

  const threadId = message.threadId;
  const mentions = message.data.mentions;
  if (mentions.length !== 1) return false;

  const botUid = getBotId();
  const mention = mentions[0];
  if (mention.uid !== botUid || mention.pos !== 0) return false;

  const userMessage = message.data.content.slice(mention.len).trim();
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
