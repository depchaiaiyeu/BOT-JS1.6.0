import axios from "axios";
import schedule from "node-schedule";
import fs from "fs";
import path from "path";
import { promisify } from 'util';
import { exec } from 'child_process';
import * as cheerio from 'cheerio';

import { getGlobalPrefix } from "../../service.js";
import { MessageMention } from "../../../api-zalo/index.js";
import {
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { deleteFile, downloadAndSaveVideo, downloadFile } from "../../../utils/util.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { API_KEY_HUNGDEV } from "../api-hahuyhoangbot/aio-downlink.js";
import { getDataDownloadOriginal, getDataDownloadVideo, getTiktokRelated, searchTiktok } from "./tiktok-api.js";
import { tempDir } from "../../../utils/io-json.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { getBotId } from "../../../index.js";

const PLATFORM = "tiktok";
const URL_TIKTOK_SEARCH_HUNGDEV = "https://api.hungdev.id.vn/tiktok/search";
const TIME_WAIT_SELECTION = 60000;
const RELATED_EXPIRE_TIME = 180000;
const HISTORY_EXPIRE_TIME = 3600000;

const tiktokSelectionsMap = new Map();
const relatedVideosMap = new Map();

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Encoding': 'identity;q=1, *;q=0',
  'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
  "Cookie": "_ttp=2p0lHkLPkuuzPy4n9kNCgaqVBFM; tt_chain_token=tioPB+Lui7TvHuzUPNaOHg==; passport_csrf_token=3dfb5a52d5a68f4d5c9bba4538577dfe; passport_csrf_token_default=3dfb5a52d5a68f4d5c9bba4538577dfe; odin_tt=0a5b7e2bc3c60961f0e9463f055e859c8ca0059ae611097cd3dd3f4f259a70c0ec1343ec5dfb12f6361658cbac0ad226f69c1b6cba2089e7f174c7f9388708e449330d0c262c38701c9381fc9a679cae; tt_csrf_token=tRUs25Em-weSrPLvFd61dOW1c5-DwHMbLe8s; s_v_web_id=verify_m5acgd9w_JQLaQCy0_pzpQ_43RZ_BC6o_vhFGHinP4BkJ; ak_bmsc=B383BD0641AA3966BA5467E50FF743C7~000000000000000000000000000000~YAAQb/rSFwVwPRWUAQAAt4m1FRogp3ca2+A8RMlIQ3bVPFbQk32wMIqddY1DgYAkQSrPhPOfWeY09XH9dzjEP/JHNDoF6+1dNfEjFHRPX4UJDFn8vLT0S6np7j/Ln3P7MWvpipgWl4Yv2sbPa6WhsVKHincBk25EcDsuCtubK1wbOQhhDuTXz5/1BD33+zDu3UHgFTB4R/QwxQknEurgT7ejJW+ORo8kt7RlyJW8Re4JTaQbi4KQKQAWl6B6g4D0bWTWGNG5mQn7z7x6O2TDr7gqzidqpNaQ7vKBEs9To5+RcCdvLtOY2zh4f0cD9h+Mrdfkw70ZEt2vi8Sq4zwWwPI5N7WqxvMffMr1vIYBb6bg8Kw62daAZXS4/y3GNRhtimAAq+fnZYB0; bm_sv=C410BFCD013A0C5B8520B329617A1E60~YAAQb/rSF3t8PRWUAQAANe+2FRrx1PREwDh+ViFkDQN6KWGFhaqf+srNGuaupb219rQJ6LqNeKq3o7xTExLzyYYZEfZKrBGnxCcnCSVFz2dXens26fDnmkgY83OYLDclwx+oJyhCBUdPq/CayUnzV9LiOgmoBYpHoDaxG8d6bBsFPuJUuQDBKzDLufGHtbAFzaiiF/AALmC7GemblyI734eWFTU/4NBIme2NvBGQSzaEjqtAGsj+mReMGduvAPgKg~1; ttwid=1%7CaIhJLRa4fvQV5lLYGHleEtravH48pseLFrAf8dwU0ik%7C1735531098%7C93b50b3458c149dc9b6c3b6d7684bb03da5e87ae81d41b52ce2e116eb6927ca1; msToken=OOe0-h21TyN659uHZ5rOZxo4MdlgKsxjPdzEowUi26NgWYUSyN49-R3BEdKoII-GndXvAcqHuWRTe4Rma4ZnoqWcqkm3IO_qLXCP_9sLSPrq57_1K9cT8Lw3LAMXtyNfadDjwQRTQzYO2-NnE5vt7VXB9edV",
}

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of tiktokSelectionsMap.entries()) {
    if (currentTime - data.timestamp > TIME_WAIT_SELECTION) {
      tiktokSelectionsMap.delete(msgId);
    }
  }
  for (const [msgId, data] of relatedVideosMap.entries()) {
    if (currentTime - data.timestamp > RELATED_EXPIRE_TIME) {
      relatedVideosMap.delete(msgId);
    }
  }
});

