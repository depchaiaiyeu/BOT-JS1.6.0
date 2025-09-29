import axios from "axios";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { LRUCache } from "lru-cache";
import { fileURLToPath } from "url";
import { MessageMention } from "zlbotdqt";
import { getGlobalPrefix } from "../../service.js";
import { downloadAndConvertAudio } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import {
  sendMessageCompleteRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendVoiceMusic, sendVoiceMusicNotQuote } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { deleteSelectionsMapData, setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { deleteFile } from "../../../utils/util.js";
import { getBotId } from "../../../index.js";

const PLATFORM = "zingmp3";
const URL = "https://zingmp3.vn";
let API_KEY = "Có Trình Mới Lấy Được API";
let SECRET_KEY = "Có Trình Mới Lấy Được SECRET_KEY";

let VERSION = "1.11.11";
let CTIME = String(Math.floor(Date.now() / 1000));
const p = ["ctime", "id", "type", "page", "count", "version"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "../config.json");

const VIETNAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'DNT': '1',
  'X-Forwarded-For': '113.161.87.101',
  'CF-IPCountry': 'VN',
  'CF-Connecting-IP': '113.161.87.101'
};

function getSearchReferer(keyword) {
  const encodedKeyword = encodeURIComponent(keyword);
  return `https://zingmp3.vn/tim-kiem/tat-ca?q=${encodedKeyword}`;
}

function getSongReferer(songUrl) {
  if (songUrl && songUrl.includes('zingmp3.vn')) {
    return songUrl;
  }
  return 'https://zingmp3.vn/';
}

(async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  if (config) {
    SECRET_KEY = config.zingmp3.secretKey;
    API_KEY = config.zingmp3.apiKey;
    VERSION = config.zingmp3.version;
  }
})();

const TIME_TO_SELECT = 60000;

const musicSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT
});

function getHash256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function getHmac512(str, key) {
  return crypto
    .createHmac("sha512", key)
    .update(Buffer.from(str, "utf8"))
    .digest("hex");
}

function sortParams(params) {
  const sorted = {};
  Object.keys(params)
    .sort()
    .forEach((key) => {
      sorted[key] = params[key];
    });
  return sorted;
}

function encodeParamsToString(params, separator = "") {
  const encode = encodeURIComponent;
  return Object.keys(params)
    .map((key) => {
      const value = encode(params[key]);
      return value.length > 5000 ? "" : `${encode(key)}=${value}`;
    })
    .filter((param) => param !== "")
    .join(separator);
}

function getStringParams(params) {
  const sortedParams = sortParams(params);
  const filteredParams = {};

  for (const key in sortedParams) {
    if (
      p.includes(key) &&
      params[key] !== null &&
      params[key] !== undefined &&
      params[key] !== ""
    ) {
      filteredParams[key] = sortedParams[key];
    }
  }

  return encodeParamsToString(filteredParams, "");
}

function getSig(path, params) {
  const stringParams = getStringParams(params);
  return getHmac512(path + getHash256(stringParams), SECRET_KEY);
}

