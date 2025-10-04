import fs from "fs";
import path from "path";
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from '../service.js';
import { removeMention } from "../../utils/format-util.js";
import { readGroupSettings } from "../../utils/io-json.js";
import { createTopChatImage } from '../../utils/canvas/info.js';

const rankInfoPath = path.join(process.cwd(), "assets", "json-data", "rank-info.json");

function readRankInfo() {
  try {
    const data = JSON.parse(fs.readFileSync(rankInfoPath, "utf8"));
    if (!data) data = {};
    if (!data.groups) data.groups = {};
    return data;
  } catch (error) {
    console.error("Lỗi khi đọc file rank-info.json:", error);
    return { groups: {} };
  }
}

function writeRankInfo(data) {
  try {
    fs.writeFileSync(rankInfoPath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Lỗi khi ghi file rank-info.json:", error);
  }
}

export function updateUserRank(groupId, userId, userName, nameGroup) {
  const rankInfo = readRankInfo();
  if (!rankInfo.groups[groupId]) {
    rankInfo.groups[groupId] = { users: [] };
  }
  if (rankInfo.groups[groupId].nameGroup !== nameGroup) {
    rankInfo.groups[groupId].nameGroup = nameGroup;
  }

  const currentDate = new Date().toISOString().split('T')[0];
  const userIndex = rankInfo.groups[groupId].users.findIndex((user) => user.UID === userId);

  rankInfo.groups[groupId].users.forEach((user) => {
    if (user.lastMessageDate !== currentDate) {
      user.messageCountToday = 0; 
    }
  });

  if (userIndex !== -1) {
    const user = rankInfo.groups[groupId].users[userIndex];
    user.messageCountToday++;
    user.lastMessageDate = currentDate;
    user.UserName = userName;
    user.Rank++;
  } else {
    rankInfo.groups[groupId].users.push({
      UserName: userName,
      UID: userId,
      Rank: 1,
      messageCountToday: 1,
      lastMessageDate: currentDate,
    });
  }

  writeRankInfo(rankInfo);
}

export async function handleRankCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split("|");

  const command = args[0].trim().toLowerCase(); 
  const rankInfo = readRankInfo();
  const threadId = message.threadId;
  const groupUsers = rankInfo.groups[threadId]?.users || [];

  if (groupUsers.length === 0) {
    await api.sendMessage(
      { msg: "Chưa có dữ liệu xếp hạng cho nhóm này.", quote: message },
      threadId,
      MessageType.GroupMessage
    );
    return;
  }

  let title = "";
  let rankData = [];

  if (command === "today") {
    const currentDate = new Date().toISOString().split("T")[0];
    const todayUsers = groupUsers.filter((user) => user.lastMessageDate === currentDate);
    if (todayUsers.length === 0) {
      await api.sendMessage(
        { msg: "Chưa có người dùng nào tương tác hôm nay.", quote: message },
        threadId,
        MessageType.GroupMessage
      );
      return;
    }
    const sortedUsers = todayUsers.sort((a, b) => b.messageCountToday - a.messageCountToday);
    rankData = sortedUsers.slice(0, 10);
    title = "🏆 Bảng xếp hạng tin nhắn hôm nay:";
  } else if (command === "") {
    const sortedUsers = groupUsers.sort((a, b) => b.Rank - a.Rank); 
    rankData = sortedUsers.slice(0, 10);
    title = "🏆 Bảng xếp hạng tin nhắn:";
  } else {
    await api.sendMessage(
      { msg: `Bạn có thể dùng:\n- ${prefix}${aliasCommand} today để kiểm tra top nhắn tin hôm nay\n- ${prefix}${aliasCommand} để kiểm tra top nhắn tin`, quote: message, ttl: 60000 },
      threadId,
      MessageType.GroupMessage
    );
    return;
  }

  try {
    const imagePath = await createTopChatImage(rankData, title, api, threadId);
    await api.sendMessage(
      { 
        msg: title,
        attachment: [imagePath],
        ttl: 600000
      },
      threadId,
      MessageType.GroupMessage
    );
    fs.unlinkSync(imagePath);
  } catch (error) {
    console.error("Lỗi khi tạo ảnh xếp hạng:", error);
    await api.sendMessage(
      { msg: "Đã xảy ra lỗi khi tạo bảng xếp hạng.", quote: message },
      threadId,
      MessageType.GroupMessage
    );
  }
}

export async function initRankSystem() {
  const groupSettings = readGroupSettings();
  const rankInfo = readRankInfo();

  for (const [groupId, groupData] of Object.entries(groupSettings)) {
    if (!rankInfo.groups[groupId]) {
      rankInfo.groups[groupId] = { users: [] };
    }

    if (groupData["adminList"]) {
      for (const [userId, userName] of Object.entries(groupData["adminList"])) {
        const existingUser = rankInfo.groups[groupId].users.find((user) => user.UID === userId);
        if (!existingUser) {
          rankInfo.groups[groupId].users.push({
            UserName: userName,
            UID: userId,
            Rank: 0,
          });
        }
      }
    }
  }

  writeRankInfo(rankInfo);
}
