import schedule from "node-schedule";
import fs from "fs/promises";
import path from "path";

const countdownJobs = new Map();
const groupSettingsPath = path.resolve("./assets/data/group_settings.json");

async function isBotActive(threadId) {
  try {
    const data = await fs.readFile(groupSettingsPath, "utf-8");
    const groupSettings = JSON.parse(data);
    return groupSettings[threadId]?.activeBot === true;
  } catch (error) {
    console.error("Lỗi đọc group_settings.json:", error);
    return false;
  }
}

function getRandomReaction() {
  const reactions = [
    ":;", ":)", ":))", ":*", ":(", ":((",
    "/-flag", "/-li", "HEART", "LIKE", "CLOCK"
  ];
  return reactions[Math.floor(Math.random() * reactions.length)];
}

export async function sendReactionWaitingCountdown(api, message, count) {
  const messageId = message.data.cliMsgId || Date.now().toString();
  const threadId = message.threadId || message.data?.threadId;

  const isActive = await isBotActive(threadId);
  if (!isActive) return;

  const date = new Date(Date.now() + 300);
  const job = schedule.scheduleJob(date, async () => {
    try {
      for (let i = 0; i < count; i++) {
        try {
          const reaction = getRandomReaction();
          await api.addReaction(reaction, message);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await api.addReaction("UNDO", message);
        } catch (error) {}
      }
    } catch (error) {
      console.error(`Error in countdown job ${messageId}:`, error);
    } finally {
      job.cancel();
      countdownJobs.delete(messageId);
    }
  });

  countdownJobs.set(messageId, job);
}
