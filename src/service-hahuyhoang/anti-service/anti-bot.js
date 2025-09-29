export async function handleAntiBotCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  try {
    const messageData = JSON.stringify(message.data, null, 2);
    await api.sendMessage(
      {
        msg: `📡 Dữ liệu message.data:\n\n${messageData}`,
        quote: message,
        ttl: 60000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    await api.sendMessage(
      {
        msg: `Lỗi khi lấy dữ liệu: ${error.message}`,
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  }

  return true;
}
