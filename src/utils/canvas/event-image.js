import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cs from "./index.js";

export const linkBackgroundDefault = "https://i.postimg.cc/W3PswWM9/generated-image.jpg";
export const linkBackgroundDefaultZalo = "https://i.postimg.cc/W3PswWM9/generated-image.jpg";

export async function getLinkBackgroundDefault(userInfo) {
  let backgroundImage;
  try {
    if (userInfo.cover && userInfo.cover !== linkBackgroundDefaultZalo) {
      backgroundImage = await loadImage(userInfo.cover);
    } else {
      backgroundImage = await loadImage(linkBackgroundDefault);
    }
  } catch (error) {
    backgroundImage = await loadImage(linkBackgroundDefault);
  }
  return backgroundImage;
}

async function createImage(userInfo, message, fileName, typeImage = -1) {
  const width = 1000;
  const height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  let backgroundImage;
  let fluent = 0.8;
  if (fileName.includes("welcome") || fileName.includes("request")) {
    typeImage = 0;
    fluent = 0.6;
  } else if (fileName.includes("goodbye")) {
    typeImage = 1;
    fluent = 0.6;
  } else if (["blocked", "kicked", "kicked_spam"].some(keyword => fileName.includes(keyword))) {
    typeImage = 2;
    fluent = 0.85;
  } else if (["setting", "update", "link", "pin", "unpin", "board", "topic", "admin"].some(keyword => fileName.includes(keyword))) {
    typeImage = 3;
    fluent = 0.7;
  }

  try {
    backgroundImage = await getLinkBackgroundDefault(userInfo);
    ctx.drawImage(backgroundImage, 0, 0, width, height);

    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, `rgba(30, 30, 53, ${fluent})`);
    overlay.addColorStop(0.5, `rgba(26, 37, 71, ${fluent})`);
    overlay.addColorStop(1, `rgba(19, 27, 54, ${fluent})`);

    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);
  } catch (error) {
    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
    backgroundGradient.addColorStop(0, "#1E1E35");
    backgroundGradient.addColorStop(0.5, "#1A2547");
    backgroundGradient.addColorStop(1, "#131B36");

    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, height);
  }

  let xAvatar = 120;
  let widthAvatar = 160;
  let heightAvatar = 160;
  let yAvatar = height / 2 - heightAvatar / 2;

  let gradientColors;
  if (typeImage === 0) {
    gradientColors = ["#00ffcc", "#00ff95", "#00ff80", "#1aff8c", "#33ff99"];
  } else if (typeImage === 1) {
    gradientColors = ["#FFFFFF", "#F0F0F0", "#FAFAFF", "#F8FBFF", "#EAEAFF", "#FFF5FA", "#FFFFFF"];
  } else if (typeImage === 2) {
    gradientColors = ["#ff0000", "#ff1111", "#ff2200", "#ff0022", "#ff3300"];
  } else if (typeImage === 3) {
    gradientColors = ["#FFD700", "#FFA500", "#FF8C00", "#FFB347", "#FFCC00", "#FFE066"];
  } else {
    gradientColors = ["#FF1493", "#FF69B4", "#FFD700", "#FFA500", "#FF8C00", "#00FF7F", "#40E0D0"];
  }

  const shuffledColors = [...gradientColors].sort(() => Math.random() - 0.5);

  const userAvatarUrl = userInfo.avatar;
  if (userAvatarUrl && cs.isValidUrl(userAvatarUrl)) {
    try {
      const avatar = await loadImage(userAvatarUrl);
      const borderWidth = 10;
      const gradient = ctx.createLinearGradient(
        xAvatar - widthAvatar / 2 - borderWidth,
        yAvatar - borderWidth,
        xAvatar + widthAvatar / 2 + borderWidth,
        yAvatar + heightAvatar + borderWidth
      );

      shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(xAvatar, height / 2, widthAvatar / 2 + borderWidth, 0, Math.PI * 2, true);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(xAvatar, height / 2, widthAvatar / 2, 0, Math.PI * 2, true);
      ctx.clip();
      ctx.drawImage(avatar, xAvatar - widthAvatar / 2, yAvatar, widthAvatar, heightAvatar);
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + 30);
      ctx.lineTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + heightAvatar - 30);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  let x1 = xAvatar - widthAvatar / 2 + widthAvatar;
  let x2 = x1 + (width - x1) / 2 - 5;
  let y1 = 86;

  const titleGradient = ctx.createLinearGradient(x2 - 150, y1 - 30, x2 + 150, y1);
  shuffledColors.slice(0, 3).forEach((color, index) => {
    titleGradient.addColorStop(index / 2, color);
  });
  ctx.fillStyle = titleGradient;
  ctx.textAlign = "center";
  ctx.font = "bold 36px BeVietnamPro";
  ctx.fillText(message.title, x2, y1);

  let y2 = y1 + 50;
  const userNameGradient = ctx.createLinearGradient(x2 - 150, y2 - 30, x2 + 150, y2);
  shuffledColors.slice(2, 5).forEach((color, index) => {
    userNameGradient.addColorStop(index / 2, color);
  });
  ctx.fillStyle = userNameGradient;
  ctx.font = "bold 36px BeVietnamPro";
  ctx.fillText(message.userName, x2, y2);

  let y3 = y2 + 45;
  const subtitleGradient = ctx.createLinearGradient(x2 - 150, y3 - 30, x2 + 150, y3);
  shuffledColors.slice(1, 4).forEach((color, index) => {
    subtitleGradient.addColorStop(index / 2, color);
  });
  ctx.fillStyle = subtitleGradient;
  ctx.font = "32px BeVietnamPro";
  ctx.fillText(message.subtitle, x2, y3);

  let y4 = y3 + 45;
  const authorGradient = ctx.createLinearGradient(x2 - 150, y4 - 30, x2 + 150, y4);
  shuffledColors.slice(3, 6).forEach((color, index) => {
    authorGradient.addColorStop(index / 2, color);
  });
  ctx.fillStyle = authorGradient;
  ctx.font = "bold 32px BeVietnamPro";
  ctx.fillText(message.author, x2, y4);

  const filePath = path.resolve(`./assets/temp/${fileName}`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function createJoinRequestImage(userInfo, groupName, groupType, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    userInfo,
    {
      title: `Join Request ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${isAdmin ? "Sếp " : ""}${userName}`,
      author: `Đã gửi yêu cầu tham gia ${vnGroupType.toLowerCase()}`,
    },
    `join_request_${Date.now()}.png`
  );
}

