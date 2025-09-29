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
import { downloadYoutubeVideo, extractYoutubeId, getVideoFormatByQuality } from "../youtube/youtube-service.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { tempDir } from "../../../utils/io-json.js";
import { getBotId } from "../../../index.js";

const { execSync, exec } = await import("child_process");
import { MultiMsgStyle, MessageStyle, MessageMention } from "../../../api-zalo/index.js";
export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_PINK = "FF1493";
export const COLOR_GREEN = "15a85f";
export const SIZE_16 = "14";
export const IS_BOLD = true;

export const API_KEY_HUNGDEV = "Kien@123itvn"; // tự thay
export const API_URL_DOWNAIO_HUNGDEV = "https://hoangdev.io.vn/aio/aio-download"; // tự thay

const MEDIA_TYPES = {
  "tiktok.com": "tiktok",
  "douyin.com": "douyin",
  "capcut.com": "capcut",
  "threads.net": "threads",
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "espn.com": "espn",
  "kuaishou.com": "kuaishou",
  "pinterest.com": "pinterest",
  "imdb.com": "imdb",
  "imgur.com": "imgur",
  "ifunny.co": "ifunny",
  "izlesene.com": "izlesene",
  "reddit.com": "reddit",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "twitter.com": "X",
  "x.com": "X",
  "vimeo.com": "vimeo",
  "snapchat.com": "snapchat",
  "bilibili.com": "bilibili",
  "dailymotion.com": "dailymotion",
  "sharechat.com": "sharechat",
  "linkedin.com": "linkedin",
  "tumblr.com": "tumblr",
  "hipi.co.in": "hipi",
  "t.me": "telegram",
  "getstickerpack.com": "getstickerpack",
  "bitchute.com": "bitchute",
  "febspot.com": "febspot",
  "9gag.com": "9gag",
  "ok.ru": "ok",
  "rumble.com": "rumble",
  "streamable.com": "streamable",
  "ted.com": "ted",
  "tv.sohu.com": "sohutv",
  "xvideos.com": "xvideos",
  "xnxx.com": "xnxx",
  "xiaohongshu.com": "xiaohongshu",
  "weibo.com": "weibo",
  "miaopai.com": "miaopai",
  "meipai.com": "meipai",
  "xiaoying.tv": "xiaoying",
  "national.video": "national",
  "yingke.com": "yingke",
  "soundcloud.com": "soundcloud",
  "mixcloud.com": "mixcloud",
  "spotify.com": "spotify",
  "zingmp3.vn": "zingmp3",
  "bandcamp.com": "bandcamp",
};

const getMediaType = (url) => {
  const urlLower = url.toLowerCase();
  return Object.entries(MEDIA_TYPES).find(([domain]) => urlLower.includes(domain))?.[1] || "Unknown";
};

const extractFacebookId = (url) => {
  let uniqueId;
  if (url.includes("/v/")) uniqueId = url.split("/v/")[1];
  if (url.includes("/r/")) uniqueId = url.split("/r/")[1];
  if (uniqueId) uniqueId = uniqueId.replace("/", '');
  if (!uniqueId) uniqueId = url;
  return uniqueId;
};

export const getDurationVideo = async (path) => {
  const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path}"`;
  const duration = parseFloat(execSync(durationCmd).toString()) * 1000;
  return duration;
};

