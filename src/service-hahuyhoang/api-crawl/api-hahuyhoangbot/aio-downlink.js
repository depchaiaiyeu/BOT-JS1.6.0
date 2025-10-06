import axios from "axios";
import path from "path";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { downloadFile, deleteFile } from "../../../utils/util.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { capitalizeEachWord, removeMention } from "../../../utils/format-util.js";
import { setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { tempDir } from "../../../utils/io-json.js";
import { getBotId } from "../../../index.js";

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
    case "audio":
      return "nhạc";
    case "image":
      return "ảnh";
    default:
      return "tập tin";
  }
}

const downloadSelectionsMap = new Map();
const TIME_WAIT_SELECTION = 30000;

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

let hasImageBefore = false;

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

  const introText = `Dưới đây là nội dung từ link của Bạn !\nTitle: ${title}\nAuthor: ${author || 'Unknown'}\nPlatform: ${capitalizeEachWord(mediaType)}`;

  if (typeFile === "image") {
    const thumbnailPath = path.resolve(tempDir, `${uniqueId}.${selectedMedia.extension}`);
    const thumbnailUrl = selectedMedia.url;

    if (thumbnailUrl) {
      await downloadFile(thumbnailUrl, thumbnailPath);
    }

    const fullMessage = `${introText}\n\n👤 Author: ${author}\n🖼️ Caption: ${title}`;
    const style = MultiMsgStyle([
      MessageStyle(0, introText.length, COLOR_GREEN, SIZE_16, IS_BOLD),
    ]);

    await api.sendMessage({
      msg: fullMessage,
      attachments: [thumbnailPath],
      mentions: [MessageMention(senderId, senderName.length, 2, false)],
      style: style,
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
  if (typeFile === "audio") {
    const mediaTypeString = capitalizeEachWord(mediaType);
  
    if (!videoUrl) {
      console.error("Lỗi: voiceUrl bị undefined hoặc null.");
      return;
    }

    const style = MultiMsgStyle([
      MessageStyle(0, introText.length, COLOR_GREEN, SIZE_16, IS_BOLD),
    ]);

    await api.sendMessage({
      msg: introText,
      style: style,
    }, message.threadId, message.type);
  
    const object = {
      trackId: uniqueId || "unknown",
      title: title || "Không rõ",
      artists: author || "Unknown Artist",
      source: mediaTypeString || "Unknown Source",
      caption: `> From ${mediaTypeString} <\nNhạc đây người đẹp ơi !!!\n\n🎵 Music: ${title}`,
      imageUrl: selectedMedia.thumbnail,
      voiceUrl: videoUrl,
    };
  
    await sendVoiceMusic(api, message, object, 180000000);  
  
  } else if (typeFile === "video") {
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
      dataLink.push({
        url: item.url,
        quality: item.quality || "unknown",
        type: item.type.toLowerCase(),
        title: dataDownload.title,
        thumbnail: dataDownload.thumbnail,
        extension: item.extension,
      });
    });

    if (dataLink.length === 0) {
      const object = {
        caption: `Không tìm thấy dữ liệu tải về phù hợp cho link này!\nVui lòng thử lại với link khác.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const onlyImagesAndAudios = dataLink.every(item => {
      const type = item.type.toLowerCase();
      return type === "image" || type === "audio";
    });
    
    if (onlyImagesAndAudios) {
      const attachmentPaths = [];
      const nonImageMedia = [];
    
      for (const media of dataLink) {
        if (media.type === "image") {
          const uniqueFileName = `${uniqueId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${media.extension}`;
          const filePath = path.resolve(tempDir, uniqueFileName);
          await downloadFile(media.url, filePath);
          attachmentPaths.push(filePath);
        } else {
          nonImageMedia.push(media);
        }
      }
    
      if (Array.isArray(attachmentPaths) && attachmentPaths.length > 0) {
        hasImageBefore = true;
    
        const replyText = `Dưới đây là nội dung từ link của Bạn !\nTitle: ${dataDownload.title}\nAuthor: ${dataDownload.author || 'Unknown'}\nPlatform: ${capitalizeEachWord(dataDownload.source)}`;
        const fullMessage = `${replyText}`;
        const style = MultiMsgStyle([
          MessageStyle(0, fullMessage.length, COLOR_GREEN, SIZE_16, IS_BOLD),
        ]);
    
        await api.sendMessage(
          {
            msg: fullMessage,
            attachments: attachmentPaths,
            style: style,
            ttl: 6000000,
          },
          message.threadId,
          message.type
        );
    
        for (const filePath of attachmentPaths) {
          await clearImagePath(filePath);
        }
      }
    
      for (const media of nonImageMedia) {
        await processAndSendMedia(api, message, {
          selectedMedia: media,
          mediaType: dataDownload.source,
          uniqueId,
          duration: dataDownload.duration,
          title: dataDownload.title,
          author: dataDownload.author,
          senderId,
          senderName,
        });
      }
    
      return;
    }
    
    let listText = `Đây là danh sách các phiên bản có sẵn:\n`;
    listText += `Hãy trả lời tin nhắn này với số thứ tự phiên bản bạn muốn tải!\n\n`;
    listText += dataLink
      .map((item, index) => `${index + 1}. ${capitalizeEachWord(item.type)} - ${item.quality || "Unknown"} (${item.extension})`)
      .join("\n");

    const object = {
      caption: listText,
    };

    const listMessage = await sendMessageCompleteRequest(api, message, object, TIME_WAIT_SELECTION);
    const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;
    downloadSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: dataLink,
      uniqueId: uniqueId,
      mediaType: dataDownload.source,
      title: dataDownload.title,
      duration: dataDownload.duration || 0,
      author: dataDownload.author || "Unknown Author",
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: dataLink,
      uniqueId: uniqueId,
      mediaType: dataDownload.source,
      title: dataDownload.title,
      duration: dataDownload.duration || 0,
      author: dataDownload.author || "Unknown Author",
      timestamp: Date.now(),
      platform: "downlink",
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

export async function handleDownloadReply(api, message) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const idBot = getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!downloadSelectionsMap.has(quotedMsgId)) return false;

    const downloadData = downloadSelectionsMap.get(quotedMsgId);
    if (downloadData.userRequest !== senderId) return false;

    const content = removeMention(message).trim().toLowerCase();
    let { collection, uniqueId, mediaType, title, duration = 0, author } =
      downloadSelectionsMap.get(quotedMsgId);

    if (content === "all") {
      const attachmentPaths = [];
      const nonImageMedia = [];

      for (const media of collection) {
        if (media.type === "image") {
          const uniqueFileName = `${uniqueId}_${Date.now()}_${Math.random()
            .toString(36)
            .substring(7)}.${media.extension}`;

          const thumbnailPath = path.resolve(tempDir, uniqueFileName);
          const thumbnailUrl = media.url;
          if (thumbnailUrl) {
            await downloadFile(thumbnailUrl, thumbnailPath);
            attachmentPaths.push(thumbnailPath);
          }
        } else {
          nonImageMedia.push(media);
        }
      }

      if (Array.isArray(attachmentPaths) && attachmentPaths.length > 0) {
        hasImageBefore = true;
        const replyText = `Dưới đây là nội dung từ link của Bạn !\nTitle: ${title}\nAuthor: ${author || 'Unknown'}\nPlatform: ${capitalizeEachWord(mediaType)}`;
        const fullMessage = `${replyText}`;
        const style = MultiMsgStyle([
          MessageStyle(0, fullMessage.length, COLOR_GREEN, SIZE_16, IS_BOLD),
        ]);
      
        await api.sendMessage(
          {
            msg: fullMessage,
            attachments: attachmentPaths,
            style: style,
            ttl: 6000000
          },
          message.threadId,
          message.type
        );
      
        for (const filePath of attachmentPaths) {
          await clearImagePath(filePath);
        }
      }

      for (const media of nonImageMedia) {
        await processAndSendMedia(api, message, {
          selectedMedia: media,
          mediaType,
          uniqueId,
          duration,
          title,
          author,
          senderId,
          senderName,
        });
      }

      const msgDel = {
        type: message.type,
        threadId: message.threadId,
        data: {
          cliMsgId: message.data.quote.cliMsgId,
          msgId: message.data.quote.globalMsgId,
          uidFrom: idBot,
        },
      };
      await api.deleteMessage(msgDel, false);
      downloadSelectionsMap.delete(quotedMsgId);
      return true;
    }

    const selectedIndex = parseInt(content) - 1;
    if (
      isNaN(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= collection.length
    ) {
      const object = {
        caption: `Lựa chọn Không hợp lệ. Vui lòng chọn một số từ danh sách hoặc nhập "all" để tải tất cả.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const msgDel = {
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: message.data.quote.cliMsgId,
        msgId: message.data.quote.globalMsgId,
        uidFrom: idBot,
      },
    };
    await api.deleteMessage(msgDel, false);
    downloadSelectionsMap.delete(quotedMsgId);

    await processAndSendMedia(api, message, {
      selectedMedia: collection[selectedIndex],
      mediaType,
      uniqueId,
      duration,
      title,
      author,
      senderId,
      senderName,
    });

    return true;
  } catch (error) {
    console.error("Lỗi xử lý reply download:", error);

    const object = {
      caption: `Đã xảy ra lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);

    return true;
  }
}
