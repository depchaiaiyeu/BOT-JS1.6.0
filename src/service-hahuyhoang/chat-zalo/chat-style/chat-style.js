import { MultiMsgStyle, MessageStyle, MessageType } from "../../../api-zalo/index.js";
import { nameServer } from "../../../database/index.js";

export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_GREEN = "15a85f";
export const COLOR_BLUE = "1e90ff";
export const COLOR_PURPLE = "9b59b6";
export const COLOR_ORANGE = "ff6b35";
export const SIZE_18 = "18";
export const SIZE_16 = "14";
export const IS_BOLD = true;

function createGradientStyle(text, isGroup, senderNameLength) {
  const styles = [];
  const startPos = isGroup ? senderNameLength + 1 : 0;
  const serverNameLen = nameServer.length;
  const colors = [COLOR_RED, COLOR_YELLOW, COLOR_GREEN];
  const charsPerColor = Math.ceil(serverNameLen / colors.length);
  
  for (let i = 0; i < colors.length; i++) {
    const start = startPos + (i * charsPerColor);
    const length = i === colors.length - 1 ? serverNameLen - (i * charsPerColor) : charsPerColor;
    if (length > 0) {
      styles.push(MessageStyle(start, length, colors[i], SIZE_18, IS_BOLD));
    }
  }
  
  return MultiMsgStyle(styles);
}