export const getDataDownloadVideo = async (url) => {
  try {
    const response = await axios.get(`${API_URL_DOWNAIO_HUNGDEV}?url=${encodeURIComponent(url)}&apikey=${API_KEY_HUNGDEV}`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.data && response.data.data) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi tải video:", error);
    return null;
  }
};


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

  if (typeFile === "image") {
    const thumbnailPath = path.resolve(tempDir, `${uniqueId}.${selectedMedia.extension}`);
    const thumbnailUrl = selectedMedia.url;

    if (thumbnailUrl) {
      await downloadFile(thumbnailUrl, thumbnailPath);
    }

    await api.sendMessage({
      msg: `[ ${senderName} ]\n> From ${mediaType} <\n\n👤 Author: ${author}\n🖼️ Caption: ${title}`,
      attachments: [thumbnailPath],
      mentions: [MessageMention(senderId, senderName.length, 2, false)],
    }, message.threadId, message.type);

    if (thumbnailUrl) {
      await clearImagePath(thumbnailPath);
    }
    return;
  }


  if ((mediaType === "youtube" || mediaType === "instagram") && duration) {
    if (duration * 1000 > 60 * 60 * 1000) {
      const object = {
        caption: "Vì tài nguyên có hạn, Không thể lấy video có độ dài hơn 60 phút!\nVui lòng chọn video khác.",
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }
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
  }
  if (typeFile === "audio") {
    const mediaTypeString = capitalizeEachWord(mediaType);
  
    if (!videoUrl) {
      console.error("Lỗi: voiceUrl bị undefined hoặc null.");
      return;
    }
  
    const object = {
      trackId: uniqueId || "unknown",
      title: title || "Không rõ",
      artists: author || "Unknown Artist",
      source: mediaTypeString || "Unknown Source",
      caption: hasImageBefore ? "" : `> From ${mediaTypeString} <\nNhạc đây người đẹp ơi !!!\n\n🎵 Music: ${title}`,
      imageUrl: hasImageBefore ? "" : selectedMedia.thumbnail,
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

    const mediaType = getMediaType(query);
    let dataDownload = await getDataDownloadVideo(query);
    if (!dataDownload || dataDownload.error) {
      const object = {
        caption: `Link Không hợp lệ hoặc Không hỗ trợ tải dữ liệu link dạng này.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }
    const dataLink = [];
    let uniqueId;

    switch (mediaType) {
      case "tiktok":
        uniqueId = dataDownload.extraInfo?.id || dataDownload.title;
      
        dataDownload.medias.slice().reverse().forEach((item) => {
          dataLink.push({
            url: item.url,
            quality: item.quality || item.label || "unknown",
            type: item.type,
            title: dataDownload.title,
            thumbnail: dataDownload.thumbnail,
            extension: item.ext || item.extension,
          });
        });
        break;
      case "douyin":
        uniqueId = dataDownload.title.replace(/#\w+/g, (match) => match.toLowerCase());
        dataDownload.medias.forEach((item) => {
          if (item.quality.toLowerCase() === "no watermark") {
            dataLink.push({
              url: item.url,
              quality: item.quality,
              type: item.type,
              title: dataDownload.title,
              thumbnail: item.thumbnail || dataDownload.thumbnail,
              extension: item.extension,
            });
          }
        });
        break;
      case "youtube":
        uniqueId = extractYoutubeId(dataDownload.url);
        const dataYoutube = [
          {
            url: dataDownload.url,
            quality: "360p",
            type: "video",
            extension: "mp4",
          },
          {
            url: dataDownload.url,
            quality: "720p",
            type: "video",
            extension: "mp4",
          },
          {
            url: dataDownload.url,
            quality: "1080p",
            type: "video",
            extension: "mp4",
          },
          {
            url: dataDownload.url,
            quality: "max",
            type: "video",
            extension: "mp4",
          },
          {
            url: dataDownload.url,
            quality: "audio",
            type: "audio",
            extension: "mp3",
          },
        ];
        dataYoutube.forEach((item) => {
          dataLink.push({
            url: item.url,
            quality: item.quality,
            type: item.type,
            title: dataDownload.title,
            thumbnail: item.thumbnail || dataDownload.thumbnail,
            extension: item.extension,
          });
        });
        break;
      case "facebook":
        uniqueId = extractFacebookId(dataDownload.url);
        dataDownload.medias.forEach((item) => {
          if (item.quality.toLowerCase() === "hd") {
            dataLink.push({
              url: item.url,
              quality: item.quality,
              type: item.type,
              title: dataDownload.title,
              thumbnail: item.thumbnail || dataDownload.thumbnail,
              extension: item.extension,
            });
          }
        });
        break;
      case "threads":
        uniqueId = dataDownload.author + dataDownload.title;
        dataDownload.medias.forEach((item) => {
          if (item.type.toLowerCase() !== "image") {
            dataLink.push({
              url: item.url,
              quality: item.quality,
              type: item.type,
              title: dataDownload.title,
              thumbnail: item.thumbnail || item.url,
              extension: item.extension,
            });
          }
        });
        break;
      case "instagram":
        uniqueId = dataDownload.url;
        dataDownload.medias.forEach((item) => {
          dataLink.push({
            url: item.url,
            quality: item.quality,
            type: item.type,
            title: dataDownload.title,
            thumbnail: item.thumbnail || dataDownload.thumbnail,
            extension: item.extension,
          });
        });
        break;
      case "spotify":
      case "telegram":
      case "X":
      case "dailymotion":
        uniqueId = dataDownload.url.split("/").pop();
        dataDownload.medias.forEach((item) => {
          dataLink.push({
            url: item.url,
            quality: item.quality,
            type: item.type,
            title: dataDownload.title,
            thumbnail: item.thumbnail || dataDownload.thumbnail,
            extension: item.extension,
          });
        });
        break;
      default:
        const object = {
          caption: `Link này em chưa hỗ trợ tải dữ liệu.`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return;
    }

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
        if (media.type.toLowerCase() === "image") {
          const uniqueFileName = `${uniqueId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${media.extension}`;
          const filePath = path.resolve(tempDir, uniqueFileName);
          await downloadFile(media.url, filePath);
          attachmentPaths.push(filePath);
        } else {
          nonImageMedia.push(media); // audio
        }
      }
    
      if (Array.isArray(attachmentPaths) && attachmentPaths.length > 0) {
        hasImageBefore = true;
    
        const replyText = "Dưới đây là nội dung từ link của Bạn !";
        const fullMessage = `${replyText}`;
        const style = MultiMsgStyle([
          MessageStyle(0, replyText.length, COLOR_GREEN, SIZE_16, IS_BOLD),
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
          mediaType,
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
      .map((item, index) => `${index + 1}. ${item.type} - ${item.quality || "Unknown"} (${item.extension})`)
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
      mediaType: mediaType,
      title: dataDownload.title,
      duration: dataDownload.duration || 0,
      author: dataDownload.author || "Unknown Author",
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: dataLink,
      uniqueId: uniqueId,
      mediaType: mediaType,
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
  let qualityVideo;
  let tempFilePath;
  try {
    switch (platform) {
      case "youtube":
        const { format, qualityText } = getVideoFormatByQuality(quality);
        qualityVideo = qualityText;
        tempFilePath = await downloadYoutubeVideo(selectedMedia.url, uniqueId, format);
        break;
      default:
        qualityVideo = quality;
        tempFilePath = path.join(tempDir, `${platform}_${Date.now()}.${selectedMedia.extension}`);
        if (selectedMedia.extension === 'm3u8') {
          tempFilePath = path.join(tempDir, `${platform}_${Date.now()}.mp4`);
          const ffmpegCmd = `ffmpeg -i "${selectedMedia.url}" -c copy -bsf:a aac_adtstoasc "${tempFilePath}"`;
          await new Promise((resolve, reject) => {
            exec(ffmpegCmd, (error) => {
              if (error) reject(error);
              resolve();
            });
          });
        } else {
          await downloadFile(selectedMedia.url, tempFilePath);
        }
        break;
    }

    const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
    const videoUrl = uploadResult[0].fileUrl;

    const duration = await getDurationVideo(tempFilePath);

    await deleteFile(tempFilePath);

    setCacheData(platform, uniqueId, { fileUrl: videoUrl, title: selectedMedia.title, duration }, qualityVideo);
    return videoUrl;
  } catch (error) {
    await deleteFile(tempFilePath);
    console.error("Lỗi khi tải video:", error);
    return null;
  }
}
 let hasImageBefore = false;
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
        if (Array.isArray(attachmentPaths) && attachmentPaths.length > 0) {
          const replyText = "Dưới đây là nội dung từ link của Bạn !";
          const fullMessage = `${replyText}`;
          const style = MultiMsgStyle([
            MessageStyle(0, replyText.length, COLOR_GREEN, SIZE_16, IS_BOLD),
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
