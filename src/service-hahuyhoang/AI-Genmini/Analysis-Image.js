import axios from "axios";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  sendMessageFailed,
  sendMessageWarningRequest,
  sendMessageCompleteRequest
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import { checkExstentionFileRemote } from "../../utils/util.js";

const genAI = new GoogleGenerativeAI("AIzaSyBKNInWVa8kKm9G0e9Kz7_VxQkgpFY6gDs");

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const SUPPORTED_VIDEO_EXTENSIONS = [
  "mp4", "mpeg", "mov", "avi", "flv", "mpg", "webm", "wmv", "3gpp"
];
const SUPPORTED_AUDIO_EXTENSIONS = [
  "mp3", "wav", "aiff", "aac", "ogg", "flac"
];

const MIME_MAP = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  flv: "video/x-flv",
  mpg: "video/mpeg",
  webm: "video/webm",
  wmv: "video/x-ms-wmv",
  "3gpp": "video/3gpp",
  mp3: "audio/mp3",
  wav: "audio/wav",
  aiff: "audio/aiff",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac"
};

export async function handleImageAnalysis(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, '').trim();
  const quote = message.data?.quote;

  if (!content && !quote) {
    return sendMessageWarningRequest(api, message, {
      caption: `Vui lòng nhập câu hỏi hoặc reply vào tin nhắn có hình ảnh / video / âm thanh.\nVí dụ:\n${prefix}${aliasCommand} Đây là gì?`,
    }, 30000);
  }

  let quoteText = "";
  if (!content && quote?.msg) quoteText = quote.msg;

  try {
    const parts = [];
    const userInput = content || quoteText;
    if (userInput) {
      if (userInput.length > 10000) {
        return sendMessageWarningRequest(api, message, {
          caption: "Nội dung quá dài, vui lòng rút gọn lại!",
        }, 30000);
      }
      parts.push({ text: `${userInput}\n\n(Trả lời bằng tiếng Việt)` });
    }

    let modelName = "gemini-2.0-flash-exp";

    if (quote?.attach) {
      const attachData = JSON.parse(quote.attach);
      const fileUrl =
        attachData.hdUrl ||
        attachData.href ||
        attachData.oriUrl ||
        attachData.normalUrl ||
        attachData.thumbUrl;

      if (fileUrl) {
        const extension = (await checkExstentionFileRemote(fileUrl))?.toLowerCase();
        const isImage = SUPPORTED_IMAGE_EXTENSIONS.includes(extension);
        const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(extension);
        const isAudio = SUPPORTED_AUDIO_EXTENSIONS.includes(extension);

        if (!isImage && !isVideo && !isAudio) {
          return sendMessageWarningRequest(api, message, {
            caption: `❌ File không hỗ trợ. Chỉ hỗ trợ hình ảnh (.jpg, .png...), video (.mp4, .webm...) và âm thanh (.mp3, .wav...) dưới 20MB.`,
          }, 30000);
        }

        const mimeType = MIME_MAP[extension] || `image/${extension}`;

        const response = await axios.get(fileUrl, { 
          responseType: "arraybuffer",
          maxRedirects: 5,
          timeout: 30000
        });
        
        const fileSizeMB = response.data.byteLength / (1024 * 1024);
        if (fileSizeMB > 20) {
          return sendMessageWarningRequest(api, message, {
            caption: `⚠️ File quá lớn (${fileSizeMB.toFixed(2)} MB). Vui lòng gửi file dưới 20MB.`,
          }, 30000);
        }

        const tempDir = path.resolve("assets/temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempPath = path.join(tempDir, `temp_${Date.now()}.${extension}`);
        fs.writeFileSync(tempPath, Buffer.from(response.data));

        const base64 = fs.readFileSync(tempPath, { encoding: "base64" });

        parts.push({
          inlineData: {
            mimeType,
            data: base64,
          },
        });

        fs.unlinkSync(tempPath);
      }
    }

    if (parts.length === 0) {
      return sendMessageWarningRequest(api, message, {
        caption: "⚠️ Không tìm thấy nội dung hoặc file đính kèm.",
      }, 30000);
    }

    const model = genAI.getGenerativeModel({ model: modelName });

    let replyText = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🌀 Gọi Gemini attempt ${attempt}...`);
        const result = await model.generateContent({
          contents: [{ role: "user", parts }],
        });

        replyText = result.response.text();
        break;
      } catch (err) {
        console.warn(`⚠️ Thử lần ${attempt} thất bại:`, err.message);
        if (attempt === maxRetries) {
          throw err;
        }
        await new Promise(res => setTimeout(res, 1500 * attempt));
      }
    }

    return await sendMessageCompleteRequest(api, message, { caption: replyText }, 3000000);
  } catch (err) {
    console.error("❌ Lỗi xử lý Gemini:", err.message);
    return sendMessageFailed(api, message, "API Quá tải vui lòng thử lại sau...");
  }
      }
