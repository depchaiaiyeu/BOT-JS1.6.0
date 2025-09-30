import schedule from "node-schedule";
import chalk from "chalk";
import { MessageMention } from "zlbotdqt";
import { extendMuteDuration } from "./mute-user.js";
import { isInWhiteList } from "./white-list.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiState, updateAntiConfig } from "./index.js";

function isBot(message) {
  if (message.data.ttl && message.data.ttl !== 0) {
    return true;
  }
  if (message.data.mentions && message.data.mentions.length > 0) {
    const firstMention = message.data.mentions[0];
    if (firstMention.uid === message.data.uidFrom) {
      return true;
    }
  }
  return false;
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

async function saveViolation(threadId, userId, userName) {
  const antiState = getAntiState();
  const violations = antiState.data.botViolations || {};

  if (!violations[threadId]) {
    violations[threadId] = {};
  }

  if (!violations[threadId][userId]) {
    violations[threadId][userId] = {
      count: 0,
      times: [],
      name: userName,
    };
  }

  violations[threadId][userId].count++;
  violations[threadId][userId].times.push({
    time: Date.now(),
  });

  if (violations[threadId][userId].times.length > 3) {
    violations[threadId][userId].times = violations[threadId][userId].times.slice(-3);
  }

  await updateAntiConfig({
    ...antiState.data,
    botViolations: violations,
  });

  return violations[threadId][userId];
}

function isMuted(groupSettings, threadId, userId) {
  const thread = groupSettings[threadId];
  if (!thread || !thread.muteUsers || !thread.muteUsers[userId]) return false;
  const muteInfo = thread.muteUsers[userId];
  if (!muteInfo || !muteInfo.endTime) return false;
  return Date.now() < muteInfo.endTime;
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
    if (!botIsAdminBox || isAdminBox || isInWhiteList(groupSettings, threadId, senderId)) {
      return false;
    }

    if (isMuted(groupSettings, threadId, senderId)) {
      return false;
    }

    if (isBot(message)) {
      try {
        await api.deleteMessage(message, false).catch(console.error);
        const senderName = message.data.dName;

        const violation = await saveViolation(threadId, senderId, senderName);

        let warningMsg = `${senderName} > Tin nhắn bị xóa vì phát hiện bot\n`;
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
  }
  return false;
}

export async function showViolationHistory(api, message, threadId) {
  try {
    const mentions = message.data.mentions;

    if (!mentions || mentions.length === 0) {
      await api.sendMessage(
        {
          msg: "Vui lòng tag (@mention) người dùng để xem lịch sử vi phạm bot.",
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

    let responseMsg = "📝 Lịch sử vi phạm bot:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName = "@" + message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const userViolations = violations[threadId]?.[userId];

      if (userViolations && userViolations.times.length > 0) {
        messageMentions.push(
          MessageMention(userId, userName.length, mentionPosition)
        );

        const countViolations = userViolations.count;
        let recentViolations = "Những vi phạm gần nhất:\n";
        recentViolations += userViolations.times
          .slice(-3)
          .map(
            (v, i) =>
              `  ${i + 1}. ${new Date(v.time).toLocaleString()}`
          )
          .join("\n");

        responseMsg += `${userName}:\n`;
        responseMsg += `Số lần vi phạm: ${countViolations}\n`;
        responseMsg += `${recentViolations}\n`;

        mentionPosition = responseMsg.length;
      } else {
        messageMentions.push(
          MessageMention(userId, userName.length, mentionPosition)
        );
        responseMsg += `${userName} chưa có vi phạm nào.\n\n`;
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
    console.error("Lỗi khi đọc lịch sử vi phạm bot:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc lịch sử vi phạm bot.",
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  }
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
          const recentViolations = userViolations.times.filter((violation) => {
            return currentTime - violation.time < VIOLATION_TIMEOUT;
          });
          if (recentViolations.length < userViolations.times.length) {
            hasChanges = true;
            userViolations.times = recentViolations;
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

  console.log(
    chalk.yellow("Đã khởi động schedule kiểm tra vi phạm bot")
  );
}
