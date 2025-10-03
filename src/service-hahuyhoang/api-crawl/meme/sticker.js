import axios from "axios";
import fs from "fs";
import path from "path";
import { LRUCache } from "lru-cache";
import { fileURLToPath } from "url";
import { getGlobalPrefix } from "../../service.js";
import { tempDir } from "../../../utils/io-json.js";
import {
  sendMessageCompleteRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { setSelectionsMapData } from "../index.js";
import { deleteFile, downloadFile } from "../../../utils/util.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { processAndSendSticker } from "../../chat-zalo/chat-special/send-sticker/send-sticker.js";

const PLATFORM = "meme";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIME_TO_SELECT = 60000;

const CONFIG = {
  paths: {
    saveDir: tempDir,
  },
  download: {
    timeout: 5000,
    minSize: 1024,
  },
  api: {
    pinterestLimit: 16,
  },
};

const memeSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

async function searchPinterestMemes(query) {
  try {
    const searchQuery = `meme ${query}`;
    const encodedQuery = encodeURIComponent(searchQuery);
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
        query: searchQuery,
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

      const memes = results
        .filter((pin) => {
          return (
            pin &&
            pin.images &&
            (pin.images.orig || pin.images["736x"] || pin.images["474x"] || pin.images["1200x"] || pin.images["600x"])
          );
        })
        .map((pin, index) => ({
          id: pin.id || `meme_${index}`,
          title: pin.title || pin.grid_title || `Meme ${index + 1}`,
          imageUrl:
            pin.images.orig?.url ||
            pin.images["1200x"]?.url ||
            pin.images["736x"]?.url ||
            pin.images["600x"]?.url ||
            pin.images["474x"]?.url,
          thumbnailUrl: pin.images["474x"]?.url || pin.images["236x"]?.url,
        }))
        .filter((meme) => meme.imageUrl);

      return memes;
    }

    return [];
  } catch (error) {
    console.error("Error searching Pinterest memes:", error.message);
    return [];
  }
}

export async function handleMemeCommand(api, message, aliasCommand) {
  let imagePath = null;
  try {
    const content = removeMention(message);
    const senderId = message.data.uidFrom;
    const prefix = getGlobalPrefix();
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();

    if (!commandContent) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm meme\nVí dụ:\n${prefix}${aliasCommand} funny cat`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const memes = await searchPinterestMemes(commandContent);

    if (!memes || memes.length === 0) {
      const object = {
        caption: `Không tìm thấy meme nào với từ khóa: ${commandContent}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let memeListTxt = "Đây là danh sách meme trên Pinterest mà tôi tìm thấy:\n";
    memeListTxt += "Hãy trả lời tin nhắn này với số index của meme bạn muốn!";

    const songs = memes.map((meme) => ({
      title: meme.title,
      artistsNames: "Pinterest",
      thumbnailM: meme.thumbnailUrl || meme.imageUrl,
    }));

    imagePath = await createSearchResultImage(songs);

    const object = {
      caption: memeListTxt,
      imagePath: imagePath,
    };
    const memeListMessage = await sendMessageCompleteRequest(api, message, object, 30000);

    const quotedMsgId = memeListMessage?.message?.msgId || memeListMessage?.attachment[0]?.msgId;
    memeSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: memes,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: memes,
      timestamp: Date.now(),
      platform: PLATFORM,
    });
  } catch (error) {
    console.error("Error handling meme command:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi tìm kiếm meme. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleSendMemeSticker(api, message, meme) {
  let downloadedPath = null;
  try {
    const tempFileName = `meme_${Date.now()}.jpg`;
    downloadedPath = path.join(CONFIG.paths.saveDir, tempFileName);
    await downloadFile(meme.imageUrl, downloadedPath);

    const stats = fs.statSync(downloadedPath);
    if (stats.size < CONFIG.download.minSize) {
      throw new Error("Ảnh meme tải về quá nhỏ");
    }

    const object = {
      caption: `Sticker meme của bạn đây!`,
    };
    await sendMessageCompleteRequest(api, message, object, 10000);

    await processAndSendSticker(api, message, downloadedPath, null);

    return true;
  } catch (error) {
    console.error("Error sending meme sticker:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý meme cho bạn, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  } finally {
    if (downloadedPath) deleteFile(downloadedPath);
  }
}
