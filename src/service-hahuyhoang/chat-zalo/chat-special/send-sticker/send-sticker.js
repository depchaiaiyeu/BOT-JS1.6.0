import axios from "axios";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getGlobalPrefix } from "../../../service.js";
import { checkExstentionFileRemote, deleteFile, downloadFile, execAsync } from "../../../../utils/util.js";
import { MultiMsgStyle, MessageStyle, MessageType } from "../../../../api-zalo/index.js";
import { nameServer } from "../../../../database/index.js";
import { MessageMention } from "../../../../api-zalo/index.js";
import { tempDir } from "../../../../utils/io-json.js";
import { removeMention } from "../../../../utils/format-util.js";
import { getVideoMetadata } from "../../../../api-zalo/utils.js";
import { isAdmin } from "../../../../index.js";
import { convertToWebp } from "./create-webp.js";

export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_GREEN = "15a85f";
export const SIZE_18 = "18";
export const SIZE_16 = "14";
export const IS_BOLD = true;

async function isValidMediaUrl(url) {
  try {
    const headResponse = await axios.head(url);
    const contentType = headResponse.headers["content-type"];
    const isVideo = contentType && contentType.includes("video/");
    if (contentType && (isVideo || contentType.includes("image/"))) {
      return {
        isValid: true,
        isVideo,
      };
    }

    const response = await axios.get(url, { responseType: "arraybuffer" });
    return {
      isValid: response.status === 200 && response.data.length > 0,
      isVideo: false,
    };
  } catch (error) {
    console.error("Lỗi khi kiểm tra URL:", error);
    return {
      isValid: false,
      isVideo: false,
    };
  }
}

export async function removeBackground(imageUrl) {
  try {
    const apiKey = "Kien@123itvn";
    const apiUrl = `https://hoangdev.io.vn/media/removebackground?input_url=${encodeURIComponent(imageUrl)}&apikey=${apiKey}`;
    const response = await axios.get(apiUrl);
    const base64Data = response.data?.data;
    if (!response.data?.success || !base64Data || !base64Data.startsWith("data:image")) {
      return null;
    }
    const base64Raw = base64Data.split(",")[1];
    if (!base64Raw) {
      return null;
    }
    return Buffer.from(base64Raw, "base64");
  } catch {
    return null;
  }
}

async function roundImageCorners(inputPath, outputPath, radiusPercent = 50) {
  const image = sharp(inputPath);
  const { width, height } = await image.metadata();
  const radius = Math.min(width, height) * (radiusPercent / 100);
  const roundedCorners = Buffer.from(
    `<svg><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></svg>`
  );
  await image
    .composite([{ input: roundedCorners, blend: "dest-in" }])
    .png()
    .toFile(outputPath);
}

