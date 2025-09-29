import schedule from "node-schedule";
import chalk from "chalk";
import { MessageMention } from "zlbotdqt";
import { extendMuteDuration } from "./mute-user.js";
import { isInWhiteList } from "./white-list.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiState, updateAntiConfig } from "./index.js";

function analyzeMessage(message) {
  const quote = message.data?.quote || message.reply;
  
  if (quote && quote.attach) {
    try {
      const attach = typeof quote.attach === 'string' 
        ? JSON.parse(quote.attach) 
        : quote.attach;
      
      if (attach.params && typeof attach.params === 'string') {
        attach.params = JSON.parse(attach.params.replace(/\\\\/g, '\\').replace(/\\\//g, '/'));
      }
      
      return {
        ownerId: quote.ownerId,
        ttl: quote.ttl || 0,
        mentions: attach.mentions || [],
        attach: attach
      };
    } catch (error) {
      console.error("Lỗi khi phân tích tin nhắn:", error);
    }
  }
  
  return {
    ownerId: message.data.uidFrom,
    ttl: message.data.ttl || 0,
    mentions: message.data.mentions || [],
    attach: message.data.attach || null
  };
}

function detectBot(messageData) {
  const { ownerId, ttl, mentions } = messageData;
  const reasons = [];
  
  if (ttl && ttl !== 0) {
    reasons.push(`Tin nhắn có TTL=${ttl}ms (bot tự xóa)`);
  }
  
  if (mentions && mentions.length > 0) {
    const selfMention = mentions.find(m => m.uid === ownerId);
    if (selfMention) {
      reasons.push("Tự mention chính mình (hành vi bot)");
    }
  }
  
  return {
    isBot: reasons.length > 0,
    reasons: reasons
  };
}

async function saveBotDetection(threadId, userId, userName, reasons) {
  const antiState = getAntiState();
  const botDetections = antiState.data.botDetections || {};

  if (!botDetections[threadId]) {
    botDetections[threadId] = {};
  }

  if (!botDetections[threadId][userId]) {
    botDetections[threadId][userId] = {
      count: 0,
      detections: [],
      name: userName,
    };
  }

  botDetections[threadId][userId].count++;
  botDetections[threadId][userId].detections.push({
    reasons: reasons,
    time: Date.now(),
  });

  if (botDetections[threadId][userId].detections.length > 5) {
    botDetections[threadId][userId].detections = botDetections[threadId][userId].detections.slice(-5);
  }

  await updateAntiConfig({
    ...antiState.data,
    botDetections,
  });

  return botDetections[threadId][userId];
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
    await showBotDetectionHistory(api, message, threadId);
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
  const caption = `Chức năng phát hiện và chặn bot đã được ${newStatus}!\n\n📋 Các dấu hiệu phát hiện bot:\n• Tin nhắn có TTL (tự xóa)\n• Tự mention chính mình\n\n⚠️ Vi phạm 3 lần sẽ bị cấm chat 15 phút`;
  
  await sendMessageStateQuote(
    api,
    message,
    caption,
    groupSettings[threadId].filterBot,
    300000
  );
  return true;
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

  try {
    const messageData = analyzeMessage(message);
    const detection = detectBot(messageData);

    if (detection.isBot) {
      try {
        await api.deleteMessage(message, false).catch(console.error);
        const senderName = message.data.dName;

        const botRecord = await saveBotDetection(
          threadId,
          senderId,
          senderName,
          detection.reasons
        );

        let warningMsg = `${senderName} > Tin nhắn bị xóa vì phát hiện hành vi bot:\n`;
        warningMsg += detection.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n');
        warningMsg += `\n\nCảnh cáo lần ${botRecord.count}/3`;

        if (botRecord.count >= 3) {
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
          const botDetections = { ...antiState.data.botDetections };

          if (botDetections[threadId]?.[senderId]) {
            botDetections[threadId][senderId].count = 0;

            await updateAntiConfig({
              ...antiState.data,
              botDetections,
            });
          }

          warningMsg += "\n⚠️ Vi phạm 3 lần, bạn bị cấm chat trong 15 phút!";
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
  } catch (error) {
    console.error("Lỗi khi phân tích tin nhắn để phát hiện bot:", error);
  }

  return false;
}

export async function showBotDetectionHistory(api, message, threadId) {
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
    const botDetections = antiState.data.botDetections || {};

    let responseMsg = "🤖 Lịch sử phát hiện bot:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName = "@" + message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const userDetections = botDetections[threadId]?.[userId];

      if (userDetections && userDetections.detections.length > 0) {
        messageMentions.push(
          MessageMention(userId, userName.length, mentionPosition)
        );

        const countDetections = userDetections.count;
        let recentDetections = "Các lần phát hiện gần nhất:\n";
        recentDetections += userDetections.detections
          .slice(-5)
          .map((d, i) => {
            const reasonsList = d.reasons.map(r => `    • ${r}`).join('\n');
            return `  ${i + 1}. ${new Date(d.time).toLocaleString()}\n${reasonsList}`;
          })
          .join("\n");

        responseMsg += `${userName}:\n`;
        responseMsg += `Số lần phát hiện: ${countDetections}\n`;
        responseMsg += `${recentDetections}\n\n`;

        mentionPosition = responseMsg.length;
      } else {
        messageMentions.push(
          MessageMention(userId, userName.length, mentionPosition)
        );
        responseMsg += `${userName} chưa có lần phát hiện nào.\n\n`;
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

export async function startBotDetectionCheck() {
  const jobName = "botDetectionCheck";
  const existingJob = schedule.scheduledJobs[jobName];
  if (existingJob) {
    existingJob.cancel();
  }

  schedule.scheduleJob(jobName, "*/5 * * * * *", async () => {
    try {
      const antiState = getAntiState();
      let hasChanges = false;
      const currentTime = Date.now();
      const DETECTION_TIMEOUT = 30 * 60 * 1000;
      const botDetections = { ...antiState.data.botDetections };

      for (const threadId in botDetections) {
        for (const userId in botDetections[threadId]) {
          const userDetections = botDetections[threadId][userId];
          const recentDetections = userDetections.detections.filter((detection) => {
            return currentTime - detection.time < DETECTION_TIMEOUT;
          });

          if (recentDetections.length < userDetections.detections.length) {
            hasChanges = true;
            userDetections.detections = recentDetections;
            userDetections.count = recentDetections.length;

            if (recentDetections.length === 0) {
              delete botDetections[threadId][userId];
            }
          }
        }

        if (Object.keys(botDetections[threadId]).length === 0) {
          delete botDetections[threadId];
        }
      }

      if (hasChanges) {
        await updateAntiConfig({
          ...antiState.data,
          botDetections,
        });
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra lịch sử phát hiện bot:", error);
    }
  });

  console.log(chalk.yellow("Đã khởi động schedule kiểm tra phát hiện bot"));
}
