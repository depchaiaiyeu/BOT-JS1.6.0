import axios from "axios";
import path from "path";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { downloadFile, deleteFile } from "../../../utils/util.js";
import { capitalizeEachWord, removeMention } from "../../../utils/format-util.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { tempDir } from "../../../utils/io-json.js";

import { MessageMention } from "../../../api-zalo/index.js";

export const getDataDownloadVideo = async (url) => {
  let attempts = 0;
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get("https://api.zeidteam.xyz/media-downloader/atd2", {
        params: { url },
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.data && !response.data.error) {
        return response.data;
      }
    } catch (error) {
    }
    attempts++;
    if (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
  return null;
};

export async function processAndSendMedia(api, message, mediaData) {
  const {
    selectedMedia,
    mediaType,
    uniqueId,
    duration,
    title,
    author,
    senderId,
    senderName
  } = mediaData;

  const quality = selectedMedia.quality || "default";
  const typeFile = selectedMedia.type.toLowerCase();

  if ((mediaType === "youtube" || mediaType === "instagram") && duration > 3600000) {
    const object = {
      caption: "Vì tài nguyên có hạn, Không thể lấy video có độ dài hơn 60 phút!\nVui lòng chọn video khác.",
    };
    return await sendMessageWarningRequest(api, message, object, 30000);
  }

  const cachedMedia = await getCachedMedia(mediaType, uniqueId, quality, title);
  let videoUrl;

  if (cachedMedia) {
    videoUrl = cachedMedia.fileUrl;
  } else {
    videoUrl = await categoryDownload(api, message, mediaType, uniqueId, selectedMedia, quality);
    if (!videoUrl) {
      const object = {
        caption: `Không tải được dữ liệu...`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }
    setCacheData(mediaType, uniqueId, { fileUrl: videoUrl, title: title, duration }, quality);
  }
  if (typeFile === "video") {
    await api.sendVideo({
      videoUrl: videoUrl,
      threadId: message.threadId,
      threadType: message.type,
      thumbnail: selectedMedia.thumbnail,
      message: {
        text:
          `[ ${senderName} ]\n` +
          `🎥 Nền Tảng: ${capitalizeEachWord(mediaType)}\n` +
          `🎬 Tiêu Đề: ${title}\n` +
          `${author && author !== "Unknown Author" ? `👤 Người Đăng: ${author}\n` : ""}` +
          `📊 Chất lượng: ${quality}`,
        mentions: [MessageMention(senderId, senderName.length, 2, false)],
      },
      ttl: 3600000,
    });
  }
}

export async function handleDownloadCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();

  try {
    const query = content.replace(`${prefix}${aliasCommand}`, "").trim();

    if (!query) {
      const object = {
        caption: `Vui lòng nhập link cần tải\nVí dụ:\n${prefix}${aliasCommand} <link>`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let dataDownload = await getDataDownloadVideo(query);
    if (!dataDownload || dataDownload.error) {
      const object = {
        caption: `Link Không hợp lệ hoặc Không hỗ trợ tải dữ liệu link dạng này.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }
    const dataLink = [];
    let uniqueId = dataDownload.id || query.split("/").pop() || dataDownload.title.replace(/[^a-zA-Z0-9]/g, "_");

    dataDownload.medias.forEach((item) => {
      if (item.type.toLowerCase() !== "audio") {
        dataLink.push({
          url: item.url,
          quality: item.quality || "unknown",
          type: item.type.toLowerCase(),
          title: dataDownload.title,
          thumbnail: dataDownload.thumbnail,
          extension: item.extension,
        });
      }
    });

    if (dataLink.length === 0) {
      const object = {
        caption: `Không tìm thấy dữ liệu tải về phù hợp cho link này!\nVui lòng thử lại với link khác.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const onlyImages = dataLink.every(item => item.type.toLowerCase() === "image");
    const mediaType = dataDownload.source;
    const title = dataDownload.title;
    const author = dataDownload.author || "Unknown Author";
    const duration = dataDownload.duration || 0;
    
    if (onlyImages) {
      if (dataLink.length === 1) {
        const media = dataLink[0];
        const uniqueFileName = `${uniqueId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${media.extension}`;
        const filePath = path.resolve(tempDir, uniqueFileName);
        await downloadFile(media.url, filePath);

        const caption =
          `[ ${senderName} ]\n` +
          `🎥 Nền Tảng: ${capitalizeEachWord(mediaType)}\n` +
          `🎬 Tiêu Đề: ${title}\n` +
          `${author !== "Unknown Author" ? `👤 Người Đăng: ${author}\n` : ""}` +
          `📊 Chất Lượng: Ảnh`;

        await api.sendMessage({
          msg: caption,
          attachments: [filePath],
          mentions: [MessageMention(senderId, senderName.length, 2, false)],
          ttl: 6000000,
        }, message.threadId, message.type);

        await clearImagePath(filePath);
      } else {
        const specialCaption = `Đây là nội dung từ link bạn gửi!\n` +
          `🎬 Tiêu Đề: ${title}\n` +
          `${author !== "Unknown Author" ? `👤 Người Đăng: ${author}\n` : ""}` +
          `📽️ Nền Tảng: ${capitalizeEachWord(mediaType)}\n` +
          `📊 Chất Lượng: Ảnh`;

        await api.sendMessage({
          msg: specialCaption,
          ttl: 6000000,
        }, message.threadId, message.type);

        const attachmentPaths = [];
    
        for (const media of dataLink) {
          const uniqueFileName = `${uniqueId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${media.extension}`;
          const filePath = path.resolve(tempDir, uniqueFileName);
          await downloadFile(media.url, filePath);
          attachmentPaths.push(filePath);
        }
    
        await api.sendMessage({
          attachments: attachmentPaths,
          ttl: 6000000,
        }, message.threadId, message.type);
    
        for (const filePath of attachmentPaths) {
          await clearImagePath(filePath);
        }
      }
    
      return;
    } else {
      const videos = dataLink.filter(item => item.type.toLowerCase() === "video");
      if (videos.length === 0) {
        return;
      }

      const sortedVideos = videos.sort((a, b) => {
        const qa = parseInt((a.quality || "0").replace(/[^0-9]/g, ""));
        const qb = parseInt((b.quality || "0").replace(/[^0-9]/g, ""));
        return qb - qa;
      });

      const selectedMedia = sortedVideos[0];

      await processAndSendMedia(api, message, {
        selectedMedia,
        mediaType,
        uniqueId,
        duration,
        title,
        author,
        senderId,
        senderName,
      });
    }
  } catch (error) {
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lệnh load data download.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

export async function categoryDownload(api, message, platform, uniqueId, selectedMedia, quality) {
  let tempFilePath;
  try {
    tempFilePath = path.join(tempDir, `${platform}_${Date.now()}.${selectedMedia.extension}`);
    await downloadFile(selectedMedia.url, tempFilePath);
    const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
    const videoUrl = uploadResult[0].fileUrl;
    await deleteFile(tempFilePath);
    return videoUrl;
  } catch (error) {
    await deleteFile(tempFilePath);
    return null;
  }
}
