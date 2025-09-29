import schedule from "node-schedule";
import chalk from "chalk";
import { MessageMention } from "zlbotdqt";
import { extendMuteDuration } from "./mute-user.js";
import { isInWhiteList } from "./white-list.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiState, updateAntiConfig } from "./index.js";

async function detectBot(data) {
  try {
    const ownerId = data.uidFrom;
    const ttl = data.ttl || 0;
    let attach = data.attach;
    
    if (typeof attach === 'string') {
      attach = JSON.parse(attach);
      if (attach.params) {
        attach.params = JSON.parse(attach.params.replace(/\\\\/g, '\\').replace(/\\\//g, '/'));
      }
    }
    
    if (ttl !== 0) {
      return {
        isBot: true,
        reason: `TTL=${ttl}ms`,
      };
    }

    if (attach && attach.mentions && Array.isArray(attach.mentions)) {
      for (const mention of attach.mentions) {
        if (mention.uid === ownerId) {
          return {
            isBot: true,
            reason: "Self-mention detected",
          };
        }
      }
    }

    return {
      isBot: false,
      reason: null,
    };
  } catch (error) {
    console.error("Error detecting bot:", error);
    return {
      isBot: false,
      reason: null,
    };
  }
}

async function showViolationHistory(api, message, threadId) {
  try {
    const mentions = message.data.mentions;

    if (!mentions || mentions.length === 0) {
      await api.sendMessage(
        {
          msg: "Vui lòng tag (@mention) người dùng để xem lịch sử vi phạm.",
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
      return;
    }

    const antiState = getAntiState();
    const violations = antiState.data.botViolations || {};

    let responseMsg = "📝 Lịch sử phát hiện bot:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName =
        "@" + message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const userViolations = violations[threadId]?.[userId];

      if (userViolations && userViolations.detections.length > 0) {
        messageMentions.push(
          MessageMention(userId, userName.length, mentionPosition)
        );

        const countViolations = userViolations.count;
        let recentViolations = "Những lần phát hiện gần nhất:\n";
        recentViolations += userViolations.detections
          .slice(-3)
          .map(
            (v, i) =>
              `  ${i + 1}. ${v.reason} - ${new Date(v.time).toLocaleString()}`
          )
          .join("\n");

        responseMsg += `${userName}:\n`;
        responseMsg += `Số lần phát hiện: ${countViolations}\n`;
        responseMsg += `${recentViolations}\n`;

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
    await showViolationHistory(api, message, threadId);
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

async function saveBotDetection(threadId, userId, userName, reason) {
  const antiState = getAntiState();
  const violations = antiState.data.botViolations || {};

  if (!violations[threadId]) {
    violations[threadId] = {};
  }

  if (!violations[threadId][userId]) {
    violations[threadId][userId] = {
      count: 0,
      detections: [],
      name: userName,
    };
  }

  violations[threadId][userId].count++;
  violations[threadId][userId].detections.push({
    reason: reason,
    time: Date.now(),
  });

  if (violations[threadId][userId].detections.length > 3) {
    violations[threadId][userId].detections = violations[threadId][userId].detections.slice(-3);
  }

  await updateAntiConfig({
    ...antiState.data,
    botViolations: violations,
  });

  return violations[threadId][userId];
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

  if (groupSettings[threadId]?.filterBot) {
    if (
      !botIsAdminBox ||
      isAdminBox ||
      isInWhiteList(groupSettings, threadId, senderId)
    )
      return false;

    const detectionResult = await detectBot(message.data);

    if (detectionResult.isBot) {
      try {
        await api.deleteMessage(message, false).catch(console.error);
        const senderName = message.data.dName;

        const violation = await saveBotDetection(
          threadId,
          senderId,
          senderName,
          detectionResult.reason
        );

        let warningMsg = `${senderName} > Tin nhắn bị xóa vì phát hiện hành vi bot: ${detectionResult.reason}\n`;
        warningMsg += `Cảnh cáo lần ${violation.count}/3`;

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
          const violations = { ...antiState.data.botViolations };

          if (violations[threadId]?.[senderId]) {
            violations[threadId][senderId].count = 0;

            await updateAntiConfig({
              ...antiState.data,
              botViolations: violations,
            });
          }

          warningMsg += "\n⚠️ Phát hiện sử dụng bot lần 3, bị cấm chat trong 15 phút!";
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
      const violations = { ...antiState.data.botViolations };
      for (const threadId in violations) {
        for (const userId in violations[threadId]) {
          const userViolations = violations[threadId][userId];
          const recentViolations = userViolations.detections.filter((violation) => {
            return currentTime - violation.time < VIOLATION_TIMEOUT;
          });
          if (recentViolations.length < userViolations.detections.length) {
            hasChanges = true;
            userViolations.detections = recentViolations;
            userViolations.count = recentViolations.length;
            if (recentViolations.length === 0) {
              delete violations[threadId][userId];
            }
          }
        }
        if (Object.keys(violations[threadId]).length === 0) {
          delete violations[threadId];
        }
      }
      if (hasChanges) {
        await updateAntiConfig({
          ...antiState.data,
          botViolations: violations,
        });
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra vi phạm bot:", error);
    }
  });

  console.log(chalk.yellow("Đã khởi động schedule kiểm tra phát hiện bot"));
}