async function getCookie() {
  try {
    const res = await axios.get(URL, { headers: VIETNAM_HEADERS });
    if (res.headers["set-cookie"]) {
      return res.headers["set-cookie"][1];
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi lấy cookie:", error);
    throw error;
  }
}

async function requestZingMp3(path, params = {}, referer = null) {
  try {
    const cookie = await getCookie();
    const headers = {
      ...VIETNAM_HEADERS,
      Cookie: cookie,
      Origin: 'https://zingmp3.vn'
    };
    
    if (referer) {
      headers.Referer = referer;
    } else {
      headers.Referer = 'https://zingmp3.vn/';
    }

    const response = await axios.get(`${URL}${path}`, {
      headers,
      params,
    });
    return response.data;
  } catch (error) {
    console.error("Lỗi request Zing MP3:", error);
    throw error;
  }
}

async function downloadWithVietnamHeaders(url, api, message, referer = null) {
  const headers = {
    ...VIETNAM_HEADERS,
    'Origin': 'https://zingmp3.vn',
    'X-Real-IP': '113.161.87.101',
    'X-Forwarded-For': '113.161.87.101',
    'CF-IPCountry': 'VN'
  };
  
  if (referer) {
    headers.Referer = referer;
  } else {
    headers.Referer = 'https://zingmp3.vn/';
  }
  
  return await downloadAndConvertAudio(url, api, message, headers);
}

export async function chartHomeZingMp3() {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathChart = "/api/v2/page/get/chart-home";
  const params = {
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  return requestZingMp3(pathChart, {
    ...params,
    sig: getSig(pathChart, params),
  });
}

export async function searchMusicZingMp3(keyword, numberMusic) {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathSearch = "/api/v2/search";
  const params = {
    q: keyword,
    type: "song",
    count: numberMusic || 10,
    allowCorrect: 1,
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  const referer = getSearchReferer(keyword);
  return requestZingMp3(pathSearch, {
    ...params,
    sig: getSig(pathSearch, params),
  }, referer);
}

export async function getSong(songId) {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathSong = "/api/v2/page/get/song";
  const params = {
    id: songId,
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  const referer = `https://zingmp3.vn/bai-hat/-/${songId}.html`;
  return requestZingMp3(pathSong, {
    ...params,
    sig: getSig(pathSong, params),
  }, referer);
}

export async function getStreamingSong(songId) {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathStreaming = "/api/v2/song/get/streaming";
  const params = {
    id: songId,
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  const referer = `https://zingmp3.vn/bai-hat/-/${songId}.html`;
  return requestZingMp3(pathStreaming, {
    ...params,
    sig: getSig(pathStreaming, params),
  }, referer);
}

export async function getLyric(songId) {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathLyric = "/api/v2/lyric/get/lyric";
  const params = {
    id: songId,
    BGId: 0,
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  const referer = `https://zingmp3.vn/bai-hat/-/${songId}.html`;
  return requestZingMp3(pathLyric, {
    ...params,
    sig: getSig(pathLyric, params),
  }, referer);
}

function extractZingMp3Url(keyword) {
  const urlPattern = /https?:\/\/zingmp3\.vn\/[^\s]+/;
  const match = keyword.match(urlPattern);
  return match ? match[0] : null;
}

async function processSongData(songId, songData) {
  const [songInfo, streamingInfo] = await Promise.all([
    songData ? songData : getSong(songId),
    getStreamingSong(songId)
  ]);

  if (songInfo.err === -1023) {
    throw new Error(songInfo.msg);
  }

  if (!streamingInfo.data) {
    throw new Error(streamingInfo.msg);
  }

  let linkMusic = streamingInfo.data["320"];
  let quality = "320kbps";
  if (!linkMusic || !linkMusic.toUpperCase().includes("vip")) {
    linkMusic = streamingInfo.data["128"];
    quality = "128kbps";
  }

  return {
    songData: songInfo.data,
    linkMusic,
    quality
  };
}

async function getChartRankInfo(encodeId) {
  try {
    const resultChart = await chartHomeZingMp3();
    let chartData = new Map();

    if (resultChart?.data?.RTChart?.items) {
      resultChart.data.RTChart.items.forEach((item, index) => {
        chartData.set(item.encodeId, {
          rank: index + 1,
          score: item.score
        });
      });
    }
    return chartData.get(encodeId);
  } catch (error) {
    console.error("Lỗi lấy thông tin chart:", error);
    return null;
  }
}

async function prepareAndSendMusic(api, message, songData, linkMusic, quality, captionCustom, keyword = null) {
  const cachedMusic = await getCachedMedia(PLATFORM, songData.encodeId, quality, songData.title);
  let voiceUrl;

  if (cachedMusic) {
    voiceUrl = cachedMusic.fileUrl;
  } else {
    const object = {
      caption: `Chờ bé lấy nhạc một chút, xong bé gọi cho hay.\n\n⏳ ${songData.title}`,
    };
    await sendMessageCompleteRequest(api, message, object, 5000);
    
    let referer = `https://zingmp3.vn/bai-hat/-/${songData.encodeId}.html`;
    if (keyword) {
      referer = getSearchReferer(keyword);
    }
    
    voiceUrl = await downloadWithVietnamHeaders(linkMusic, api, message, referer);
    setCacheData(PLATFORM, songData.encodeId, {
      fileUrl: voiceUrl,
      title: songData.title,
      artist: songData.artistsNames
    }, quality);
  }

  const thumbnailUrl = songData.thumbnailM.replace(/w\d+_/i, 'w1200_');

  const stats = [
    songData.listen && `${songData.listen.toLocaleString()} 👂`,
    songData.like && `${songData.like.toLocaleString()} ❤️`,
    songData.rank && `🏆 Top ${songData.rank} BXH`
  ].filter(Boolean);

  const objectMusic = {
    trackId: songData.encodeId,
    title: songData.title,
    artists: songData.artistsNames,
    like: songData.like,
    listen: songData.listen,
    comment: songData.comment,
    source: "ZingMP3",
    caption: captionCustom || `> From ZingMP3 <\nNhạc Đây Người Đẹp Ơi!!!`,
    imageUrl: thumbnailUrl,
    voiceUrl: voiceUrl,
    stats: stats,
    rank: songData.rankChart || songData.rank,
    score: songData.score || 0,
  };

  await sendVoiceMusic(api, message, objectMusic, 180000000);
}

export async function handleZingMp3Command(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let imagePath = null;

  try {
    const content = removeMention(message);
    const prefix = getGlobalPrefix();
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const [keyword, numberMusic] = commandContent.split("&&");

    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Bài Hát Cần Tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const url = extractZingMp3Url(keyword);
    if (url) {
      const encodeId = url.split("/").pop().split(".")[0];
      try {
        const { songData, linkMusic, quality } = await processSongData(encodeId);

        const chartInfo = await getChartRankInfo(encodeId);

        if (chartInfo) {
          songData.rank = chartInfo.rank;
          songData.score = chartInfo.score;
        }

        await prepareAndSendMusic(api, message, songData, linkMusic, quality, null, keyword);
      } catch (error) {
        const object = {
          caption: `Link Không hợp lệ hoặc link thuộc thể loại album!`
            + `\nNguyên Nhân: ${error.message}`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
      }
      return;
    }

    const result = await searchMusicZingMp3(keyword, numberMusic);
    if (!result.data || !result.data.items || result.data.items.length === 0) {
      const object = {
        caption: `Không tìm thấy bài hát nào với từ khóa: ${keyword}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const songs = result.data.items;
    const resultChart = await chartHomeZingMp3();
    let chartData = new Map();

    if (resultChart?.data?.RTChart?.items) {
      resultChart.data.RTChart.items.forEach((item, index) => {
        chartData.set(item.encodeId, {
          rank: index + 1,
          score: item.score
        });
      });
    }

    const songsWithInfo = await Promise.all(
      songs.map(async (song) => {
        const songInfo = await getSong(song.encodeId);
        const chartInfo = chartData.get(song.encodeId);
        return {
          ...song,
          ...songInfo.data,
          rank: chartInfo?.rank
        };
      })
    );

    let musicListTxt = "Đây là danh sách bài hát trên ZingMP3 mà tôi tìm thấy:\n";
    musicListTxt +=
      "Hãy trả lời tin nhắn này với số index của bài hát bạn muốn nghe!\nVD: 1 hoặc 1 lyric";

    const formattedSongs = songsWithInfo.map(song => ({
      title: song.title,
      artistsNames: song.artistsNames,
      thumbnailM: song.thumbnailM,
      listen: song.listen,
      like: song.like,
      rankChart: song.rank,
      comment: song.comment,
      isPremium: song.streamingStatus == 2
    }));

    imagePath = await createSearchResultImage(formattedSongs);

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };
    const musicListMessage = await sendMessageCompleteRequest(
      api,
      message,
      object,
      TIME_TO_SELECT
    );

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment[0]?.msgId;

    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: songsWithInfo,
      timestamp: Date.now(),
      keyword: keyword
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: songsWithInfo,
      timestamp: Date.now(),
      platform: PLATFORM,
      keyword: keyword
    });
  } catch (error) {
    console.error("Lỗi xử lý lệnh ZingMP3:", error);
    await api.sendMessage(
      {
        msg: `${senderName} Đã xảy ra lỗi khi xử lý lệnh của bạn. Vui lòng thử lại sau.`,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleTopChartZingMp3(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();
  const commandContent = removeMention(message)
    .replace(`${prefix}${aliasCommand}`, "")
    .trim();
  let numberMusic = parseInt(commandContent) || 10;
  let imagePath = null;

  try {
    const result = await chartHomeZingMp3();
    if (!result.data || !result.data.RTChart || !result.data.RTChart.items) {
      throw new Error("Không thể lấy được danh sách bài hát từ ZingMP3");
    }

    const top20Songs = result.data.RTChart.items.slice(0, numberMusic);
    const songsWithRank = await Promise.all(top20Songs.map(async (song, index) => {
      const songInfo = await getSong(song.encodeId);
      return {
        ...song,
        ...songInfo.data,
        rankChart: index + 1,
        score: song.score
      };
    }));

    let musicListTxt = `[ TOP ${numberMusic} Bài Hát Hot Nhất ZingMP3 ]\n\n`;
    musicListTxt += "Hãy trả lời tin nhắn này với số thứ tự bài hát bạn muốn nghe!\n\n";

    const formattedSongs = songsWithRank.map(song => ({
      title: song.title,
      artistsNames: song.artistsNames,
      thumbnailM: song.thumbnailM.replace(/w\d+_/i, 'w600_'),
      rankChart: song.rankChart,
      score: song.score
    }));

    imagePath = await createSearchResultImage(formattedSongs);

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };

    const musicListMessage = await sendMessageCompleteRequest(
      api,
      message,
      object,
      TIME_TO_SELECT
    );

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment[0]?.msgId;

    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: songsWithRank,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: songsWithRank,
      timestamp: Date.now(),
      platform: PLATFORM,
    });

  } catch (error) {
    console.error("Lỗi xử lý chart ZingMP3:", error);
    await api.sendMessage(
      {
        msg: `${senderName} Đã xảy ra lỗi khi lấy danh sách bài hát. Vui lòng thử lại sau.`,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleZingMp3Reply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = getBotId();
  let track;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!musicSelectionsMap.has(quotedMsgId)) return false;

    const musicData = musicSelectionsMap.get(quotedMsgId);
    if (musicData.userRequest !== senderId) return false;

    let selection = removeMention(message);
    let [selectedIndex, subCommand] = selection.split(" ");
    selectedIndex = parseInt(selectedIndex) - 1;
    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn Không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const { collection, keyword } = musicSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= collection.length) {
      const object = {
        caption: `Số bạn chọn Không nằm trong danh sách. Vui lòng chọn lại.`,
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
    musicSelectionsMap.delete(quotedMsgId);
    deleteSelectionsMapData(senderId);

    track = collection[selectedIndex];

    return await handleSendTrackZingMp3(api, message, track, subCommand, keyword);
  } catch (error) {
    console.error(
      `Không thể lấy stream URL cho track ${track?.encodeId}:`,
      error
    );
    const object = {
      caption:
        `Không thể lấy bài này, vui lòng thử bài khác!\n` +
        `Nguyên Nhân: ${error.message}`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

export async function handleSendTrackZingMp3(api, message, track, subCommand, keyword = null) {
  const { linkMusic, quality } = await processSongData(track.encodeId, track);
  await prepareAndSendMusic(api, message, track, linkMusic, quality, null, keyword);

  const lyric = subCommand === "lyric" ? await getLyric(track.encodeId) : null;
  if (subCommand) {
    switch (subCommand) {
      case "lyric":
        if (lyric.data && lyric.data.sentences) {
          let formattedLyric = "Lời bài hát:\n\n";
          lyric.data.sentences.forEach((sentence) => {
            const line = sentence.words.map((word) => word.data).join(" ");
            if (line.trim()) {
              formattedLyric += line + "\n";
            }
          });
          await api.sendMessage(
            { msg: formattedLyric, ttl: 1800000 },
            message.threadId,
            message.type
          );
        } else {
          await api.sendMessage(
            {
              msg: "Không tìm thấy lời cho bài hát này.",
              ttl: 30000,
            },
            message.threadId,
            message.type
          );
        }
        break;
    }
  }
  return true;
}

export async function handleRandomChartZingMp3(
  api,
  message,
  caption,
  timeToLive = 1800000
) {
  try {
    const result = await chartHomeZingMp3();
    const songsWithRank = await Promise.all(result.data.RTChart.items.map(async (song, index) => {
      const songInfo = await getSong(song.encodeId);
      return {
        ...song,
        ...songInfo.data,
        rankChart: index + 1,
        score: song.score
      };
    }));
    const randomIndex = Math.floor(Math.random() * 20);
    const randomSong = songsWithRank[randomIndex];
    let captionFinal = caption || `[ Zing MP3 Chart ]\nChào buổi sáng!\n\n`;
    const streamingInfo = await getStreamingSong(randomSong.encodeId);
    if (!streamingInfo.data) {
      throw new Error(streamingInfo.msg);
    }

    let linkMusic = streamingInfo.data["320"];
    if (!linkMusic || !linkMusic.toUpperCase().includes("vip")) {
      linkMusic = streamingInfo.data["128"];
    }
    const thumbnailUrl = randomSong.thumbnailM.replace(/w\d+_/i, 'w1200_');
    const referer = 'https://zingmp3.vn/zing-chart';
    const voiceUrl = await downloadWithVietnamHeaders(linkMusic, api, message, referer);

    captionFinal += `🎵 Music: ${randomSong.title}\n👤 Artist: ${randomSong.artistsNames
      }\n#Top${randomIndex + 1}_ZingMP3\n\n`;
    captionFinal += `Cùng thưởng thức bài hát hiện tại đang hot thứ ${randomIndex + 1
      } trên nền tảng ZingMP3 nào!!!`;

    const stats = [
      randomSong.listen && `${randomSong.listen.toLocaleString()} 👂`,
      randomSong.like && `${randomSong.like.toLocaleString()} ❤️`,
      randomSong.rank && `🏆 Top ${randomSong.rank} BXH`
    ].filter(Boolean);

    const object = {
      trackId: randomSong.encodeId,
      title: randomSong.title,
      artists: randomSong.artistsNames,
      like: randomSong.like,
      listen: randomSong.listen,
      comment: randomSong.comment,
      source: "ZingMP3",
      caption: captionFinal,
      imageUrl: thumbnailUrl,
      voiceUrl: voiceUrl,
      stats: stats,
      rank: randomSong.rankChart || randomSong.rank,
      score: randomSong.score || 0,
    };

    await sendVoiceMusicNotQuote(api, message, object, timeToLive);
  } catch (error) {
    console.error("Lỗi xử lý chart ZingMP3:", error);
  }
}
