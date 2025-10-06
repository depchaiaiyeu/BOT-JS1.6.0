import axios from "axios";
import path from "path";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { downloadFile, deleteFile } from "../../../utils/util.js";
import { capitalizeEachWord, removeMention } from "../../../utils/format-util.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { tempDir } from "../../../utils/io-json.js";

import { MultiMsgStyle, MessageStyle, MessageMention } from "../../../api-zalo/index.js";
export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_PINK = "FF1493";
export const COLOR_GREEN = "15a85f";
export const SIZE_16 = "14";
export const IS_BOLD = true;

const typeText = (type) => {
  switch (type) {
    case "video":
      return "video";
    case "image":
      return "ảnh";
    default:
      return "tập tin";
  }
}

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
      console.error("Lỗi khi tải data:", error);
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

  const introText = `Đây là nội dung từ link bạn gửi!\nTitle: ${title}\nAuthor: ${author || 'Unknown'}\nPlatform: ${capitalizeEachWord(mediaType)}`;
  const style = MultiMsgStyle([
    MessageStyle(0, introText.length, COLOR_GREEN, SIZE_16, IS_BOLD),
  ]);

  await api.sendMessage({
    msg: introText,
    style: style,
  }, message.threadId, message.type);

  if (typeFile === "image") {
    const thumbnailPath = path.resolve(tempDir, `${uniqueId}.${selectedMedia.extension}`);
    const thumbnailUrl = selectedMedia.url;

    if (thumbnailUrl) {
      await downloadFile(thumbnailUrl, thumbnailPath);
    }

    await api.sendMessage({
      msg: "",
      attachments: [thumbnailPath],
      ttl: 6000000,
    }, message.threadId, message.type);

    if (thumbnailUrl) {
      await clearImagePath(thumbnailPath);
    }
    return;
  }

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
    const object = {
      caption: `Chờ bé lấy ${typeText(typeFile)} một chút, xong bé gọi cho hay.\n\n⏳ ${title}\n📊 Chất lượng: ${quality}`,
    };
    await sendMessageProcessingRequest(api, message, object, 8000);

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
        text: "",
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
      const itemType = item.type.toLowerCase();
      if (itemType !== "audio") {
        dataLink.push({
          url: item.url,
          quality: item.quality || "unknown",
          type: itemType,
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

    const onlyImages = dataLink.every(item => item.type === "image");

    if (onlyImages) {
      const attachmentPaths = [];

      for (const media of dataLink) {
        const uniqueFileName = `${uniqueId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${media.extension}`;
        const filePath = path.resolve(tempDir, uniqueFileName);
        await downloadFile(media.url, filePath);
        attachmentPaths.push(filePath);
      }

      if (Array.isArray(attachmentPaths) && attachmentPaths.length > 0) {
        const introText = `Đây là nội dung từ link bạn gửi!\nTitle: ${dataDownload.title}\nAuthor: ${dataDownload.author || 'Unknown'}\nPlatform: ${capitalizeEachWord(dataDownload.source)}`;
        const style = MultiMsgStyle([
          MessageStyle(0, introText.length, COLOR_GREEN, SIZE_16, IS_BOLD),
        ]);

        await api.sendMessage({
          msg: introText,
          style: style,
        }, message.threadId, message.type);

        await api.sendMessage(
          {
            msg: "",
            attachments: attachmentPaths,
            ttl: 6000000,
          },
          message.threadId,
          message.type
        );

        for (const filePath of attachmentPaths) {
          await clearImagePath(filePath);
        }
      }

      return;
    }

    await processAndSendMedia(api, message, {
      selectedMedia: dataLink[0],
      mediaType: dataDownload.source,
      uniqueId,
      duration: dataDownload.duration,
      title: dataDownload.title,
      author: dataDownload.author,
      senderId,
      senderName,
    });

  } catch (error) {
    console.error("Lỗi khi xử lý lệnh download:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lệnh load data download.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

export async function categoryDownload(api, message, platform, uniqueId, selectedMedia, quality) {
  let tempFilePath;
  try {
    const qualityVideo = quality;
    tempFilePath = path.join(tempDir, `${platform}_${Date.now()}.${selectedMedia.extension}`);
    await downloadFile(selectedMedia.url, tempFilePath);
    const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
    const videoUrl = uploadResult[0].fileUrl;
    await deleteFile(tempFilePath);
    return videoUrl;
  } catch (error) {
    await deleteFile(tempFilePath);
    console.error("Lỗi khi tải video:", error);
    return null;
  }
}
