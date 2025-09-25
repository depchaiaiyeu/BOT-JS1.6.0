import { GroupEventType, MessageType } from "../api-zalo/models/index.js";
import { getUserInfoData } from "../service-hahuyhoang/info-service/user-info.js";
import * as cv from "../utils/canvas/index.js";
import { readGroupSettings } from "../utils/io-json.js";
import path from "path";
import { getBotId, isAdmin } from "../index.js";

const blockedMembers = new Map(); // Lưu trữ thông tin member bị block
const BLOCK_CHECK_TIMEOUT = 300; // 300ms timeout

async function sendGroupMessage(api, threadId, imagePath, messageText) {
  const message = messageText ? messageText : "";
  try {
    await api.sendMessage(
      {
        msg: message,
        attachments: imagePath ? [imagePath] : [],
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn tới group:", error);
  }
}

export async function groupEvents(api, event) {
  const type = event.type;
  const { updateMembers } = event.data;
  const groupName = event.data.groupName;
  const threadId = event.threadId;
  const groupType = event.data.groupType;
  const idAction = event.data.sourceId;

  const groupSettings = readGroupSettings();
  const threadSettings = groupSettings[threadId] || {};
  if ((type === GroupEventType.JOIN && !threadSettings.welcomeGroup) 
    || (type === GroupEventType.LEAVE && !threadSettings.byeGroup)) {
    return;
  }

  if (updateMembers) {
    if (updateMembers.length === 1) {
      const user = updateMembers[0];
      const userId = user.id;
      const userInfo = await getUserInfoData(api, userId);
      const userActionInfo = await getUserInfoData(api, idAction);
      const idBot = getBotId();
      const userActionName = userActionInfo.name;
      const isAdminBot = isAdmin(userId, threadId);

      let imagePath;
      let messageText = "";

      switch (type) {
        case GroupEventType.JOIN_REQUEST:
          console.log(event);
          break;
      
          case GroupEventType.JOIN:
            if (idBot === userId && getListGroupSpamWithoutJoin().includes(threadId)) {
            await api.leaveGroup (threadId);
            }
            if (threadSettings.welcomeGroup) {
            imagePath = await cv.createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdminBot);
          }
          break;

        case GroupEventType.LEAVE:
          if (idBot !== idAction && threadSettings.byeGroup) {
            imagePath = await cv.createGoodbyeImage(userInfo, groupName, groupType, isAdminBot);
          }
          break;

        case GroupEventType.REMOVE_MEMBER:
          if (idBot !== idAction && threadSettings.enableKickImage === true) {
            if (!blockedMembers.has(userId)) {
              await new Promise((resolve) => setTimeout(resolve, BLOCK_CHECK_TIMEOUT));
              if (!blockedMembers.has(userId)) {
                imagePath = await cv.createKickImage(userInfo, groupName, groupType, userInfo.genderId, userActionName, isAdminBot);
              }
            }
          }
          break;

        case GroupEventType.BLOCK_MEMBER:
          if (idBot !== idAction && threadSettings.enableBlockImage === true) {
            blockedMembers.set(userId, Date.now());
            imagePath = await cv.createBlockImage(userInfo, groupName, groupType, userInfo.genderId, userActionName, isAdminBot);
            setTimeout(() => {
              blockedMembers.delete(userId);
            }, 1000);
          }
          break;

        default:
          return;
      }

      if (imagePath) {
        await sendGroupMessage(api, threadId, imagePath, messageText);
        await cv.clearImagePath(imagePath);
      }
    } else if (type === GroupEventType.JOIN && updateMembers.length > 1 && threadSettings.welcomeGroup) {
      const userActionInfo = await getUserInfoData(api, idAction);
      const userActionName = userActionInfo.name;
      for (const user of updateMembers) {
        const userId = user.id;
        const userInfo = await getUserInfoData(api, userId);

        const imagePath = await cv.createWelcomeImage(userInfo, groupName, groupType, userActionName);
        await sendGroupMessage(api, threadId, imagePath, "");
        await cv.clearImagePath(imagePath);
      }
    }
  } else {
    switch (type) {
      case GroupEventType.JOIN_REQUEST:
        if (threadSettings.memberApprove) {
          await api.handleGroupPendingMembers(threadId, true);
        }
        break;
    }
  }
}