async function processAndSendSticker(api, message, mediaSource, radius = null) {
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  let pathSticker = path.join(tempDir, `sticker_${Date.now()}.templink`);
  let pathWebp = path.join(tempDir, `sticker_${Date.now()}.webp`);
  let isLocalFile = false;

  try {
    try {
      await fs.promises.access(mediaSource);
      isLocalFile = true;
    } catch {
      isLocalFile = false;
    }

    if (!isLocalFile) {
      const ext = await checkExstentionFileRemote(mediaSource);
      pathSticker = path.join(tempDir, `sticker_${Date.now()}.${ext}`);
      await downloadFile(mediaSource, pathSticker);
    } else {
      pathSticker = mediaSource;
    }

    if (radius !== null) {
      const roundedPath = path.join(tempDir, `rounded_${Date.now()}.png`);
      await roundImageCorners(pathSticker, roundedPath, radius);
      await convertToWebp(roundedPath, pathWebp);
      await deleteFile(roundedPath);
      if (!isLocalFile) {
        await deleteFile(pathSticker);
      }
    } else {
      await convertToWebp(pathSticker, pathWebp);
      if (!isLocalFile) {
        await deleteFile(pathSticker);
      }
    }

    const linkUploadZalo = await api.uploadAttachment([pathWebp], message.threadId, message.type);
    const baseUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
    const finalUrl = `${baseUrl}?createBy=VuXuanKien-Service-Bot`;
    const stickerData = await getVideoMetadata(pathWebp);

    const fullMessage = `${senderName} \nSticker của bạn đây!`;
    const style = MultiMsgStyle([
      MessageStyle(senderName.length + 1, fullMessage.length, COLOR_GREEN, SIZE_16, IS_BOLD)
    ]);

    await api.sendMessage({
      msg: fullMessage,
      quote: message,
      mentions: [MessageMention(senderId, senderName.length, 0)],
      style,
      ttl: 300000,
    }, message.threadId, message.type);

    await api.sendCustomSticker(
      message,
      finalUrl,
      finalUrl,
      stickerData.width,
      stickerData.height
    );

    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý sticker:", error);
    throw error;
  } finally {
    await deleteFile(pathWebp);
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data.quote;
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const isAdminLevelHighest = isAdmin(senderId);
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const tempPath = path.join(tempDir, `sticker_${Date.now()}.png`);

  if (!quote) {
    await api.sendMessage(
      {
        msg: `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker.`,
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
    return;
  }

  const attach = quote.attach;
  if (!attach) {
    await api.sendMessage(
      {
        msg: `${senderName}, Không có đính kèm nào trong nội dung reply của bạn.`,
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
    return;
  }

  try {
    const attachData = JSON.parse(attach);
    const mediaUrl = attachData.hdUrl || attachData.href;

    if (!mediaUrl) {
      await api.sendMessage(
        {
          msg: `${senderName}, Không tìm thấy URL trong đính kèm của tin nhắn bạn đã reply.`,
          quote: message,
          mentions: [MessageMention(senderId, senderName.length, 0)],
          ttl: 30000,
        },
        message.threadId,
        message.type
      );
      return;
    }

    const decodedUrl = decodeURIComponent(mediaUrl.replace(/\\\//g, "/"));
    const mediaCheck = await isValidMediaUrl(decodedUrl);
    
    if (!mediaCheck.isValid) {
      console.error("URL không hợp lệ:", decodedUrl);
      await api.sendMessage(
        {
          msg: `${senderName}, URL trong tin nhắn bạn reply không phải là ảnh, GIF hoặc video hợp lệ.`,
          quote: message,
          mentions: [MessageMention(senderId, senderName.length, 0)],
          ttl: 30000,
        },
        message.threadId,
        message.type
      );
      return;
    }

    const isVideo = mediaCheck.isVideo;
    const isXoaPhong = content.includes("xp");
    const radiusMatch = content.match(/r(\d{1,3})/i);
    const radius = radiusMatch ? parseInt(radiusMatch[1]) : null;

    if (isXoaPhong && isVideo) {
      await api.sendMessage(
        {
          msg: `${senderName} Chưa hỗ trợ xóa phong cho sticker video!`,
          quote: message,
          mentions: [MessageMention(senderId, senderName.length, 0)],
          ttl: 6000,
        },
        message.threadId,
        message.type
      );
      return;
    }

    if (!isAdminLevelHighest && mediaCheck.isVideo) {
      await api.sendMessage(
        {
          msg: `${senderName}, Admin chưa cho phép tạo sticker video.`,
          quote: message,
          mentions: [MessageMention(senderId, senderName.length, 0)],
          ttl: 30000,
        },
        message.threadId,
        message.type
      );
      return;
    }

    await api.sendMessage(
      {
        msg: `${senderName} Ok, đang tạo sticker, chờ bé một chút!`,
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 6000,
      },
      message.threadId,
      message.type
    );

    if (isXoaPhong) {
      const imageData = await removeBackground(decodedUrl);
      if (!imageData) {
        await api.sendMessage(
          {
            msg: `${senderName}, Không thể xóa phông ảnh này.`,
            quote: message,
            mentions: [MessageMention(senderId, senderName.length, 0)],
            ttl: 30000,
          },
          message.threadId,
          message.type
        );
        return;
      }
      fs.writeFileSync(tempPath, imageData);
      await processAndSendSticker(api, message, tempPath, radius);
    } else {
      await processAndSendSticker(api, message, decodedUrl, radius);
    }
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error);
    await api.sendMessage(
      {
        msg: `${senderName} Lỗi Khi Xử Lý Lệnh Sticker -> ${error.message}`,
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  } finally {
    await deleteFile(tempPath);
  }
}

export { processAndSendSticker };
