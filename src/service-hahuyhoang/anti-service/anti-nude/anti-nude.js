import path from "path";

import canvas from "canvas";
import chalk from "chalk";
import * as nsfwjs from "nsfwjs";
import schedule from "node-schedule";
import { MessageMention, MessageType } from "zlbotdqt";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";

import { sendMessageStateQuote } from "../../chat-zalo/chat-style/chat-style.js";
import { createBlockSpamImage } from "../../../utils/canvas/event-image.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { getGroupInfoData } from "../../info-service/group-info.js";
import { getUserInfoData } from "../../info-service/user-info.js";
import { deleteFile, downloadFile, execAsync, loadImageBuffer } from "../../../utils/util.js";
import { tempDir } from "../../../utils/io-json.js";
import { isInWhiteList } from "../white-list.js";
import { removeMention } from "../../../utils/format-util.js";
import { getVideoMetadata } from "../../../api-zalo/utils.js";
import { getAntiState, updateAntiConfig } from "../index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Canvas } = canvas;

const blockedUsers = new Set();

export const PERCENT_NSFW = 40;

let model = null;

const initModel = async () => {
  if (model) return;
  model = await nsfwjs.load();
};

async function loadViolations() {
  const antiState = getAntiState();
  return antiState.data.violationsNude || {};
}

async function saveViolation(senderId, count, senderName, threadId) {
  const antiState = getAntiState();
  const violations = antiState.data.violationsNude || {};

  violations[senderId] = {
    count,
    lastViolation: Date.now(),
    senderName,
    threadId
  };

  updateAntiConfig({
    ...antiState.data,
    violationsNude: violations
  });
}

class ImageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        resolve,
        reject
      });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const { task, resolve, reject } = this.queue.shift();

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.processQueue();
    }
  }
}

const imageQueue = new ImageQueue();

function checkNudeImage(imagePath) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, "nsfw-worker.js");
    const worker = new Worker(workerPath, {
      workerData: imagePath,
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve(0);
    }, 10000);

    worker.on("message", (score) => {
      clearTimeout(timeout);
      resolve(score);
    });

    worker.on("error", (err) => {
      console.error("Worker error:", err);
      clearTimeout(timeout);
      resolve(0);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.warn(`Worker exited with code ${code}`);
      }
    });
  });
}