export async function searchVideoTiktok(query) {
  try {
    const response = await axios.get(`${URL_TIKTOK_SEARCH_HUNGDEV}?keyword=${query}&apikey=${API_KEY_HUNGDEV}`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = response.data.data;
    if (data && Array.isArray(data) && data.length > 0) {
      return data;
    }

    return null;
  } catch (error) {
    console.error("Lỗi khi gọi API TikTok:", error);
    return null;
  }
}

export async function sendTikTokVideo(api, message, videoData, isRandom = false, typeVideo = "540p") {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let tempFilePath = null;

  try {
    const uniqueId = videoData.id;
    const description = videoData.desc;
    const cachedVideo = await getCachedMedia(PLATFORM, uniqueId, typeVideo, description);
    let videoUrl;

    if (cachedVideo) {
      videoUrl = cachedVideo.fileUrl;
    } else {
      if (!isRandom) {
        const object = {
          caption: `Chờ bé lấy ${typeVideo === "audio" ? "nhạc" : "video"}`
            + ` một chút, xong bé gọi cho hay!\n📊 Chất lượng: ${typeVideo}`,
        };
        await sendMessageProcessingRequest(api, message, object, 8000);
      }
      if (typeVideo === "audio") {
        tempFilePath = path.join(tempDir, `${uniqueId}_${Date.now()}.mp3`);
        if (videoData.music.url) {
          tempFilePath = await downloadFile(videoData.music.url, tempFilePath);
        } else {
          const data = await getDataDownloadOriginal(null, uniqueId);
          if (data) {
            tempFilePath = await downloadFile(data.music.url, tempFilePath);
          }
        }
      } else {
        try {
          tempFilePath = await downloadVideoTiktok(videoData.video.url);
        } catch (error) {
          const data = await getDataDownloadOriginal(null, uniqueId);
          if (data) {
            tempFilePath = await downloadVideoTiktok(data.video.url);
          }
        }
      }
      const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
      videoUrl = uploadResult[0].fileUrl;
      await deleteFile(tempFilePath);

      setCacheData(PLATFORM, uniqueId, { fileUrl: videoUrl, title: description }, typeVideo);
    }

    if (typeVideo === "audio") {
      const object = {
        trackId: uniqueId,
        title: videoData.music.title,
        artists: videoData.music.author,
        source: "Tiktok",
        caption: `> From Tiktok <\nNhạc Của Bạn Đây!!!`,
        imageUrl: videoData.music.cover,
        voiceUrl: videoUrl,
        listen: videoData.stat.playCount,
        like: videoData.stat.diggCount,
        comment: videoData.stat.commentCount,
      };
      await sendVoiceMusic(api, message, object, 1800000);
    } else {
      const sentMessage = await api.sendVideov2({
        videoUrl,
        threadId: message.threadId,
        threadType: message.type,
        thumbnail: videoData.video.cover,
        message: {
          text:
            `[ ${senderName} ]\n` +
            `Author: [${videoData.author.uniqueId || videoData.author.unique_id}] ${videoData.author.nickname}\n` +
            `Description: ${description}\n` +
            `📊 Chất lượng: ${typeVideo}\n` +
            `💗 Thả tim để xem thông tin author`,
          mentions: [MessageMention(senderId, senderName.length, 2, false)],
        },
        ttl: 3600000,
      });

      relatedVideosMap.set(sentMessage.msgId.toString(), {
        username: videoData.author.uniqueId || videoData.author.unique_id,
        timestamp: Date.now(),
        threadId: message.threadId,
        type: message.type,
        senderId,
        senderName
      });
    }
    return true;
  } catch (error) {
    throw error;
  } finally {
    if (tempFilePath) deleteFile(tempFilePath);
  }
}

export async function getRandomVideoFromArray(api, message, array) {
  const randomIndex = Math.floor(Math.random() * array.length);
  const randomVideo = array[randomIndex];

  const description = randomVideo.desc;
  const cachedVideo = await getCachedMedia(PLATFORM, description, "540p", description);
  let videoUrl;
  let tempFilePath = null;

  if (cachedVideo) {
    videoUrl = cachedVideo.fileUrl;
  } else {
    try {
      tempFilePath = await downloadAndSaveVideo(randomVideo.video.url);
      const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
      videoUrl = uploadResult[0].fileUrl;
      setCacheData(PLATFORM, description, { fileUrl: videoUrl }, "540p", description);
    } catch (error) {
      throw error;
    } finally {
      deleteFile(tempFilePath);
    }
  }

  return videoUrl;
}

const extractTikTokUrl = (text) => {
  const tiktokRegex = /https?:\/\/((?:vm|vt|www)\.)?tiktok\.com\/[^\s]+/i;
  const match = text.match(tiktokRegex);
  return match ? match[0] : null;
};

export async function handleTikTokCommand(api, message, command) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();
  let imagePath = null;

  try {
    const keyword = content.replace(`${prefix}${command}`, "").trim();

    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm hoặc link tiktok\nVí dụ:\n${prefix}${command} nội dung cần tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const [query, typeVideo = "normal"] = keyword.split(" ");

    const tiktokUrl = extractTikTokUrl(query);
    if (tiktokUrl || query.startsWith("https://vt.tiktok.com") || query.startsWith("https://tiktok.com")) {
      const videoData = await getDataDownloadVideo(tiktokUrl || query);
      if (videoData) {
        if (typeVideo === "audio") {
          await sendTikTokVideo(api, message, videoData, false, "audio");
        } else {
          await sendTikTokVideo(api, message, videoData, false, videoData.video.quality);
        }
      } else {
        const object = {
          caption: `Không thể tải video từ link này. Vui lòng kiểm tra lại link hoặc thử link khác.`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
      }
      return;
    }

    const videos = await searchTiktok(keyword);

    if (videos && videos.length > 0) {
      let videoListText = "Đây là danh sách video tôi tìm thấy:\n";
      videoListText += `Hãy trả lời tin nhắn này với số thứ tự video bạn muốn xem!`
      videoListText += `\nVD: 1 hoặc 1 audio`;

      imagePath = await createSearchResultImage(videos.map(video => ({
        title: video.desc || "No description",
        artistsNames: `${video.author.nickname} (@${video.author.uniqueId || video.author.unique_id})`,
        thumbnailM: video.video.cover,
        listen: video.stat.playCount || 0,
        like: video.stat.diggCount || 0,
        comment: video.stat.commentCount || 0
      })));

      const object = {
        caption: videoListText,
        imagePath: imagePath,
      };
      const listMessage = await sendMessageCompleteRequest(api, message, object, TIME_WAIT_SELECTION);

      const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

      tiktokSelectionsMap.set(quotedMsgId.toString(), {
        userRequest: senderId,
        collection: videos,
        timestamp: Date.now(),
      });
      setSelectionsMapData(senderId, {
        quotedMsgId: quotedMsgId.toString(),
        collection: videos,
        timestamp: Date.now(),
        platform: PLATFORM,
      });
    } else {
      const object = {
        caption: `Không tìm được video phù hợp.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
    }
  } catch (error) {
    console.error("Lỗi khi xử lý tìm kiếm TikTok:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi tìm kiếm video TikTok, vui lòng thử lại sau.`
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleTikTokReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!tiktokSelectionsMap.has(quotedMsgId)) return false;

    const videoData = tiktokSelectionsMap.get(quotedMsgId);
    if (videoData.userRequest !== senderId) return false;

    const content = removeMention(message);
    const [selection, typeVideo = "normal"] = content.trim().split(" ");

    const selectedIndex = parseInt(selection) - 1;
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= videoData.collection.length) {
      const object = {
        caption: `Lựa chọn Không hợp lệ. Vui lòng chọn một số từ danh sách.`,
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
    tiktokSelectionsMap.delete(quotedMsgId);

    const selectedVideo = videoData.collection[selectedIndex];
    let qualityType = "540p";
    switch (typeVideo.toLowerCase()) {
      case "audio":
        qualityType = "audio";
        break;
      default:
        qualityType = selectedVideo.video.quality;
    }
    await sendTikTokVideo(api, message, selectedVideo, false, qualityType);
    return true;
  } catch (error) {
    console.error("Lỗi xử lý reply TikTok:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

export async function downloadVideoTiktok(videoUrl) {
  const videoResponse = await axios.get(videoUrl, {
    headers: {
      ...headers,
    },
    responseType: "arraybuffer",
    maxRedirects: 5
  });

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const tempFilePath = path.join(tempDir, `tiktok_${Date.now()}.mp4`);
  fs.writeFileSync(tempFilePath, videoResponse.data);

  return tempFilePath;
}

export async function handleTikTokReaction(api, reaction) {
  let tempImagePath = null;
  try {
    const msgId = reaction.data.content.rMsg[0].gMsgID.toString();
    if (!relatedVideosMap.has(msgId)) return false;

    const relatedData = relatedVideosMap.get(msgId);
    const senderId = reaction.data.uidFrom;
    if (senderId !== relatedData.senderId) return false;

    const rType = reaction.data.content.rType;
    if (rType !== 5) return false;
    relatedVideosMap.delete(msgId);
    const { username, threadId, type, senderId: senderIdOriginal, senderName: senderNameOriginal } = relatedData;

    const url = `https://www.tiktok.com/@${username}`;
    const response = await axios.get(url, { headers });
    if (response.status !== 200) {
      await api.sendMessage({
        body: "Không thể lấy thông tin từ username được cung cấp.",
        threadId,
        threadType: type
      });
      return true;
    }

    const $ = cheerio.load(response.data);
    let userData = null;
    $('script').each((i, elem) => {
      const content = $(elem).html();
      if (content && content.includes('webapp.user-detail')) {
        try {
          const match = content.match(/"webapp.user-detail":(\{.*?\}),/);
          if (match) {
            const jsonStr = match[1];
            const parsed = JSON.parse(jsonStr);
            userData = parsed.userInfo?.user;
          }
        } catch (e) {}
      }
    });

    if (!userData) {
      await api.sendMessage({
        body: "Không thể lấy thông tin người dùng.",
        threadId,
        threadType: type
      });
      return true;
    }

    const settings = {
      commentSetting: ['Everyone', 'Friends', 'No one'][userData.commentSetting || 0],
      duetSetting: ['Everyone', 'Friends', 'No one'][userData.duetSetting || 0],
      stitchSetting: ['Everyone', 'Friends', 'No one'][userData.stitchSetting || 0],
    };

    let caption = `[ ${senderNameOriginal} ]\n`;
    caption += `Nickname: ${userData.nickname || 'N/A'}\n`;
    caption += `Unique ID: ${userData.uniqueId || username}\n`;
    caption += `User ID: ${userData.id || 'N/A'}\n`;
    caption += `Followers: ${userData.followerCount || 0}\n`;
    caption += `Following: ${userData.followingCount || 0}\n`;
    caption += `Likes: ${userData.heartCount || 0}\n`;
    caption += `Videos: ${userData.videoCount || 0}\n`;
    caption += `Digg Count: ${userData.diggCount || 0}\n`;
    caption += `Signature: ${userData.signature ? userData.signature.replace(/\\n/g, '\n').replace(/\\\\/g, '\\').replace(/\\"/g, '"') : 'N/A'}\n`;
    caption += `Verified: ${userData.verified ? 'Yes' : 'No'}\n`;
    caption += `Comment Setting: ${settings.commentSetting}\n`;
    caption += `Duet Setting: ${settings.duetSetting}\n`;
    caption += `Stitch Setting: ${settings.stitchSetting}\n`;
    if (userData.privateAccount) caption += `Private Account: Yes\n`;
    caption += `Under 18: ${userData.isUnderAge18 ? 'Yes' : 'No'}\n`;
    caption += `Open Favorite: ${userData.openFavorite ? 'Yes' : 'No'}\n`;
    if (userData.isADVirtual) caption += `AD Virtual: Yes\n`;

    let uploadResult = undefined;
    const profilePicUrl = userData.avatarLarger;
    if (profilePicUrl) {
      tempImagePath = path.join(tempDir, `profile_${Date.now()}.jpg`);
      tempImagePath = await downloadFile(profilePicUrl, tempImagePath);
      uploadResult = await api.uploadAttachment([tempImagePath], threadId, type);
    }

    await api.sendMessage({
      body: caption,
      mentions: [MessageMention(senderIdOriginal, senderNameOriginal.length, 2, false)],
      threadId,
      threadType: type,
      attachment: uploadResult,
    });

    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý reaction TikTok:", error);
    return false;
  } finally {
    if (tempImagePath) deleteFile(tempImagePath);
  }
}
