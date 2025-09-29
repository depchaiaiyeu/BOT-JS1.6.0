import schedule from "node-schedule";
import { MessageMention, MessageType } from "zlbotdqt";

import { getIO } from "../web-service/web-server.js";

import { getBotId, isAdmin, admins, checkDisableProphylacticConfig } from "../index.js";

import { antiLink } from "../service-hahuyhoang/anti-service/anti-link.js";
import { antiSpam } from "../service-hahuyhoang/anti-service/anti-spam.js";
import { antiBadWord } from "../service-hahuyhoang/anti-service/anti-badword.js";
import { antiNotText } from "../service-hahuyhoang/anti-service/anti-not-text.js";
import { handleMute } from "../service-hahuyhoang/anti-service/mute-user.js";
import { antiMedia } from "../service-hahuyhoang/anti-service/anti-media.js";
import { antiSticker } from "../service-hahuyhoang/anti-service/anti-sticker.js";
import { antiLinkKeyword } from "../service-hahuyhoang/anti-service/anti-keyword-link.js"

import { Reactions } from "../api-zalo/index.js";
import { handleOnChatUser, handleOnReplyFromUser } from "../service-hahuyhoang/service.js";

import { chatWithSimsimi } from "../service-hahuyhoang/chat-bot/simsimi/simsimi-api.js";
import { handleChatBot } from "../service-hahuyhoang/chat-bot/bot-learning/dqt-bot.js";

import { getGroupAdmins, getGroupInfoData } from "../service-hahuyhoang/info-service/group-info.js";
import { getUserInfoData } from "../service-hahuyhoang/info-service/user-info.js";

import { handleAdminHighLevelCommands } from "../commands/bot-manager/admin-manager.js";

import { updateUserRank } from "../service-hahuyhoang/info-service/rank-chat.js";

import { pushMessageToWebLog } from "../utils/io-json.js";
import { handleCommand, initGroupSettings, handleCommandPrivate } from "../commands/command.js";
import { logMessageToFile, readGroupSettings } from "../utils/io-json.js";

import { canvasTest, superCheckBox, testFutureGroup, testFutureUser } from "./ndq-test.js";
import { antiNude } from "../service-hahuyhoang/anti-service/anti-nude/anti-nude.js";
import { isUserBlocked } from "../commands/bot-manager/group-manage.js";

const userLastMessageTime = new Map();
const COOLDOWN_TIME = 1000;

const lastBusinessCardTime = new Map();
const BUSINESS_CARD_COOLDOWN = 60 * 60 * 1000;

async function canReplyToUser(senderId) {
  const currentTime = Date.now();
  const lastMessageTime = userLastMessageTime.get(senderId);

  if (!lastMessageTime || currentTime - lastMessageTime >= COOLDOWN_TIME) {
    userLastMessageTime.set(senderId, currentTime);
    return true;
  }
  return false;
}

export async function checkAndSendBusinessCard(api, senderId, senderName) {
  if (isAdmin(senderId)) return false;
  const currentTime = Date.now();
  const lastSentTime = lastBusinessCardTime.get(senderId);

  if (!lastSentTime || currentTime - lastSentTime >= BUSINESS_CARD_COOLDOWN) {
    lastBusinessCardTime.set(senderId, currentTime);
    const idBot = getBotId();
    if (admins.length == 0 || (admins.length == 1 && admins.includes(idBot.toString()))) return false;
    await api.sendMessage(
      {
        msg:
          `Xin Chào ${senderName}, tôi là Vũ Xuân Kiên.\n` +
          `Hiện Tại Tôi Đang Bận Bạn Có Thể Nhắn Lại Sau Nhé.\n`+
          `Link Group Của Mình: https://zalo.me/g/htfvzr952\n`,
      },
      senderId,
      MessageType.DirectMessage
    );
    for (const userId of admins) {
      if (userId != idBot) {
        await api.sendBusinessCard(null, userId, null, MessageType.DirectMessage, senderId);
      }
    }
    return true;
  }
  return false;
}

schedule.scheduleJob("*/1 * * * *", () => {
  const currentTime = Date.now();
  for (const [userId, lastTime] of userLastMessageTime.entries()) {
    if (currentTime - lastTime > 60000) {
      userLastMessageTime.delete(userId);
    }
  }
  for (const [userId, lastTime] of lastBusinessCardTime.entries()) {
    if (currentTime - lastTime > BUSINESS_CARD_COOLDOWN) {
      lastBusinessCardTime.delete(userId);
    }
  }
  checkDisableProphylacticConfig();
});

