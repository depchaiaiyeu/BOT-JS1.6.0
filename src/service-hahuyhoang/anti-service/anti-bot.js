import schedule from "node-schedule";
import chalk from "chalk";
import { MessageMention } from "zlbotdqt";
import { extendMuteDuration } from "./mute-user.js";
import { isInWhiteList } from "./white-list.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiState, updateAntiConfig } from "./index.js";

async function checkIsBot(message) {
  try {
    const messageData = message.data;
    const ttl = messageData.ttl || 0;
    const ownerId = messageData.uidFrom;
    const mentions = messageData.mentions || [];

    if (ttl > 0) {
      return {
        isBot: true,
        reason: `Tin nhắn có TTL: ${ttl}ms`
      };
    }

    for (const mention of mentions) {
      if (mention.uid === ownerId) {
        return {
          isBot: true,
          reason: "Tự mention chính mình"
        };
      }
    }

    return {
      isBot: false,
      reason: null
    };
  } catch (error) {
    console.error("Lỗi khi kiểm tra bot:", error);
    return {
      isBot: false,
      reason: null
    };
  }
}

async function showBotViolationHistory(api, message, threadId) {
  try {
    const mentions = message.data.mentions;

    if (!mentions || mentions.length === 0) {
      await api.sendMessage(
        {
          msg: "Vui lòng tag (@mention) người dùng để xem lịch sử phát hiện bot.",
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
      return;
    }

    const antiState = getAntiState();
    const botViolations = antiState.data.botViolations || {};

    let responseMsg = "📝 Lịch sử phát hiện bot:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName = "@" + message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const userViolations = botViolations[threadId]?.[userId];

      if (userViolations && userViolations.detections.length > 0) {
        messageMentions.push(
          MessageMention(userId, userName.length, mentionPosition)
        );

        const countViolations = userViolations.count;
        let recentDetections = "Những lần phát hiện gần nhất:\n";
        recentDetections += userViolations.detections
          .slice(-3)
          .map(
            (v, i) =>
              `  ${i + 1}. ${v.reason} - ${new Date(v.time).toLocaleString()}`
          )
          .join("\n");

        responseMsg += `${userName}:\n`;
        responseMsg += `Số lần phát hiện: ${countViolations}\n`;
        responseMsg += `${recentDetections}\n`;

        mentionPosition = responseMsg.length;
      } else {
        messageMentions.push(
          MessageMention(userId, userName.length, mentionPosition)
        );
        responseMsg += `${userName} chưa bị phát hiện là bot.\n\n`;
        mentionPosition = responseMsg.length;
      }
    }

    await api.sendMessage(
      {
        msg: responseMsg.trim(),
        quote: message,
        mentions: messageMentions,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi đọc lịch sử phát hiện bot:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc lịch sử phát hiện bot.",
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  }
}

export async function handleAntiBotCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  if (command === "show") {
    await showBotViolationHistory(api, message, threadId);
    return true;
  }

  if (command === "on") {
    groupSettings[threadId].filterBot = true;
  } else if (command === "off") {
    groupSettings[threadId].filterBot = false;
  } else {
    groupSettings[threadId].filterBot = !groupSettings[threadId].filterBot;
  }

  const newStatus = groupSettings[threadId].filterBot ? "bật" : "tắt";
  const caption = `Chức năng chặn bot đã được ${newStatus}!`;
  await sendMessageStateQuote(
    api,
    message,
    caption,
    groupSettings[threadId].filterBot,
    300000
  );
  return true;
}

async function saveBotViolation(threadId, userId, userName, reason) {
  const antiState = getAntiState();
  const botViolations = antiState.data.botViolations || {};

  if (!botViolations[threadId]) {
    botViolations[threadId] = {};
  }

  if (!botViolations[threadId][userId]) {
    botViolations[threadId][userId] = {
      count: 0,
      detections: [],
      name: userName,
    };
  }

  botViolations[threadId][userId].count++;
  botViolations[threadId][userId].detections.push({
    reason: reason,
    time: Date.now(),
  });

  if (botViolations[threadId][userId].detections.length > 3) {
    botViolations[threadId][userId].detections = 
      botViolations[threadId][userId].detections.slice(-3);
  }

  await updateAntiConfig({
    ...antiState.data,
    botViolations,
  });

  return botViolations[threadId][userId];
}

export async function antiBot(
  api,
  message,
  groupSettings,
  isAdminBox,
  botIsAdminBox,
  isSelf
) {
  if (isSelf) return false;
  
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;

  if (!groupSettings[threadId]?.filterBot) return false;
  
  if (!botIsAdminBox || isAdminBox || isInWhiteList(groupSettings, threadId, senderId)) {
    return false;
  }

  const botCheck = await checkIsBot(message);

  if (botCheck.isBot) {
    try {
      await api.deleteMessage(message, false).catch(console.error);
      const senderName = message.data.dName;

      const violation = await saveBotViolation(
        threadId,
        senderId,
        senderName,
        botCheck.reason
      );

      let warningMsg = `${senderName} > Tin nhắn bị xóa vì nghi ngờ là BOT\n`;
      warningMsg += `Lý do: ${botCheck.reason}\n`;
      warningMsg += `Cảnh cáo lần: ${violation.count}/3`;

      if (violation.count >= 3) {
        if (!groupSettings[threadId]) {
          groupSettings[threadId] = {};
        }
        
        await extendMuteDuration(
          threadId,
          senderId,
          senderName,
          groupSettings,
          900
        );

        const antiState = getAntiState();
        const botViolations = { ...antiState.data.botViolations };

        if (botViolations[threadId]?.[senderId]) {
          botViolations[threadId][senderId].count = 0;

          await updateAntiConfig({
            ...antiState.data,
            botViolations,
          });
        }

        warningMsg += "\n⚠️ Phát hiện bot lần 3, bị cấm chat trong 15 phút!";
      }

      await api.sendMessage(
        {
          msg: warningMsg,
          quote: message,
          mentions: [MessageMention(senderId, senderName.length, 0)],
          ttl: 30000,
        },
        threadId,
        message.type
      );
      return true;
    } catch (error) {
      console.error("Có lỗi xảy ra khi anti bot:", error.message);
    }
  }
  return false;
}

export async function startBotViolationCheck() {
  const jobName = "botViolationCheck";
  const existingJob = schedule.scheduledJobs[jobName];
  if (existingJob) {
    existingJob.cancel();
  }
  
  schedule.scheduleJob(jobName, "*/5 * * * * *", async () => {
    try {
      const antiState = getAntiState();
      let hasChanges = false;
      const currentTime = Date.now();
      const VIOLATION_TIMEOUT = 30 * 60 * 1000;
      const botViolations = { ...antiState.data.botViolations };
      
      for (const threadId in botViolations) {
        for (const userId in botViolations[threadId]) {
          const userViolations = botViolations[threadId][userId];
          const recentDetections = userViolations.detections.filter((detection) => {
            return currentTime - detection.time < VIOLATION_TIMEOUT;
          });
          
          if (recentDetections.length < userViolations.detections.length) {
            hasChanges = true;
            userViolations.detections = recentDetections;
            userViolations.count = recentDetections.length;
            
            if (recentDetections.length === 0) {
              delete botViolations[threadId][userId];
            }
          }
        }
        
        if (Object.keys(botViolations[threadId]).length === 0) {
          delete botViolations[threadId];
        }
      }
      
      if (hasChanges) {
        await updateAntiConfig({
          ...antiState.data,
          botViolations,
        });
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra vi phạm bot:", error);
    }
  });

  console.log(
    chalk.yellow("Đã khởi động schedule kiểm tra vi phạm bot")
  );
}