export async function createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const authorText = userActionName === userName ? "Tham Gia Trực Tiếp Hoặc Được Mời" : `Duyệt bởi ${userActionName}`;
  return createImage(
    userInfo,
    {
      title: `Welcome ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `Chào mừng ${isAdmin ? "Sếp " : ""}${userName}`,
      author: `${authorText} ${vnGroupType.toLowerCase()}`,
    },
    `welcome_${Date.now()}.png`
  );
}

export async function createGoodbyeImage(userInfo, groupName, groupType, isAdmin) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    userInfo,
    {
      title: `Leave ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${isAdmin ? "Sếp " : ""}${userName}`,
      author: `Vừa rời khỏi ${vnGroupType.toLowerCase()}`,
    },
    `goodbye_${Date.now()}.png`
  );
}

export async function createKickImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  let userNameText = isAdmin ? `Sếp ${userName}` : `${genderText} Oắt Con ${userName}`;
  return createImage(
    userInfo,
    {
      title: `Kick Member ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${userNameText}`,
      author: `Đã bị ${userActionName} sút khỏi ${vnGroupType.toLowerCase()}`,
    },
    `kicked_${Date.now()}.png`
  );
}

export async function createBlockImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  let userNameText = isAdmin ? `Sếp ${userName}` : `${genderText} Oắt Con ${userName}`;
  return createImage(
    userInfo,
    {
      title: `Block Member ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${userNameText}`,
      author: `Đã bị ${userActionName} chặn khỏi ${vnGroupType.toLowerCase()}`,
    },
    `blocked_${Date.now()}.png`
  );
}

export async function createBlockSpamImage(userInfo, groupName, groupType, gender) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  return createImage(
    userInfo,
    {
      title: `Block Spam Member ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${genderText} Oắt Con ${userName}`,
      author: `Do spam đã bị chặn khỏi ${vnGroupType.toLowerCase()}`,
    },
    `blocked_spam_${Date.now()}.png`
  );
}

export async function createBlockSpamLinkImage(userInfo, groupName, groupType, gender) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  return createImage(
    userInfo,
    {
      title: `Block Spam Link Member ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${genderText} Oắt Con ${userName}`,
      author: `Do spam link đã bị chặn khỏi ${vnGroupType.toLowerCase()}`,
    },
    `blocked_spam_link_${Date.now()}.png`
  );
}

export async function createBlockAntiBotImage(userInfo, groupName, groupType, gender) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  return createImage(
    userInfo,
    {
      title: `Block Anti Bot Member ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${genderText} Oắt Con ${userName}`,
      author: `Do sử dụng bot đã bị chặn khỏi ${vnGroupType.toLowerCase()}`,
    },
    `blocked_anti_bot_${Date.now()}.png`
  );
}

export async function createUpdateSettingImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Update Setting ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `Đã cập nhật cài đặt ${vnGroupType.toLowerCase()}`,
    },
    `setting_${Date.now()}.png`,
    3
  );
}

export async function createUpdateDescImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Update Desc ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `Đã cập nhật mô tả ${vnGroupType.toLowerCase()}`,
    },
    `update_${Date.now()}.png`,
    3
  );
}

export async function createNewLinkImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `New Link ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `Đã tạo link ${vnGroupType.toLowerCase()} mới`,
    },
    `link_${Date.now()}.png`,
    3
  );
}