export async function messagesUser(api, message) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  let content = message.data.content;
  const isPlainText = typeof message.data.content === "string";
  const senderName = message.data.dName;
  let isAdminLevelHighest = false;
  let isAdminBot = false;
  isAdminLevelHighest = isAdmin(senderId);
  isAdminBot = isAdmin(senderId, threadId);
  const idBot = getBotId();
  const io = getIO();
  let isSelf = idBot === senderId;

  switch (message.type) {
    case MessageType.DirectMessage: {
      const userInfo = await getUserInfoData(api, senderId);
      pushMessageToWebLog(io, "Tin Nhắn Riêng Tư", senderName, content, userInfo.avatar);
      if (isPlainText) {
        content = content.trim();
        const logMessage = `Có Mesage Riêng tư mới:
      - Sender Name: [ ${senderName} ] | ID: ${threadId}
      - Content: ${content}\n${message.data}\n\n`;
        logMessageToFile(logMessage);
        let continueProcessingChat = true;
        continueProcessingChat = !isUserBlocked(senderId);
        // continueProcessingChat = continueProcessingChat && (isAdminLevelHighest && !isSelf) && !(await testFutureUser(api, message));
        continueProcessingChat = continueProcessingChat && (await canReplyToUser(senderId));
        continueProcessingChat = continueProcessingChat && !(await handleOnReplyFromUser(api, message));
        if (continueProcessingChat) {
          const commandResult = await handleCommandPrivate(api, message);
          continueProcessingChat = continueProcessingChat && commandResult === 1 && !isSelf;
          continueProcessingChat =
            continueProcessingChat && !(!isSelf && (await checkAndSendBusinessCard(api, senderId, senderName)));
       //   continueProcessingChat = continueProcessingChat && (await chatWithSimsimi(api, message));
        }
      }
      break; 
    } 
    case MessageType.GroupMessage: {
      let groupAdmins = [];
      let nameGroup = "";
      let isAdminBox = false;
      let botIsAdminBox = false;
      let groupInfo = {};
      if (threadId) {
        groupInfo = await getGroupInfoData(api, threadId);
        groupAdmins = await getGroupAdmins(groupInfo);
        botIsAdminBox = groupAdmins.includes(idBot.toString());
        nameGroup = groupInfo.name;
        isAdminBox = isAdmin(senderId, threadId, groupAdmins);
      }

      if (isPlainText) {
        content = content.trim();
        const logMessage = `Có Mesage nhóm mới:
              - Tên Nhóm: ${nameGroup} | Group ID: ${threadId}
              - Người Gửi: ${senderName} | Sender ID: ${senderId}
              - Nội Dung: ${content}\n${message.data}\n\n`;
        logMessageToFile(logMessage);
      }

      const groupSettings = readGroupSettings();
      initGroupSettings(groupSettings, threadId, nameGroup);
      pushMessageToWebLog(io, nameGroup, senderName, content, groupInfo.avt);

      if (!isSelf) {
        if (threadId == "6456980305260228374") { //Có nhóm test thì thay id vào đây để test các canvas
          // await canvasTest(api,message, senderId, senderName, nameGroup, groupInfo);
          await testFutureGroup(api, message, groupInfo);
        }
        updateUserRank(threadId, senderId, message.data.dName, nameGroup);
      }

      let handleChat = true;
      handleChat = handleChat && !(await superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox));
      handleChat = handleChat && !(await antiSpam(api, message, groupInfo, isAdminBox, groupSettings, botIsAdminBox, isSelf));
      handleChat = handleChat && !(await antiMedia(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf));
      handleChat = handleChat && !(await antiSticker(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf));
      handleChat = !(await handleMute(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf));
      handleChat = handleChat && !(await antiBadWord(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf));
      handleChat = handleChat && !isUserBlocked(senderId);
      const numberHandleCommand = await handleCommand(
        api,
        message,
        groupInfo,
        groupAdmins,
        groupSettings,
        isAdminLevelHighest,
        isAdminBot,
        isAdminBox,
        handleChat
      );
      if (isPlainText) {
        // numberHandleCommand = -1: Không Có Lệnh Nào Được Xử Lý
        // numberHandleCommand = 1: Đã Xử Lý Lệnh activeBot
        // numberHandleCommand = 2: Bỏ Qua Xử Lý Lệnh Chat Bot
        // numberHandleCommand = 3: Đã Xử Lý Lệnh Quản Trị
        // numberHandleCommand = 5: Đã Xử Lý Lệnh Game
        // numberHandleCommand = 99: Phát Hiện Dùng Lệnh, Check Lệnh Hiện Tại (Nếu Không Có Lệnh Nào Được Xử Lý -> Đưa Ra Gợi Ý)
        handleChat = handleChat && groupSettings[threadId].activeBot === true;
        handleChat = handleChat && !isSelf;
        if (handleChat || (!isSelf && isAdminBot)) {
          await handleOnChatUser(api, message, numberHandleCommand === 5, groupSettings);
        }
        if (handleChat || isAdminBot) {
          handleChat = await handleOnReplyFromUser(
            api,
            message,
            groupInfo,
            groupAdmins,
            groupSettings,
            isAdminLevelHighest,
            isAdminBot,
            isAdminBox,
            handleChat || isAdminBot
          );
        }
        if (!isSelf) {
          await handleChatBot(api, message, threadId, groupSettings, nameGroup, numberHandleCommand === 2);
        }
      }

      await Promise.all([
        antiLink(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
        antiLinkKeyword(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
        antiNotText(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
        antiNude(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf)
      ]);
      break;
    }
  }
}