export async function sendMessageInsufficientAuthority(api, message, caption, hasState = true) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const iconState = "\n🚫🚫🚫";
    const isGroup = message.type === MessageType.GroupMessage;

    const style = createGradientStyle(caption, isGroup, senderName.length);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + `\n${caption}${hasState ? iconState : ""}`;
    await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl: 60000,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageQuery(api, message, caption, hasState = true) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const isGroup = message.type === MessageType.GroupMessage;
    const iconState = "\n❓❓❓";

    const style = createGradientStyle(caption, isGroup, senderName.length);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + `\n${caption}${hasState ? iconState : ""}`;
    await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl: 60000,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageWarning(api, message, caption, hasState = true) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const isGroup = message.type === MessageType.GroupMessage;
    const iconState = "\n🚨🚨🚨";

    const style = createGradientStyle(caption, isGroup, senderName.length);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + `\n${caption}${hasState ? iconState : ""}`;
    await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl: 60000,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageComplete(api, message, caption, hasState = true) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const isGroup = message.type === MessageType.GroupMessage;
    const iconState = "\n✅✅✅";

    const style = createGradientStyle(caption, isGroup, senderName.length);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + `\n${caption}${hasState ? iconState : ""}`;
    await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl: 60000,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageFailed(api, message, caption, hasState = true) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const isGroup = message.type === MessageType.GroupMessage;
    const iconState = "\n❌❌❌";

    const style = createGradientStyle(caption, isGroup, senderName.length);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + `\n${caption}${hasState ? iconState : ""}`;
    await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        ttl: 600000,
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageStateQuote(api, message, caption, state, ttl = 0, onState = true) {
  try {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    const threadId = message.threadId;
    const iconState = state ? "✅✅✅" : "❌❌❌";
    const style = createGradientStyle(caption, true, senderName.length);
    let msg = `${senderName}\n${nameServer}` + `\n${caption}${onState ? "\n" + iconState : ""}`;
    await api.sendMessage(
      {
        msg: msg,
        quote: message,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        style: style,
        ttl: ttl,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageState(api, threadId, caption, state, ttl = 0) {
  try {
    const iconState = state ? "✅✅✅" : "❌❌❌";
    const style = createGradientStyle(caption, false, 0);
    let msg = `${nameServer}` + `\n${caption}\n${iconState}`;
    await api.sendMessage(
      {
        msg: msg,
        style: style,
        ttl: ttl,
        linkOn: false,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageResultRequest(api, type = MessageType.GroupMessage, threadId, caption, state, ttl = 0) {
  try {
    const iconState = state ? "✅✅✅" : "❌❌❌";
    const style = createGradientStyle(caption, false, 0);
    let msg = `${nameServer}` + `\n${caption}\n${iconState}`;
    await api.sendMessage(
      {
        msg: msg,
        style: style,
        ttl: ttl,
        linkOn: false,
      },
      threadId,
      type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageFromSQL(api, message, result, hasState = true, ttl = 0) {
  try {
    const threadId = message.threadId;
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName;
    const isGroup = message.type === MessageType.GroupMessage;

    const style = createGradientStyle(result.message, isGroup, senderName.length);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + `\n${result.message}`;
    if (hasState) {
      const state = result.success ? "✅✅✅" : "❌❌❌";
      msg += `\n${state}`;
    }
    await api.sendMessage(
      {
        msg: msg,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        style: style,
        quote: message,
        linkOn: false,
        ttl: ttl,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageImageNotQuote(api, result, threadId, waitingImagePath, ttl = 0, isUseProphylactic = false) {
  const style = createGradientStyle(result.message, false, 0);
  try {
    await api.sendMessage(
      {
        msg: result.message,
        attachments: [waitingImagePath],
        isUseProphylactic: isUseProphylactic,
        ttl: ttl,
        style: style,
        linkOn: false,
        mentions: result.mentions,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageFromSQLImage(api, message, result, hasState = true, waitingImagePath) {
  try {
    const threadId = message.threadId;
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName;
    const isGroup = message.type === MessageType.GroupMessage;

    const style = createGradientStyle(result.message, isGroup, senderName.length);

    let msg = `${isGroup ? senderName + "\n" : ""}${nameServer}` + `\n${result.message}`;
    if (hasState) {
      const state = result.success ? "✅✅✅" : "❌❌❌";
      msg += `\n${state}`;
    }
    await api.sendMessage(
      {
        msg: msg,
        mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
        attachments: waitingImagePath ? [waitingImagePath] : [],
        style: style,
        linkOn: false,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.log(error);
  }
}

export async function sendMessageWarningRequest(api, message, objectData, ttl = 0) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isGroup = message.type === MessageType.GroupMessage;

  const styles = [];
  const startPos = isGroup ? senderName.length + 1 : 0;
  const captionLen = objectData.caption.length;
  const colors = [COLOR_RED, COLOR_ORANGE, COLOR_YELLOW];
  const charsPerColor = Math.ceil(captionLen / colors.length);
  
  for (let i = 0; i < colors.length; i++) {
    const start = startPos + (i * charsPerColor);
    const length = i === colors.length - 1 ? captionLen - (i * charsPerColor) : charsPerColor;
    if (length > 0) {
      styles.push(MessageStyle(start, length, colors[i], SIZE_16, IS_BOLD));
    }
  }
  
  const style = MultiMsgStyle(styles);
  let msg = `${isGroup ? senderName + "\n" : ""}` + `${objectData.caption}`;

  return await api.sendMessage(
    {
      msg: msg,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
      attachments: objectData.imagePath ? [objectData.imagePath] : [],
      style,
      ttl,
      linkOn: false,
    },
    threadId,
    message.type
  );
}

export async function sendMessageProcessingRequest(api, message, objectData, ttl = 0) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isGroup = message.type === MessageType.GroupMessage;

  const styles = [];
  const startPos = isGroup ? senderName.length + 1 : 0;
  const captionLen = objectData.caption.length;
  const colors = [COLOR_YELLOW, COLOR_ORANGE, COLOR_GREEN];
  const charsPerColor = Math.ceil(captionLen / colors.length);
  
  for (let i = 0; i < colors.length; i++) {
    const start = startPos + (i * charsPerColor);
    const length = i === colors.length - 1 ? captionLen - (i * charsPerColor) : charsPerColor;
    if (length > 0) {
      styles.push(MessageStyle(start, length, colors[i], SIZE_16, IS_BOLD));
    }
  }
  
  const style = MultiMsgStyle(styles);
  let msg = `${isGroup ? senderName + "\n" : ""}` + `${objectData.caption}`;

  return await api.sendMessage(
    {
      msg: msg,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
      attachments: objectData.imagePath ? [objectData.imagePath] : [],
      style,
      ttl,
      linkOn: false,
    },
    threadId,
    message.type
  );
}

export async function sendMessageCompleteRequest(api, message, objectData, ttl = 0) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isGroup = message.type === MessageType.GroupMessage;

  const styles = [];
  const startPos = isGroup ? senderName.length + 1 : 0;
  const captionLen = objectData.caption.length;
  const colors = [COLOR_GREEN, COLOR_BLUE, COLOR_PURPLE];
  const charsPerColor = Math.ceil(captionLen / colors.length);
  
  for (let i = 0; i < colors.length; i++) {
    const start = startPos + (i * charsPerColor);
    const length = i === colors.length - 1 ? captionLen - (i * charsPerColor) : charsPerColor;
    if (length > 0) {
      styles.push(MessageStyle(start, length, colors[i], SIZE_16, IS_BOLD));
    }
  }
  
  const style = MultiMsgStyle(styles);
  let msg = `${isGroup ? senderName + "\n" : ""}` + `${objectData.caption}`;

  return await api.sendMessage(
    {
      msg: msg,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
      attachments: objectData.imagePath ? [objectData.imagePath] : [],
      style,
      ttl,
      linkOn: false,
    },
    threadId,
    message.type
  );
}

export async function sendMessageTag(api, message, objectData, ttl = 0) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isGroup = message.type === MessageType.GroupMessage;

  const styles = [];
  const startPos = isGroup ? senderName.length + 1 : 0;
  const captionLen = objectData.caption.length;
  const colors = [COLOR_GREEN, COLOR_BLUE, COLOR_PURPLE];
  const charsPerColor = Math.ceil(captionLen / colors.length);
  
  for (let i = 0; i < colors.length; i++) {
    const start = startPos + (i * charsPerColor);
    const length = i === colors.length - 1 ? captionLen - (i * charsPerColor) : charsPerColor;
    if (length > 0) {
      styles.push(MessageStyle(start, length, colors[i], SIZE_16, IS_BOLD));
    }
  }
  
  const style = MultiMsgStyle(styles);
  
  let temp = `${isGroup ? senderName + "\n" : ""}`;
  let msg = temp + `${objectData.caption}`;

  if (objectData.mentions && Array.isArray(objectData.mentions)) {
    objectData.mentions = objectData.mentions.map(mention => ({
      ...mention,
      pos: mention.pos + temp.length
    }));
  }

  return await api.sendMessage(
    {
      msg: msg,
      mentions: [
        { pos: 0, uid: senderId, len: senderName.length },
        ...(objectData.mentions || [])
      ],
      attachments: objectData.imagePath ? [objectData.imagePath] : [],
      style,
      ttl,
      linkOn: false,
    },
    threadId,
    message.type
  );
}
