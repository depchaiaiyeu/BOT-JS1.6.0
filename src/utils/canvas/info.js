import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";
import { formatCurrency } from "../format-util.js";

export function hanldeNameUser(name) {
  const words = name.split(" ");
  let line1 = "";
  let line2 = "";

  if (name.length <= 16) {
    return [name, ""];
  }

  if (words.length === 1) {
    line1 = name.substring(0, 16);
    line2 = name.substring(16);
  } else {
    for (let i = 0; i < words.length; i++) {
      if ((line1 + " " + words[i]).trim().length <= 16) {
        line1 += (line1 ? " " : "") + words[i];
      } else {
        line2 = words.slice(i).join(" ");
        break;
      }
    }
  }

  return [line1.trim(), line2.trim()];
}

export function handleNameLong(name, lengthLine = 16) {
  const words = name.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= lengthLine) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) {
        lines.push(currentLine.trim());
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }

  // Nếu không có dòng nào được tạo (tên ngắn hơn 16 ký tự), thêm tên gốc vào mảng
  if (lines.length === 0) {
    lines.push(name);
  }

  return {
    lines: lines,
    totalLines: lines.length,
  };
}

// Tạo Hình Lệnh !Info
export async function createUserInfoImage(userInfo) {
  const [nameLine1, nameLine2] = hanldeNameUser(userInfo.name);
  const width = 1000;
  let yTemp = 400;
  const lineBio = 35;

  // Thêm bio vào giữa bức ảnh
  if (userInfo.bio !== "Không có thông tin bio") {
    const bioLines = [...userInfo.bio.split("\n")];
    const lineHeight = lineBio;
    yTemp += 20;

    bioLines.forEach((line, index) => {
      const { lines, totalLines } = handleNameLong(line, 56);
      yTemp += lineHeight * totalLines;
    });
  }

  yTemp += 30;
  const height = yTemp > 430 ? yTemp : 430;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (userInfo.cover && cv.isValidUrl(userInfo.cover)) {
    try {
      const cover = await loadImage(userInfo.cover);
      ctx.drawImage(cover, 0, 0, width, height);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, width, height);

    } catch (error) {
      console.error("Lỗi load cover:", error);
      const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
      backgroundGradient.addColorStop(0, "#3B82F6");
      backgroundGradient.addColorStop(1, "#111827");
      ctx.fillStyle = backgroundGradient;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    // Nếu không có cover, sử dụng gradient mặc định
    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
    backgroundGradient.addColorStop(0, "#3B82F6");
    backgroundGradient.addColorStop(1, "#111827");
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, height);
  }

  let xAvatar = 170;
  let widthAvatar = 180;
  let heightAvatar = 180;
  let yAvatar = 100; // Đặt yAvatar cố định là 100
  let yA1 = height / 2 - heightAvatar / 2 - yAvatar; // Tính toán lại yA1

  if (userInfo && cv.isValidUrl(userInfo.avatar)) {
    try {
      const avatar = await loadImage(userInfo.avatar);

      // Vẽ vòng tròn 7 màu cầu vồng
      const borderWidth = 10;
      const gradient = ctx.createLinearGradient(
        xAvatar - widthAvatar / 2 - borderWidth,
        yAvatar - borderWidth,
        xAvatar + widthAvatar / 2 + borderWidth,
        yAvatar + heightAvatar + borderWidth
      );

      const rainbowColors = [
        "#FF0000", // Đỏ
        "#FF7F00", // Cam
        "#FFFF00", // Vàng
        "#00FF00", // Lục
        "#0000FF", // Lam
        "#4B0082", // Chàm
        "#9400D3", // Tím
      ];

      // Xáo trộn mảng màu sắc
      const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);

      // Thêm các màu vào gradient
      shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2 + borderWidth,
        0,
        Math.PI * 2,
        true
      );
      ctx.fillStyle = gradient;
      ctx.fill();

      // Vẽ avatar
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2,
        0,
        Math.PI * 2,
        true
      );
      ctx.clip();
      ctx.drawImage(
        avatar,
        xAvatar - widthAvatar / 2,
        yAvatar,
        widthAvatar,
        heightAvatar
      );
      ctx.restore();

      // Vẽ chấm trạng thái
      const dotSize = 26;
      const dotX = xAvatar + widthAvatar / 2 - dotSize / 2;
      const dotY = yAvatar + heightAvatar - dotSize / 2;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize / 2, 0, Math.PI * 2);
      if (userInfo.isOnline) {
        ctx.fillStyle = "#00FF00"; // Màu xanh lá cây cho trạng thái hoạt động
      } else {
        ctx.fillStyle = "#808080"; // Màu xám cho trạng thái không hoạt động
      }
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Vẽ tên người dùng dưới avatar
      ctx.font = "bold 32px Tahoma";
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      const nameY = yAvatar + heightAvatar + 54;
      if (nameLine2) {
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine1, xAvatar, nameY);
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine2, xAvatar, nameY + 28);
      } else {
        ctx.fillText(nameLine1, xAvatar, nameY);
      }

      // Vẽ các biểu tượng
      const iconSize = 24;
      const iconSpacing = 10;
      const icons = [];

      if (userInfo.isActive) icons.push("📱");
      if (userInfo.isActivePC) icons.push("💻");
      if (userInfo.isActiveWeb) icons.push("🌐");

      const totalWidth =
        icons.length * iconSize + (icons.length - 1) * iconSpacing;
      const iconsY = nameY + (nameLine2 ? 68 : 40); // Đặt biểu tượng cách tên 40px

      ctx.font = `${iconSize}px Arial`;
      icons.forEach((icon, index) => {
        const x =
          xAvatar + (index - (icons.length - 1) / 2) * (iconSize + iconSpacing);
        ctx.fillText(icon, x, iconsY);
      });
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  let y1 = 60;

  ctx.textAlign = "center";
  ctx.font = "bold 48px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(userInfo.title, width / 2, y1);

  // Sau khi vẽ tên và biểu tượng
  // const nameWidth = ctx.measureText(nameLine1).width;
  const infoStartX = xAvatar + widthAvatar / 2 + 86;

  ctx.textAlign = "left";
  let y = y1 + 60;

  const fields = [
    { label: "🆔 Username", value: userInfo.username },
    { label: "🎂 Ngày sinh", value: userInfo.birthday },
    { label: "🧑‍🤝‍🧑 Giới tính", value: userInfo.gender },
    { label: "💼 Tài khoản Business", value: userInfo.businessType },
    { label: "📅 Ngày tạo tài khoản", value: userInfo.createdDate },
    { label: "🕰️ Lần cuối hoạt động", value: userInfo.lastActive },
  ];

  ctx.font = "bold 28px BeVietnamPro";
  for (const field of fields) {
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    const labelText = field.label + ":";
    const labelWidth = ctx.measureText(labelText).width;
    ctx.fillText(labelText, infoStartX, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(" " + field.value, infoStartX + labelWidth, y);
    y += 52;
  }

  if (userInfo.bio !== "Không có thông tin bio") {
    ctx.textAlign = "center";

    ctx.beginPath();
    ctx.moveTo(width * 0.05, y - 20);
    ctx.lineTo(width * 0.95, y - 20);
    ctx.strokeStyle = "rgba(255, 255, 255)";
    ctx.lineWidth = 2;
    ctx.stroke();

    y += 25;
    const bioLines = [...userInfo.bio.split("\n")];

    bioLines.forEach((line, index) => {
      const { lines } = handleNameLong(line, 56);
      for (const line of lines) {
        const lineGradient = cv.getRandomGradient(ctx, width);
        ctx.fillStyle = lineGradient;

        ctx.fillText(line, width / 2, y);
        y += lineBio;
      }
    });
  }

  const filePath = path.resolve(`./assets/temp/user_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

// Tạo Hình Card Game
export async function createUserCardGame(playerInfo) {
  const [nameLine1, nameLine2] = cv.hanldeNameUser(playerInfo.playerName);
  const width = 1080;

  const height = 535;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  cv.drawDynamicGradientBackground(ctx, width, height);
  cv.drawAnimatedBackground(ctx, width, height);

  let xAvatar = 180;
  let widthAvatar = 180;
  let heightAvatar = 180;
  let yAvatar = 100; // Đặt yAvatar cố định là 100
  let yA1 = height / 2 - heightAvatar / 2 - yAvatar; // Tính toán lại yA1

  if (playerInfo && cv.isValidUrl(playerInfo.avatar)) {
    try {
      const avatar = await loadImage(playerInfo.avatar);

      // Vẽ vòng tròn 7 màu cầu vồng
      const borderWidth = 10;
      const gradient = ctx.createLinearGradient(
        xAvatar - widthAvatar / 2 - borderWidth,
        yAvatar - borderWidth,
        xAvatar + widthAvatar / 2 + borderWidth,
        yAvatar + heightAvatar + borderWidth
      );

      const rainbowColors = [
        "#FF0000", // Đỏ
        "#FF7F00", // Cam
        "#FFFF00", // Vàng
        "#00FF00", // Lục
        "#0000FF", // Lam
        "#4B0082", // Chàm
        "#9400D3", // Tím
      ];

      // Xáo trộn mảng màu sắc
      const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);

      // Thêm các màu vào gradient
      shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2 + borderWidth,
        0,
        Math.PI * 2,
        true
      );
      ctx.fillStyle = gradient;
      ctx.fill();

      // Thêm hiệu ứng bóng mờ màu trắng xung quanh avatar
      ctx.shadowColor = "rgba(255, 255, 255, 0.5)"; // Màu trắng với độ trong suốt
      ctx.shadowBlur = 20; // Độ mờ của bóng
      ctx.shadowOffsetX = 0; // Không có độ lệch theo chiều ngang
      ctx.shadowOffsetY = 0; // Không có độ lệch theo chiều dọc

      // Vẽ avatar
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2,
        0,
        Math.PI * 2,
        true
      );
      ctx.clip();
      ctx.drawImage(
        avatar,
        xAvatar - widthAvatar / 2,
        yAvatar,
        widthAvatar,
        heightAvatar
      );
      ctx.restore();

      // Giữ lại hiệu ứng bóng mờ chỉ xung quanh avatar
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;

      // Vẽ chấm trạng thái
      const dotSize = 26;
      const dotX = xAvatar + widthAvatar / 2 - dotSize / 2;
      const dotY = yAvatar + heightAvatar - dotSize / 2;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize / 2, 0, Math.PI * 2);
      if (playerInfo.isOnline) {
        ctx.fillStyle = "#00FF00"; // Màu xanh lá cây cho trạng thái hoạt động
      } else {
        ctx.fillStyle = "#808080"; // Màu xám cho trạng thái không hoạt động
      }
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Vẽ tên người dùng dưới avatar
      ctx.font = "bold 32px Tahoma";
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      const nameY = yAvatar + heightAvatar + 54;
      if (nameLine2) {
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine1, xAvatar, nameY);
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine2, xAvatar, nameY + 28);
      } else {
        ctx.fillText(nameLine1, xAvatar, nameY);
      }

      // Thêm hiệu ứng gradient cho tên người dùng
      const nameGradient = ctx.createLinearGradient(
        xAvatar,
        nameY,
        xAvatar,
        nameY + 30
      );
      nameGradient.addColorStop(0, "#ff4b1f");
      nameGradient.addColorStop(1, "#1fddff");
      ctx.fillStyle = nameGradient;

      // Thêm khung và hiệu ứng cho avatar
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;

      // Vẽ các biểu tượng
      const iconSize = 24;
      const iconSpacing = 10;
      const icons = [];

      if (playerInfo.isActive) icons.push("📱");
      if (playerInfo.isActivePC) icons.push("💻");
      if (playerInfo.isActiveWeb) icons.push("🌐");
      const iconsY = nameY + (nameLine2 ? 68 : 40); // Đặt biểu tượng cách tên 40px

      ctx.font = `${iconSize}px Arial`;
      icons.forEach((icon, index) => {
        const x =
          xAvatar + (index - (icons.length - 1) / 2) * (iconSize + iconSpacing);
        ctx.fillText(icon, x, iconsY);
      });
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  let y1 = 60;

  ctx.textAlign = "center";
  ctx.font = "bold 48px Tahoma";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(playerInfo.title, width / 2, y1);

  // Sau khi vẽ tên và biểu tượng
  const nameWidth = ctx.measureText(nameLine1).width;
  const infoStartX = Math.max(
    xAvatar + widthAvatar / 2 + 60,
    xAvatar + nameWidth / 2 - 20
  );

  ctx.textAlign = "left";
  let y = y1 + 45;

  // Danh sách các trường thông tin cần hiển thị
  const fields = [
    { label: "🆔 Tên Đăng Nhập", value: playerInfo.account },
    // { label: "🧑‍🤝‍🧑 Giới tính", value: playerInfo.gender },
    {
      label: "💰 Số Dư Hiện Tại",
      value: formatCurrency(playerInfo.balance) + " VNĐ",
    },
    {
      label: "🏆 Tổng Thắng",
      value: formatCurrency(playerInfo.totalWinnings) + " VNĐ",
    },
    {
      label: "💸 Tổng Thua",
      value: formatCurrency(playerInfo.totalLosses) + " VNĐ",
    },
    {
      label: "💹 Lợi Nhuận Ròng",
      value: formatCurrency(playerInfo.netProfit) + " VNĐ",
    },
    {
      label: "🎮 Số Lượt Chơi",
      value:
        playerInfo.totalGames +
        " Games " +
        "(" +
        playerInfo.totalWinGames +
        "W/" +
        (playerInfo.totalGames - playerInfo.totalWinGames) +
        "L)",
    },
    { label: "📊 Tỉ Lệ Thắng", value: playerInfo.winRate + "%" },
    { label: "📅 Created Time", value: playerInfo.registrationTime },
    { label: "🎁 Nhận Quà Daily", value: playerInfo.lastDailyReward },
  ];

  ctx.font = "bold 28px Tahoma";
  for (const field of fields) {
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    const labelText = field.label + ":";
    const labelWidth = ctx.measureText(labelText).width;
    ctx.fillText(labelText, infoStartX, y);

    if (field.label === "📊 Tỉ Lệ Thắng") {
      // Vẽ thanh trạng thái cho t�� lệ thắng
      const barWidth = 200; // Chiều dài tối đa của thanh trạng thái
      const winRate = parseFloat(field.value); // Giả sử field.value là chuỗi "50%"
      const filledWidth = (winRate / 100) * barWidth; // Tính toán chiều dài đã điền của thanh

      // Tạo gradient nhẹ nhàng cho thanh trạng thái
      const barGradient = ctx.createLinearGradient(
        infoStartX + labelWidth,
        y - 20,
        infoStartX + labelWidth + barWidth,
        y
      );
      barGradient.addColorStop(0, "#b8e994"); // Màu xanh nhạt
      barGradient.addColorStop(0.5, "#96e6a1"); // Màu xanh lá nhạt
      barGradient.addColorStop(1, "#b8e994"); // Màu xanh nhạt

      // Vẽ thanh nền với góc bo tròn
      ctx.fillStyle = "#ddd"; // Màu nền của thanh
      cv.roundRect(
        ctx,
        infoStartX + labelWidth + 20,
        y - 20,
        barWidth,
        20,
        5,
        true,
        false
      );

      // Vẽ phần đã điền của thanh với gradient và góc bo tròn
      ctx.fillStyle = barGradient;
      cv.roundRect(
        ctx,
        infoStartX + labelWidth + 20,
        y - 20,
        filledWidth,
        20,
        5,
        true,
        false
      );

      // Hiển thị phần trăm bên phải thanh trạng thái
      ctx.fillStyle = "#fff"; // Màu chữ
      ctx.fillText(field.value, infoStartX + labelWidth + 30 + barWidth + 5, y); // Vị trí hiển thị phần trăm
    } else {
      // Vẽ giá trị thông thường cho các trường khác
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(" " + field.value, infoStartX + labelWidth, y);
    }

    y += 42; // Tăng y cho trường tiếp theo
  }

  ctx.beginPath();
  ctx.moveTo(width * 0.05, y - 20);
  ctx.lineTo(width * 0.95, y - 20);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.stroke();
  y += 20; // Tăng y cho trường tiếp theo

  ctx.font = "bold 28px Tahoma";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.textAlign = "center";
  ctx.fillText("Chúc Bạn 8386 | Mãi Đỉnh Mãi Đỉnh", width / 2, y);

  const filePath = path.resolve(`./assets/temp/user_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function createBotInfoImage(
  botInfo,
  uptime,
  botStats,
  onConfigs,
  offConfigs,
  activeSince
) {
  const width = 1000;
  let yTemp = 86;

  const maxConfigCount = Math.max(onConfigs.length, offConfigs.length);

  let fields = [
    { label: "🔢 Phiên bản vận hành", value: botStats.version },
    { label: "💾 Bộ nhớ bot sử dụng", value: botStats.memoryUsage },
    { label: "🔢 Hệ điều hành", value: botStats.os },
    { label: "💾 CPU Model", value: botStats.cpuModel },
    { label: "🔢 CPU Usage", value: botStats.cpu },
    { label: "🔢 CPU Temp", value: botStats.cpuTemp },
    { label: "🔢 RAM Usage", value: botStats.ram },
    { label: "🔢 Disk Usage", value: botStats.disk },
    { label: "🔢 Network", value: botStats.network },
  ];
  fields = fields.filter(field => field.value !== undefined);
  yTemp += 90;
  yTemp += 42 * fields.length;
  yTemp += 12;
  let spaceConfig = yTemp;

  if (onConfigs.length > 0 || offConfigs.length > 0) {
    yTemp += 12;
    yTemp += 46;
    yTemp += maxConfigCount * 40;
  }

  const extraHeight = 270;
  const height = yTemp + extraHeight;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Vẽ background với avatar nếu có
  if (botInfo && cv.isValidUrl(botInfo.avatar)) {
    try {
      const avatar = await loadImage(botInfo.avatar);
      
      // Vẽ avatar phóng to để lấp đầy background
      const scale = Math.max(width / avatar.width, height / avatar.height);
      const scaledWidth = avatar.width * scale;
      const scaledHeight = avatar.height * scale;
      const x = (width - scaledWidth) / 2;
      const y = (height - scaledHeight) / 2;
      
      ctx.drawImage(avatar, x, y, scaledWidth, scaledHeight);
      
      // Thêm lớp overlay với độ mờ 60%
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // #2C3E50 với alpha 0.6
      ctx.fillRect(0, 0, width, height);
    } catch (error) {
      console.error("Lỗi load avatar background:", error);
      // Nếu không load được avatar, sử dụng background mặc định
      const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
      backgroundGradient.addColorStop(0, "#2C3E50");
      backgroundGradient.addColorStop(1, "#2C3E50");
      ctx.fillStyle = backgroundGradient;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    // Background mặc định nếu không có avatar
    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
    backgroundGradient.addColorStop(0, "#2C3E50");
    backgroundGradient.addColorStop(1, "#2C3E50");
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, height);
  }

  // Thêm hiệu ứng ánh kim loại
  const metallicGradient = ctx.createLinearGradient(0, 0, width, height);
  metallicGradient.addColorStop(0, "rgba(255, 255, 255, 0.05)");
  metallicGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.1)");
  metallicGradient.addColorStop(1, "rgba(255, 255, 255, 0.05)");
  ctx.fillStyle = metallicGradient;
  ctx.fillRect(0, 0, width, height);

  let y1 = 60;

  ctx.textAlign = "center";
  ctx.font = "bold 48px Tahoma";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(botInfo.name, width / 2, y1);

  let y = y1 + 60;
  ctx.font = "bold 28px Tahoma";

  let xCenter = width / 2;

// Vẽ thời gian hoạt động ở giữa
ctx.textAlign = "center";
ctx.fillStyle = cv.getRandomGradient(ctx, width);
const labelText = "⏱️ Thời gian hoạt động";
ctx.fillText(labelText, xCenter, y);
y += 42;

ctx.fillStyle = "#FFFFFF";
ctx.fillText(uptime, xCenter, y);
y += 42;

// Vẽ tiêu đề "⏱️ Tổng thời gian đã hoạt động"
ctx.fillStyle = cv.getRandomGradient(ctx, width); // Gradient sáng cho chữ
const activeLabelText = "⏱️ Tổng thời gian đã hoạt động";
ctx.fillText(activeLabelText, xCenter, y);
y += 42;

// Vẽ tổng thời gian đã hoạt động (activeSince)
ctx.fillStyle = "#FFFFFF";
ctx.fillText(activeSince, xCenter, y);
y += 42;

  // Vẽ các fields ở giữa
  for (const field of fields) {
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    const labelText = field.label + ":";
    const labelWidth = ctx.measureText(labelText).width;
    const valueText = field.value;
    const valueWidth = ctx.measureText(valueText).width;
    const totalWidth = labelWidth + ctx.measureText(" ").width + valueWidth;
    
    const startX = xCenter - totalWidth / 2;
    ctx.textAlign = "left";
    ctx.fillText(labelText, startX, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(" " + valueText, startX + labelWidth, y);
    y += 45;
  }

  if (onConfigs.length > 0 || offConfigs.length > 0) {
    let endY1 = spaceConfig;
    const offsetY = 100;
    endY1 += offsetY;

    ctx.beginPath();
    ctx.moveTo(width * 0.05, endY1);
    ctx.lineTo(width * 0.95, endY1);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();

    endY1 += 50;

    ctx.textAlign = "center";
    ctx.font = "bold 32px Tahoma";
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    ctx.fillText("📊 Cấu hình hiện tại trong nhóm:", xCenter, endY1);
    endY1 += 70;

    const leftColumnX = width * 0.25;
    const rightColumnX = width * 0.75;
    let leftY = endY1;
    let rightY = endY1;

    ctx.font = "bold 24px Tahoma";

    if (onConfigs.length === 0 && offConfigs.length > 0) {
      // Nếu tất cả đều tắt, vẽ ở giữa
      ctx.textAlign = "center";
      ctx.fillStyle = "#FF6B6B";
      ctx.fillText("Tất cả cấu hình đang tắt:", xCenter, endY1);
      endY1 += 45;
      offConfigs.forEach((line) => {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(line, xCenter, endY1);
        endY1 += 45;
      });
    } else if (offConfigs.length === 0 && onConfigs.length > 0) {
      // Nếu tất cả đều bật, vẽ ở giữa
      ctx.textAlign = "center";
      ctx.fillStyle = "#4ECB71";
      ctx.fillText("Tất cả cấu hình đang bật:", xCenter, endY1);
      endY1 += 45;
      onConfigs.forEach((line) => {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(line, xCenter, endY1);
        endY1 += 45;
      });
    } else {
      if (offConfigs.length > 0) {
        // Vẽ cấu hình off (bên trái)
        ctx.fillStyle = "#FF6B6B";
        ctx.fillText("Cấu hình đang tắt:", leftColumnX, leftY);
        leftY += 45;
        offConfigs.forEach((line) => {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillText(line, leftColumnX, leftY);
          leftY += 45;
        });
      }

      if (onConfigs.length > 0) {
        // Vẽ cấu hình on (bên phải)
        ctx.fillStyle = "#4ECB71";
        ctx.fillText("Cấu hình đang bật:", rightColumnX, rightY);
        rightY += 45;
        onConfigs.forEach((line) => {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillText(line, rightColumnX, rightY);
          rightY += 45;
        });
      }
    }
  }

  const filePath = path.resolve(`./assets/temp/bot_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function createGroupInfoImage(groupInfo, owner) {
  const { lines: nameLines, totalLines: nameTotalLines } = handleNameLong(
    groupInfo.name
  );
  const width = 930;
  let yTemp = 300;

  if (nameTotalLines > 1) {
    yTemp += 32 * (nameTotalLines - 1);
  }

  let bioLinesArray = [];

  if (groupInfo.desc !== "") {
    const bioLines = [...groupInfo.desc.split("\n")];
    const lineHeight = 32;
    yTemp += 20;

    bioLines.forEach((line, index) => {
      const { lines: bioLines, totalLines: bioTotalLines } = handleNameLong(
        line,
        56
      );
      bioLines.forEach((bioLine) => {
        bioLinesArray.push(bioLine);
      });
      yTemp += bioTotalLines * lineHeight;
    });
  }

  yTemp += 30;
  const height = yTemp > 300 ? yTemp : 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Áp dụng nền động và gradient
  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, "#0A0A0A"); // Đen đậm hơn (gần như đen thuần)
  backgroundGradient.addColorStop(1, "#121212"); // Đen đậm hơn nhưng có chút sắc xám
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  let xAvatar = 160;
  let widthAvatar = 160;
  let heightAvatar = 160;
  let yAvatar = 100; // Đặt yAvatar cố định là 100
  let yA1 = height / 2 - heightAvatar / 2 - yAvatar; // Tính toán lại yA1
  let yBottom = 0;

  if (groupInfo && cv.isValidUrl(groupInfo.avt)) {
    try {
      const avatar = await loadImage(groupInfo.avt);

      // Vẽ vòng tròn 7 màu cầu vồng
      const borderWidth = 10;
      const gradient = ctx.createLinearGradient(
        xAvatar - widthAvatar / 2 - borderWidth,
        yAvatar - borderWidth,
        xAvatar + widthAvatar / 2 + borderWidth,
        yAvatar + heightAvatar + borderWidth
      );

      const rainbowColors = [
        "#FF0000", // Đỏ
        "#FF7F00", // Cam
        "#FFFF00", // Vàng
        "#00FF00", // Lục
        "#0000FF", // Lam
        "#4B0082", // Chàm
        "#9400D3", // Tím
      ];

      // Xáo trộn mảng màu sắc
      const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);

      // Thêm các màu vào gradient
      shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2 + borderWidth,
        0,
        Math.PI * 2,
        true
      );
      ctx.fillStyle = gradient;
      ctx.fill();

      // Vẽ avatar
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2,
        0,
        Math.PI * 2,
        true
      );
      ctx.clip();
      ctx.drawImage(
        avatar,
        xAvatar - widthAvatar / 2,
        yAvatar,
        widthAvatar,
        heightAvatar
      );
      ctx.restore();

      // Vẽ tên group dưới avatar
      ctx.font = "bold 32px Tahoma";
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      const nameY = yAvatar + heightAvatar + 48;
      yBottom = nameY;

      const lineHeight = 28;
      nameLines.forEach((line, index) => {
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(line, xAvatar, nameY + index * lineHeight);
        yBottom = nameY + index * lineHeight;
      });

      yBottom += 38;
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  let y1 = 52;

  const groupType = groupInfo.groupType
    ? groupInfo.groupType === 2
      ? "Cộng Đồng"
      : "Nhóm"
    : "Nhóm";
  ctx.textAlign = "center";
  ctx.font = "bold 48px Tahoma";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(`Card Group`, width / 2, y1);

  // Sau khi vẽ tên và biểu tượng
  const nameWidth = ctx.measureText(nameLines[0]).width;
  const infoStartX = Math.max(
    xAvatar + widthAvatar / 2 + 60,
    xAvatar + nameWidth / 2 - 40
  );

  ctx.textAlign = "left";
  let y = y1 + 52;

  // Danh sách các trường thông tin cần hiển thị
  const fields = [
    { label: `🔢 ID`, value: groupInfo.groupId },
    { label: `👑 Trưởng Nhóm`, value: owner.name },
    { label: "👥 Số thành viên", value: groupInfo.memberCount },
    { label: `🕰️ Ngày tạo`, value: groupInfo.createdTime },
    { label: "🏷️ Phân Loại", value: groupType },
  ];

  ctx.font = "bold 28px Tahoma";
  for (const field of fields) {
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    const labelText = field.label + ":";
    const labelWidth = ctx.measureText(labelText).width;
    ctx.fillText(labelText, infoStartX, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(" " + field.value, infoStartX + labelWidth, y);
    y += 48;
  }

  if (groupInfo.desc !== "") {
    ctx.textAlign = "center";
    ctx.font = "bold 24px Tahoma";

    // Vẽ đường thẳng màu trắng
    ctx.beginPath();
    ctx.moveTo(width * 0.05, yBottom - 20);
    ctx.lineTo(width * 0.95, yBottom - 20);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();

    yBottom += 25; // Tăng y để tạo khoảng cách giữa đường thẳng và bio
    const lineHeight = 32;

    bioLinesArray.forEach((line, index) => {
      const lineGradient = cv.getRandomGradient(ctx, width);
      ctx.fillStyle = lineGradient;

      ctx.fillText(line, width / 2, yBottom);
      yBottom += lineHeight;
    });
  }

  const filePath = path.resolve(`./assets/temp/group_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function createAdminListImage(highLevelAdminIds, groupAdminIds, imagePath) {
  const width = 930;
  const avatarSize = 80;
  const nameHeight = 30;
  const itemHeight = avatarSize + nameHeight + 20;
  const padding = 40;
  const columnWidth = (width - padding * 3) / 2;
  
  const maxItems = Math.max(highLevelAdminIds.length, groupAdminIds.length);
  const contentHeight = maxItems * itemHeight + 200;
  const height = Math.max(contentHeight, 400);
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, '#1a1a2e');
  backgroundGradient.addColorStop(1, '#0f0f1e');
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.font = 'bold 36px Tahoma';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText("Danh Sách Quản Trị Viên", width / 2, 50);

  const leftX = padding + columnWidth / 2;
  const rightX = padding * 2 + columnWidth + columnWidth / 2;
  let leftY = 120;
  let rightY = 120;

  ctx.font = 'bold 28px Tahoma';
  ctx.fillStyle = '#FFD700';
  ctx.fillText("Quản Trị Cấp Cao", leftX, leftY);
  leftY += 50;

  ctx.fillStyle = '#4ECDC4';
  ctx.fillText("Quản Trị Nhóm", rightX, rightY);
  rightY += 50;

  for (let i = 0; i < Math.max(highLevelAdminIds.length, groupAdminIds.length); i++) {
    if (i < highLevelAdminIds.length) {
      const adminInfo = await getUserInfoData(null, highLevelAdminIds[i]);
      if (adminInfo && cv.isValidUrl(adminInfo.avatar)) {
        try {
          const avatar = await loadImage(adminInfo.avatar);
          
          ctx.save();
          ctx.beginPath();
          ctx.arc(leftX, leftY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.clip();
          ctx.drawImage(avatar, leftX - avatarSize / 2, leftY, avatarSize, avatarSize);
          ctx.restore();

          ctx.font = 'bold 20px Tahoma';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          const nameLines = cv.handleNameLong(adminInfo.name, 18).lines;
          nameLines.forEach((line, idx) => {
            ctx.fillText(line, leftX, leftY + avatarSize + 25 + idx * 22);
          });
        } catch (error) {
          console.error("Lỗi load avatar admin cấp cao:", error);
        }
      }
      leftY += itemHeight;
    }

    if (i < groupAdminIds.length) {
      const adminInfo = await getUserInfoData(null, groupAdminIds[i]);
      if (adminInfo && cv.isValidUrl(adminInfo.avatar)) {
        try {
          const avatar = await loadImage(adminInfo.avatar);
          
          ctx.save();
          ctx.beginPath();
          ctx.arc(rightX, rightY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
          ctx.strokeStyle = '#4ECDC4';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.clip();
          ctx.drawImage(avatar, rightX - avatarSize / 2, rightY, avatarSize, avatarSize);
          ctx.restore();

          ctx.font = 'bold 20px Tahoma';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          const nameLines = cv.handleNameLong(adminInfo.name, 18).lines;
          nameLines.forEach((line, idx) => {
            ctx.fillText(line, rightX, rightY + avatarSize + 25 + idx * 22);
          });
        } catch (error) {
          console.error("Lỗi load avatar admin nhóm:", error);
        }
      }
      rightY += itemHeight;
    }
  }

  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(imagePath, buffer);
}