export async function downloadAndAnalyzeNudeImage(linkImage, messageType, thumbnail = null) {
  const isVideo = messageType === "chat.video.msg";
  const isGif = messageType === "chat.gif";
  const fileExt = isVideo ? ".mp4" : isGif ? ".gif" : path.extname(linkImage) || ".jpg";

  const basenamePath = path.basename(linkImage)
  const baseNameFile = basenamePath.split(".")[0] || basenamePath;
  const tempFrameFiles = [
    path.join(tempDir, `frame_start_${Date.now()}_${baseNameFile}.jpg`),
    path.join(tempDir, `frame_middle_${Date.now()}_${baseNameFile}.jpg`),
    path.join(tempDir, `frame_end_${Date.now()}_${baseNameFile}.jpg`)
  ];
  const tempFile = path.join(tempDir, `nude_check_${Date.now()}${fileExt}`);

  try {
    if (thumbnail) {
      await downloadFile(thumbnail, tempFile);
      const nsfw_prob = await checkNudeImage(tempFile);
      if (nsfw_prob > PERCENT_NSFW) {
        return Number(nsfw_prob.toFixed(0));
      }
    }
    if (isVideo || isGif) {
      const { duration } = await getVideoMetadata(linkImage);

      const middleTime = Math.floor(duration / 1000 / 2);
      const endTime = Math.floor(duration / 1000 * 0.9);
      const timeSplits = [0, middleTime, endTime];

      let maxNsfwScore = 0;
      for (let i = 0; i < 3; i++) {
        try {
          await execAsync(`ffmpeg -ss ${timeSplits[i]} -i "${linkImage}" -vframes 1 "${tempFrameFiles[i]}"`);
          const nsfw_prob = await checkNudeImage(tempFrameFiles[i]);
          if (nsfw_prob > PERCENT_NSFW) {
            maxNsfwScore = nsfw_prob;
            break;
          }
        } catch (error) {
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return Number(maxNsfwScore.toFixed(0));
    } else {
      await downloadFile(linkImage, tempFile);
      const nsfw_prob = await checkNudeImage(tempFile);
      return Number(nsfw_prob.toFixed(0));
    }
  } catch (error) {
    console.error("Lỗi khi phân tích ảnh:", error);
    return 0;
 // } finally {
  //  await Promise.all(tempFrameFiles.map(file => deleteFile(file)));
  //  await deleteFile(tempFile);
  //}
//}
 } finally {
  try {
      await Promise.all(tempFrameFiles.map(file => deleteFile(file)));
      await deleteFile(tempFile);
  } catch (cleanupError) {
      console.error("Lỗi khi xóa file tạm:", cleanupError);
  }}};


export async function antiNude(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  if (
    (message.data.msgType != "chat.photo" &&
      message.data.msgType != "chat.gif" &&
      message.data.msgType != "chat.video.msg") ||
    isAdminBox ||
    isSelf ||
    !botIsAdminBox
  )
    return false;

  if (!model) await initModel();

  const isWhiteList = isInWhiteList(groupSettings, threadId, senderId);
  let percentNsfw = PERCENT_NSFW;
  if (isWhiteList) percentNsfw = 60;

  if (groupSettings[threadId]?.antiNude) {
    const linkImage = message.data.content.href;
    const thumbnail = message.data.content.thumb;
    if (linkImage) {
      try {
        const nsfw_prob = await downloadAndAnalyzeNudeImage(linkImage, message.data.msgType, thumbnail);

        if (nsfw_prob > percentNsfw) {
          const violations = await loadViolations();
          const userViolation = violations[senderId] || {
            count: 0,
            lastViolation: 0,
          };

          if (Date.now() - userViolation.lastViolation > 3600000) {
            userViolation.count = 0;
          }

          userViolation.count++;
          await saveViolation(senderId, userViolation.count, senderName, threadId);

          if (isWhiteList) {
            await api.deleteMessage(message, false);
            await api.sendMessage(
              {
                msg:
                  `⚠️ ${senderName}!\nUầy bạn ơi, cái này múp quá, tôi phải giấu thôi... (Độ nhạy cảm: ${Math.max(nsfw_prob, 50)}%).`,
                mentions: [MessageMention(senderId, senderName.length, "⚠️ ".length)],
                quote: message,
                ttl: 30000,
              },
              threadId,
              MessageType.GroupMessage
            );
          } else if (userViolation.count >= 5) {
            await handleNudeContent(api, message, threadId, senderId, senderName);
            await saveViolation(senderId, 0, senderName, threadId);
          } else {
            await api.deleteMessage(message, false);
            await api.sendMessage(
              {
                msg:
                  `⚠️ Cảnh cáo ${senderName}!\n` +
                  `Sếp tao cấm gửi nội dung nhạy cảm!!! (Độ nhạy cảm: ${Math.max(nsfw_prob, 50)}%).` +
                  `\nVi phạm nhiều lần, tao đá khỏi box!`,
                mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
                quote: message,
                ttl: 30000,
              },
              threadId,
              MessageType.GroupMessage
            );
          }
          return true;
        }
      } catch (error) {
        console.error("Lỗi khi kiểm tra nội dung ảnh:", error);
      }
    }
  }
  return false;
}

async function handleNudeContent(api, message, threadId, senderId, senderName, groupSettings) {
  try {
    await api.deleteMessage(message, false);
    await api.blockUsers(threadId, [senderId]);
    blockedUsers.add(senderId);

    const groupInfo = await getGroupInfoData(api, threadId);
    const userInfo = await getUserInfoData(api, senderId);

    let imagePath = null;
    if (groupSettings?.[threadId]?.enableBlockImage === true) {
      imagePath = await createBlockSpamImage(
        userInfo,
        groupInfo.name,
        groupInfo.groupType,
        userInfo.gender
      );
    }

    // Chỉ gửi nếu có ảnh
    if (imagePath) {
      await api.sendMessage(
        {
          msg: `Thành viên [ ${senderName} ] đã bị chặn do gửi nội dung nhạy cảm! 🚫`,
          attachments: [imagePath],
        },
        threadId,
        MessageType.GroupMessage
      );
      try {
        await api.sendMessage(
          {
            msg: `Bạn đã bị chặn do gửi nội dung nhạy cảm! 🚫\nVui lòng không lặp lại hành vi này ở nơi khác.`,
            attachments: [imagePath],
          },
          senderId,
          MessageType.DirectMessage
        );
      } catch (error) {
        console.error(`Không thể gửi tin nhắn tới ${senderId}:`, error.message);
      }
      await clearImagePath(imagePath);
    }
    setTimeout(() => {
      blockedUsers.delete(senderId);
    }, 300000);
  } catch (error) {
    console.error(`Lỗi khi xử lý nội dung nhạy cảm:`, error);
  }
}

async function showNudeViolationHistory(api, message) {
  try {
    const threadId = message.threadId;
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
    const violations = antiState.data.violationsNude || {};

    let responseMsg = "📝 Lịch sử vi phạm gửi ảnh nhạy cảm:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName = message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const violation = violations[userId];

      messageMentions.push(MessageMention(userId, userName.length, mentionPosition));

      if (!violation) {
        responseMsg += `${userName} chưa có vi phạm nào.\n\n`;
      } else {
        responseMsg += `${userName}:\n`;
        responseMsg += `Lần vi phạm gần nhất: ${new Date(violation.lastViolation).toLocaleString()}\n\n`;
      }

      mentionPosition = responseMsg.length;
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
    console.error("Lỗi khi đọc lịch sử vi phạm:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc lịch sử vi phạm.",
        quote: message,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  }
}

export async function handleAntiNudeCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  if (command === "list") {
    await showNudeViolationHistory(api, message);
    return true;
  }

  let newStatus;
  if (command === "on") {
    groupSettings[threadId].antiNude = true;
    newStatus = "bật";
  } else if (command === "off") {
    groupSettings[threadId].antiNude = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].antiNude = !groupSettings[threadId].antiNude;
    newStatus = groupSettings[threadId].antiNude ? "bật" : "tắt";
  }

  const caption = `Chức năng chống nội dung nhạy cảm đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiNude, 300000);

  return true;
}

export async function startNudeViolationCheck() {
  await initModel();
  const jobName = "nudeViolationCheck";
  const existingJob = schedule.scheduledJobs[jobName];
  if (existingJob) {
    existingJob.cancel();
  }

  schedule.scheduleJob(jobName, "*/5 * * * * *", async () => {
    try {
      const antiState = getAntiState();
      let hasChanges = false;
      const currentTime = Date.now();
      const VIOLATION_TIMEOUT = 1000 * 60 * 60 * 24;

      if (antiState.data.violationsNude) {
        const violations = { ...antiState.data.violationsNude };

        for (const userId in violations) {
          const violation = violations[userId];

          if (currentTime - violation.lastViolation > VIOLATION_TIMEOUT) {
            hasChanges = true;
            delete violations[userId];
          }
        }

        if (hasChanges) {
          updateAntiConfig({
            ...antiState.data,
            violationsNude: violations
          });
        }
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra vi phạm nude:", error);
    }
  });

  console.log(chalk.yellow("Đã khởi động schedule kiểm tra vi phạm nude"));
}
