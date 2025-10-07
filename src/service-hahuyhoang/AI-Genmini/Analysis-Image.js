import axios from "axios";
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

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const SUPPORTED_VIDEO_EXTENSIONS = [
  "mp4", "mpeg", "mov", "avi", "x-flv", "mpg", "webm", "wmv", "3gpp"
];
const SUPPORTED_AUDIO_EXTENSIONS = [
  "mp3", "wav", "aiff", "aac", "ogg", "flac"
];

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

    if (quote?.attach) {
      const attachData = JSON.parse(quote.attach);
      const fileUrl =
        attachData.hdUrl ||
        attachData.href ||
        attachData.oriUrl ||
        attachData.normalUrl ||
        attachData.thumbUrl;

      if (fileUrl) {
        const extension = await checkExstentionFileRemote(fileUrl);
        const isImage = SUPPORTED_IMAGE_EXTENSIONS.includes(extension);
        const isVideo = SUPPORTED_VIDEO_EXTENSIONS.includes(extension);
        const isAudio = SUPPORTED_AUDIO_EXTENSIONS.includes(extension);

        if (!isImage && !isVideo && !isAudio) {
          return sendMessageWarningRequest(api, message, {
            caption: `❌ File không hỗ trợ. Chỉ hỗ trợ hình ảnh (.jpg, .png...), video (.mp4, .webm...) và âm thanh (.mp3, .wav...) dưới 20MB.`,
          }, 30000);
        }

        let mimeType;
        if (isImage) {
          if (['jpg', 'jpeg'].includes(extension)) mimeType = 'image/jpeg';
          else if (extension === 'png') mimeType = 'image/png';
          else if (extension === 'webp') mimeType = 'image/webp';
        } else if (isVideo) {
          if (['mp4', 'mpeg', 'mpg'].includes(extension)) mimeType = 'video/mp4';
          else if (extension === 'mov') mimeType = 'video/quicktime';
          else if (extension === 'avi') mimeType = 'video/x-msvideo';
          else if (extension === 'webm') mimeType = 'video/webm';
          else if (extension === 'wmv') mimeType = 'video/x-ms-wmv';
          else if (extension === '3gpp') mimeType = 'video/3gpp';
          else if (extension === 'x-flv') mimeType = 'video/x-flv';
        } else if (isAudio) {
          if (extension === 'mp3') mimeType = 'audio/mpeg';
          else if (extension === 'wav') mimeType = 'audio/wav';
          else if (extension === 'aiff') mimeType = 'audio/aiff';
          else if (extension === 'aac') mimeType = 'audio/aac';
          else if (extension === 'ogg') mimeType = 'audio/ogg';
          else if (extension === 'flac') mimeType = 'audio/flac';
        }

        const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
        const fileSizeMB = response.data.byteLength / (1024 * 1024);
        if (fileSizeMB > 20) {
          return sendMessageWarningRequest(api, message, {
            caption: `⚠️ File quá lớn (${fileSizeMB.toFixed(2)} MB). Vui lòng gửi file dưới 20MB.`,
          }, 30000);
        }

        const base64 = Buffer.from(response.data).toString('base64');

        parts.push({
          inlineData: {
            mimeType,
            data: base64,
          },
        });
      }
    }

    if (userInput) {
      if (userInput.length > 10000) {
        return sendMessageWarningRequest(api, message, {
          caption: "Nội dung quá dài, vui lòng rút gọn lại!",
        }, 30000);
      }
      parts.push({ text: `${userInput}\n\n(Trả lời bằng tiếng Việt)` });
    }

    const modelName = "gemini-2.0-flash-lite";
    const model = genAI.getGenerativeModel({ model: modelName });

    let replyText = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent({ contents: parts });

        replyText = result.response.text();
        break;
      } catch (err) {
        if (attempt === maxRetries) {
          throw err; 
        }
        await new Promise(res => setTimeout(res, 1000 * attempt));
      }
    }

    return await sendMessageCompleteRequest(api, message, { caption: replyText }, 3000000);
  } catch (err) {
    return sendMessageFailed(api, message, "API Quá tải vui lòng thử lại sau...");
  }
}
