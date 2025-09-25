import { MessageMention, Zalo, ZaloApiError } from "../api-zalo/index.js";
import { appContext } from "../api-zalo/context.js";
import { encodeAES, handleZaloResponse, request, makeURL, decodeAES } from "../api-zalo/utils.js";
import { getBotId } from "../index.js";
import { getUserInfoData } from "../service-hahuyhoang/info-service/user-info.js";
import * as cv from "../utils/canvas/index.js";
import { deleteFile } from "../utils/util.js";
import { getRecentMessage } from "../commands/bot-manager/recent-message.js";

// Thêm map để theo dõi hành vi tag
const tagBehaviorMap = new Map();

// Thêm hàm kiểm tra và xử lý hành vi tag
function checkTagBehavior(senderId, mentionsCount, threadId) {
  const now = Date.now();
  if (!tagBehaviorMap.has(senderId)) {
    tagBehaviorMap.set(senderId, {
      count: 1,
      timestamps: [now],
      threadId: threadId
    });
    return false;
  }

  const userData = tagBehaviorMap.get(senderId);
  const tenSecondsAgo = now - 5000; // 10 giây tính bằng milliseconds

  // Lọc bỏ các timestamps cũ hơn 10 giây
  userData.timestamps = userData.timestamps.filter(time => time > tenSecondsAgo);
  userData.timestamps.push(now);
  userData.count = userData.timestamps.length;

  // Kiểm tra vi phạm: 2 lần tag trong 10 giây và mỗi lần > 5 người
  if (userData.count >= 1 && mentionsCount > 5) {
    tagBehaviorMap.delete(senderId); // Reset sau khi phát hiện vi phạm
    return true;
  }

  return false;
}

export async function superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox) {
  if (isSelf || isAdminBox || !botIsAdminBox) return false;

  const threadId = message.threadId;
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const mentionsCount = message.data?.mentions?.length || 0;

  if (mentionsCount > 10) {
    try {
      await api.blockUsers(threadId, [senderId]);
      await api.sendMessage(
        {
          msg: `${senderName} Tag Nhiều À, Cút!.`,
          
          mentions: [MessageMention(senderId, senderName.length, 0)]
        },
        threadId,
        message.type
      );
    } catch (error) {
      console.error("Không thể block người này:", error);
    }
    return true;
  }

  return false;
}

export async function testFutureGroup(api, message, groupInfo) {
  const threadId = message.threadId;
  const idBot = getBotId();
  try {
    await handleEncryptedMessage(api, message, threadId);
    // const sentCount = await sendFriendRequestToGroupMembers(api, groupInfo, idBot, message);
  } catch (error) {
    // await api.sendMessage(
    //   {
    //     msg: error.message,
    //     quote: message,
    //   },
    //   threadId,
    //   message.type
    // );
  }
}

export async function testFutureUser(api, message) {
  const threadId = message.threadId;
  try {
    await handleEncryptedMessage(api, message, threadId);
    return true;
  } catch (error) {
    // await api.sendMessage(
    //   {
    //     msg: error.message,
    //     quote: message,
    //   },
    //   threadId,
    //   message.type
    // );
    return false;
  }
}

export async function canvasTest(api, message, senderId, senderName, nameGroup, groupInfo) {
  const threadId = message.threadId;
  const userInfo = await getUserInfoData(api, senderId);
  const userActionName = senderName;
  let imagePath;
  imagePath = await cv.createWelcomeImage(userInfo, nameGroup, groupInfo.type, userActionName, false);
  await api.sendMessage(
    {
      msg: ``,
      attachments: [imagePath],
    },
    threadId,
    message.type
  );
  await deleteFile(imagePath);
  imagePath = await cv.createKickImage(userInfo, nameGroup, groupInfo.type, userInfo.genderId, userActionName, false);
  await api.sendMessage(
    {
      msg: ``,
      attachments: [imagePath],
    },
    threadId,
    message.type
  );
  await deleteFile(imagePath);
  imagePath = await cv.createGoodbyeImage(userInfo, nameGroup, groupInfo.type, false);
  await api.sendMessage(
    {
      msg: ``,
      attachments: [imagePath],
    },
    threadId,
    message.type
  );
  await deleteFile(imagePath);
  // imagePath = await cv.createBlockImage(userInfo, nameGroup, groupInfo.type, userInfo.genderId, userActionName, false);
  // await api.sendMessage(
  //   {
  //     msg: ``,
  //     attachments: [imagePath],
  //   },
  //   threadId,
  //   message.type
  // );
  // await deleteFile(imagePath);
  // imagePath = await cv.createBlockSpamImage(userInfo, nameGroup, groupInfo.type, userInfo.genderId);
  // await api.sendMessage(
  //   {
  //     msg: ``,
  //     attachments: [imagePath],
  //   },
  //   threadId,
  //   message.type
  // );
  // await deleteFile(imagePath);
  // imagePath = await cv.createBlockSpamLinkImage(userInfo, nameGroup, groupInfo.type, userInfo.genderId);
  // await api.sendMessage(
  //   {
  //     msg: ``,
  //     attachments: [imagePath],
  //   },
  //   threadId,
  //   message.type
  // );
  // await deleteFile(imagePath);
}

async function handleEncryptedMessage(api, message, threadId) {
  const isPlainText = typeof message.data.content === "string";
  if (!isPlainText) return;
  const contentOriginal = message.data.content;
  const decryptParams = decodeAES(appContext.secretKey, contentOriginal);
  const params = JSON.parse(decryptParams);
  const content = JSON.stringify(params);

  if (content && content !== "null") {
    await api.sendMessage(
      {
        msg: content,
        quote: message,
      },
      threadId,
      message.type
    );
  }
}

async function sendFriendRequestToGroupMembers(api, groupInfo, idBot, message) {
  let count = 0;
  const threadId = message.threadId;

  // Tạo mảng chứa toàn bộ id từ groupInfo.memVerList và loại bỏ '_0' ở cuối
  const memberIds = groupInfo.memVerList.map((member) => member.replace(/_0$/, ""));

  // Lặp qua từng id và gửi yêu cầu kết bạn
  for (const id of memberIds) {
    if (id == idBot) continue;
    try {
      await api.sendFriendRequest(id, "Xin Chào, Mình quen biết bạn qua nhóm chung, xin phép được kết bạn nhé");
      console.log(`Đã gửi yêu cầu kết bạn đến ${id}`);
      count++;
    } catch (error) {
      console.error(`Lỗi khi gửi yêu cầu kết bạn đến ${id}:`, error.message);
    }
  }

  // Gửi thông báo kết quả
  await api.sendMessage(
    {
      msg: `Đã gửi yêu cầu kết bạn đến ${count}/${memberIds.length - 1} thành viên trong nhóm ${groupInfo.name}`,
      quote: message,
    },
    threadId,
    message.type
  );

  return count;
}
