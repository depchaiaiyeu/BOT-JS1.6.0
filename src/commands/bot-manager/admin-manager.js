// Sửa file BOT-JS1.6.0/src/commands/bot-manager/admin-manager.js

import { writeGroupSettings } from "../../utils/io-json.js";
import { readFileSync } from 'fs';
import { join } from 'path';
import { sendMessageComplete, sendMessageInsufficientAuthority, sendMessageQuery, sendMessageWarning } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { createAdminListImage } from "../../utils/canvas/info.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function handleAdminHighLevelCommands(api, message, groupAdmins, groupSettings, isAdminLevelHighest) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();

  if (!content.includes(`${prefix}add`) && 
      !content.includes(`${prefix}remove`) && 
      !content.includes(`${prefix}admin`) && 
      !content.includes(`${prefix}removeadmin`)) {
    return false;
  }

  let action = null;
  if (content.includes(`${prefix}add`)) action = "add";
  if (content.includes(`${prefix}remove`)) action = "remove";
  if (content.includes(`${prefix}admin`)) action = "admin";
  if (content.includes(`${prefix}removeadmin`)) action = "removeadmin";

  if (!action) return false;

  if (!isAdminLevelHighest) {
    if (groupAdmins.includes(message.data.uidFrom)) {
      const caption = "Chỉ có quản trị bot cấp cao mới được sử dụng lệnh này!";
      await sendMessageInsufficientAuthority(api, message, caption);
    }
    return false;
  }

  if (action === "admin" || action === "removeadmin") {
    await handleHighLevelAdmin(api, message, action);
    return true;
  }

  await handleAddRemoveAdmin(api, message, groupSettings, action);
  writeGroupSettings(groupSettings);
  return true;
}

async function handleHighLevelAdmin(api, message, action) {
  const mentions = message.data.mentions;

  if (!mentions || mentions.length === 0) {
    const caption = "Vui lòng đề cập (@mention) người dùng cần thêm/xóa khỏi danh sách quản trị viên cấp cao.";
    await sendMessageQuery(api, message, caption);
    return;
  }

  const adminListPath = path.resolve(process.cwd(), "assets", "data", "list_admin.json");
  const adminList = JSON.parse(await fs.readFile(adminListPath, "utf-8"));
  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
    if (action === "admin") {
      if (!adminList.includes(targetId)) {
        adminList.push(targetId);
        await fs.writeFile(adminListPath, JSON.stringify(adminList, null, 4));
        await sendMessageComplete(api, message, `Đã thêm ${targetName} vào danh sách quản trị viên cấp cao.`);
      } else {
        await sendMessageWarning(api, message, `${targetName} đã có trong danh sách quản trị viên cấp cao.`);
      }
    }
    if (action === "removeadmin") {
      const fixedAdminId = "YOUR_FIXED_ID";
      if (targetId === fixedAdminId) {
        await sendMessageWarning(api, message, `${targetName} là Đấng Tôi cao mày dám xóa à.`);
        continue;
      }

      if (adminList.includes(targetId)) {
        const updatedAdminList = adminList.filter((id) => id !== targetId);
        await fs.writeFile(adminListPath, JSON.stringify(updatedAdminList, null, 4));
        await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách quản trị viên cấp cao.`);
      } else {
        await sendMessageWarning(api, message, `${targetName} không tồn tại trong danh sách quản trị viên cấp cao.`);
      }
    }
  }
}

export async function handleListAdmin(api, message, groupSettings) {
  const threadId = message.threadId;

  const adminListPath = path.resolve(process.cwd(), "assets", "data", "list_admin.json");
  const highLevelAdmins = JSON.parse(await fs.readFile(adminListPath, "utf-8"));

  const groupAdmins = groupSettings[threadId].adminList || {};

  const highLevelAdminInfo = await api.getUserInfo(highLevelAdmins);
  const groupAdminIds = Object.keys(groupAdmins);
  const groupAdminInfo = await api.getUserInfo(groupAdminIds);

  const allProfiles = { ...highLevelAdminInfo.unchanged_profiles, ...highLevelAdminInfo.changed_profiles, ...groupAdminInfo.unchanged_profiles, ...groupAdminInfo.changed_profiles };

  const highLevelList = highLevelAdmins.map(id => ({
    name: allProfiles[id]?.zaloName || 'Unknown',
    avatarUrl: allProfiles[id]?.avatarId ? `https://graph.zalo.me/v2.0/user/avatar?user_id=${id}` : null,
    type: 'high'
  })).filter(user => user.name !== 'Unknown');

  const groupList = groupAdminIds.map(id => ({
    name: groupAdmins[id] || allProfiles[id]?.zaloName || 'Unknown',
    avatarUrl: allProfiles[id]?.avatarId ? `https://graph.zalo.me/v2.0/user/avatar?user_id=${id}` : null,
    type: 'group'
  })).filter(user => user.name !== 'Unknown');

  try {
    const imagePath = await createAdminListImage(highLevelList, groupList);
    await api.sendMessage(
      {
        attachment: fs.createReadStream(imagePath),
        quote: message,
      },
      threadId,
      message.type
    );
    fs.unlink(imagePath).catch(console.error);
  } catch (error) {
    console.error('Error creating admin list image:', error);
  }
}

async function handleAddRemoveAdmin(api, message, groupSettings, action) {
  const mentions = message.data.mentions;
  const threadId = message.threadId;
  const content = removeMention(message);

  if (action === "remove" && /\d+/.test(content)) {
    const indexMatch = content.match(/\d+/);
    if (indexMatch) {
      const index = parseInt(indexMatch[0]) - 1;
      const adminList = Object.entries(groupSettings[threadId].adminList);

      if (index >= 0 && index < adminList.length) {
        const [targetId, targetName] = adminList[index];
        delete groupSettings[threadId]["adminList"][targetId];
        await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách quản trị bot của nhóm này.`);
        return;
      } else {
        await sendMessageWarning(api, message, `Số thứ tự không hợp lệ. Vui lòng kiểm tra lại danh sách quản trị viên.`);
        return;
      }
    }
  }

  if (!mentions || mentions.length === 0) {
    const caption = "Vui lòng đề cập (@mention) người dùng cần thêm/xóa khỏi danh sách quản trị bot.";
    await sendMessageQuery(api, message, caption);
    return;
  }

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    switch (action) {
      case "add":
        if (!groupSettings[threadId]["adminList"][targetId]) {
          groupSettings[threadId]["adminList"][targetId] = targetName;
          await sendMessageComplete(api, message, `Đã thêm ${targetName} vào danh sách quản trị bot của nhóm này.`);
        } else {
          await sendMessageWarning(api, message, `${targetName} đã có trong danh sách quản trị bot của nhóm này.`);
        }
        break;
      case "remove":
        if (groupSettings[threadId]["adminList"][targetId]) {
          delete groupSettings[threadId]["adminList"][targetId];
          await sendMessageComplete(api, message, `Đã xóa ${targetName} khỏi danh sách quản trị bot của nhóm này.`);
        } else {
          await sendMessageWarning(api, message, `${targetName} không có trong danh sách quản trị bot của nhóm này.`);
        }
        break;
    }
  }
}