export async function createPinTopicImage(actorInfo, actorName, groupName, topicTitle, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Pin Topic ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `Đã ghim chủ đề: ${topicTitle}`,
    },
    `pin_${Date.now()}.png`,
    3
  );
}

export async function createUpdateTopicImage(actorInfo, actorName, groupName, topicTitle, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Update Topic ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `Đã cập nhật chủ đề: ${topicTitle}`,
    },
    `update_topic_${Date.now()}.png`,
    3
  );
}

export async function createUpdateBoardImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Update Board ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `Đã cập nhật bảng thông tin ${vnGroupType.toLowerCase()}`,
    },
    `board_${Date.now()}.png`,
    3
  );
}

export async function createReorderPinImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Reorder Pin ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `Đã thay đổi thứ tự ghim chủ đề`,
    },
    `reorder_pin_${Date.now()}.png`,
    3
  );
}

export async function createUnpinTopicImage(actorInfo, actorName, groupName, topicTitle, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Unpin Topic ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `Đã gỡ ghim chủ đề: ${topicTitle}`,
    },
    `unpin_${Date.now()}.png`,
    3
  );
}

export async function createRemoveTopicImage(actorInfo, actorName, groupName, topicTitle, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Remove Topic ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `Đã xóa chủ đề: ${topicTitle}`,
    },
    `remove_topic_${Date.now()}.png`,
    3
  );
}

export async function createAdminChangeImage(actorInfo, targetName, groupName, isAdd, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const actorName = actorInfo.name || "";
  return createImage(
    actorInfo,
    {
      title: `${isAdd ? "Add Admin" : "Remove Admin"} ${groupTypeText}`,
      userName: `${groupName}`,
      subtitle: `${actorName}`,
      author: `${isAdd ? "Đã thêm" : "Đã gỡ"} ${targetName} làm phó ${vnGroupType.toLowerCase()}`,
    },
    `${isAdd ? "add" : "remove"}_admin_${Date.now()}.png`,
    3
  );
                                         }
