import axios from "axios";
import fs from "fs";
import path from "path";
import { LRUCache } from "lru-cache";
import { fileURLToPath } from "url";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { setSelectionsMapData } from "../index.js";
import { deleteFile, downloadFile } from "../../../utils/util.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { getBotId, isAdmin } from "../../../index.js";
import { processAndSendSticker } from "../../chat-zalo/chat-special/send-sticker/send-sticker.js";
import { tempDir } from "../../../utils/io-json.js";

const PLATFORM = "pinterest";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIME_TO_SELECT = 60000;

const CONFIG = {
  paths: {
    saveDir: tempDir,
  },
  download: {
    maxAttempts: 3,
    timeout: 5000,
    minSize: 1024,
  },
  api: {
    pinterestLimit: 16,
  },
};

async function handleOriginalPinterest(query) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/`;

    const data = {
      options: {
        applied_unified_filters: null,
        appliedProductFilters: "---",
        article: null,
        auto_correction_disabled: false,
        corpus: null,
        customized_rerank_type: null,
        domains: null,
        dynamicPageSizeExpGroup: null,
        filters: null,
        journey_depth: null,
        page_size: CONFIG.api.pinterestLimit,
        price_max: null,
        price_min: null,
        query_pin_sigs: null,
        query: query,
        redux_normalize_feed: true,
        request_params: null,
        rs: "typed",
        scope: "pins",
        selected_one_bar_modules: null,
        seoDrawerEnabled: false,
        source_id: null,
        source_module_id: null,
        source_url: `/search/pins/?q=${encodedQuery}&rs=typed`,
        top_pin_id: null,
        top_pin_ids: null,
      },
      context: {},
    };

    const headers = {
      Accept: "application/json, text/javascript, */*, q=0.01",
      Referer: `https://www.pinterest.com/`,
      "x-app-version": "9237374",
      "x-pinterest-appstate": "active",
      "x-pinterest-source-url": `/search/pins/?q=${encodedQuery}&rs=typed`,
      "x-requested-with": "XMLHttpRequest",
      "x-pinterest-pws-handler": "www/search/[scope].js",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    };

    const response = await axios({
      method: "get",
      url: searchUrl,
      headers: headers,
      params: {
        source_url: `/search/pins/?q=${encodedQuery}&rs=typed`,
        data: JSON.stringify(data),
        _: Date.now(),
      },
      timeout: CONFIG.download.timeout * 2,
    });

    if (response.data && response.data.resource_response && response.data.resource_response.data) {
      const results = response.data.resource_response.data.results;

      const memeData = results
        .filter((pin) => {
          return (
            pin &&
            pin.images &&
            (pin.images.orig || pin.images["736x"] || pin.images["474x"] || pin.images["1200x"] || pin.images["600x"])
          );
        })
        .map((pin) => {
          const imageUrl = (
            pin.images.orig?.url ||
            pin.images["1200x"]?.url ||
            pin.images["736x"]?.url ||
            pin.images["600x"]?.url ||
            pin.images["474x"]?.url
          );
          return {
            title: pin.title || pin.description || 'Meme',
            imageUrl: imageUrl,
          };
        })
        .filter((data) => data.imageUrl);

      return memeData;
    }

    return [];
  } catch (error) {
    console.error("Lỗi Pinterest gốc:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Headers:", JSON.stringify(error.response.headers));
    }
    return [];
  }
}

async function getMemeInfo(question, limit) {
  limit = limit || 10;
  try {
    return await handleOriginalPinterest(question);
  } catch (error) {
    console.error("Error fetching meme info:", error);
    return null;
  }
}

const memeSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT
});

export async function handleMemeCommand(api, message, aliasCommand) {
  let imagePath = null;
  try {
    const content = removeMention(message);
    const senderId = message.data.uidFrom;
    const prefix = getGlobalPrefix();
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const [question, numberMeme] = commandContent.split("&&");

    if (!question) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} keyword`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const fullQuery = `meme ${question}`;
    const memeInfo = await getMemeInfo(fullQuery, parseInt(numberMeme));
    if (!memeInfo || memeInfo.length === 0) {
      const object = {
        caption: `Không tìm thấy meme nào với từ khóa: ${question}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let memeListTxt = "Đây là danh sách meme trên Pinterest mà tôi tìm thấy:\n";
    memeListTxt += "Hãy trả lời tin nhắn này với số index của meme bạn muốn chọn!";

    const memes = memeInfo.map((meme) => ({
      title: meme.title,
      artistsNames: "Pinterest",
      thumbnailM: meme.imageUrl,
      listen: 0,
      like: 0,
      comment: 0
    })).slice(0, 10);

    imagePath = await createSearchResultImage(memes);

    const object = {
      caption: memeListTxt,
      imagePath: imagePath,
    };
    const memeListMessage = await sendMessageCompleteRequest(api, message, object, 30000);

    const quotedMsgId = memeListMessage?.message?.msgId || memeListMessage?.attachment[0]?.msgId;
    memeSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: memeInfo,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: memeInfo,
      timestamp: Date.now(),
      platform: PLATFORM,
    });

  } catch (error) {
    console.error("Error handling meme command:", error);
    await sendMessageWarningRequest(api, message, { caption: "Đã xảy ra lỗi khi xử lý lệnh của bạn. Vui lòng thử lại sau." }, 30000);
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleMemeReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = getBotId();
  const isAdminLevelHighest = isAdmin(senderId);
  let selectedMeme;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!memeSelectionsMap.has(quotedMsgId)) return false;

    const memeData = memeSelectionsMap.get(quotedMsgId);
    if (memeData.userRequest !== senderId) return false;

    let selection = removeMention(message);
    const selectedIndex = parseInt(selection) - 1;
    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn Không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const { collection } = memeSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= collection.length) {
      const object = {
        caption: `Số bạn chọn Không nằm trong danh sách. Vui lòng chọn lại.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    selectedMeme = collection[selectedIndex];

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
    memeSelectionsMap.delete(quotedMsgId);

    return await handleSendMemeSticker(api, message, selectedMeme);
  } catch (error) {
    console.error("Error handling meme reply:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lấy meme từ Pinterest cho bạn, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

async function handleSendMemeSticker(api, message, meme) {
  try {
    const imageUrl = meme.imageUrl;
    const tempFileName = `meme_${Date.now()}.jpg`;
    const imagePath = path.join(CONFIG.paths.saveDir, tempFileName);
    await downloadFile(imageUrl, imagePath);
    const stats = fs.statSync(imagePath);
    if (stats.size < CONFIG.download.minSize) {
      deleteFile(imagePath);
      const object = {
        caption: `Không thể tải meme này. Vui lòng thử lại.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    await sendMessageCompleteRequest(api, message, { caption: "Sticker meme của bạn đây!" }, 30000);
    await processAndSendSticker(api, message, imagePath, null);
    deleteFile(imagePath);
    return true;
  } catch (error) {
    console.error("Error sending meme sticker:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi gửi sticker meme. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}
