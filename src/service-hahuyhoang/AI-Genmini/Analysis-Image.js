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

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

const MIME_MAP = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp"
};

export async function handleImageAnalysis(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, '').trim();
  const quote = message.data?.quote;

  if (!content && !quote) {
    return sendMessageWarningRequest(api, message, {
      caption: `Vui lòng nhập câu hỏi hoặc reply vào tin nhắn có hình ảnh.\nVí dụ:\n${prefix}${aliasCommand} Đây là gì?`,
    }, 30000);
  }

  let quoteText = "";
  if (!content && quote?.msg) quoteText = quote.msg;

  let tempPath = null;

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

    if (quote?.attach) {
      const attachData = JSON.parse(quote.attach);
      const fileUrl =
        attachData.hdUrl ||
        attachData.href ||
        attachData.oriUrl ||
        attachData.normalUrl ||
        attachData.thumbUrl;

      if (fileUrl) {
        console.log(`📎 File URL: ${fileUrl}`);
        
        let extension = (await checkExstentionFileRemote(fileUrl))?.toLowerCase();
        if (!extension) {
          const urlParts = fileUrl.split('.');
          extension = urlParts[urlParts.length - 1].split('?')[0].toLowerCase();
        }
        
        console.log(`📄 Extension: ${extension}`);
        
        if (!SUPPORTED_IMAGE_EXTENSIONS.includes(extension)) {
          return sendMessageWarningRequest(api, message, {
            caption: `❌ Chỉ hỗ trợ hình ảnh (.jpg, .png, .webp, .gif)`,
          }, 30000);
        }

        const mimeType = MIME_MAP[extension] || `image/${extension}`;
        console.log(`🎯 MIME Type: ${mimeType}`);

        const response = await axios.get(fileUrl, { 
          responseType: "arraybuffer",
          maxRedirects: 5,
          timeout: 60000,
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        });
        
        const fileSizeMB = response.data.byteLength / (1024 * 1024);
        console.log(`📦 File size: ${fileSizeMB.toFixed(2)} MB`);
        
        if (fileSizeMB > 20) {
          return sendMessageWarningRequest(api, message, {
            caption: `⚠️ Ảnh quá lớn (${fileSizeMB.toFixed(2)} MB). Tối đa 20MB.`,
          }, 30000);
        }

        const tempDir = path.resolve("assets/temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        tempPath = path.join(tempDir, `img_${Date.now()}.${extension}`);
        fs.writeFileSync(tempPath, Buffer.from(response.data));
        console.log(`💾 Saved: ${tempPath}`);

        const base64Data = fs.readFileSync(tempPath).toString('base64');
        console.log(`✅ Base64 length: ${base64Data.length}`);

        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }
    }

    if (parts.length === 0) {
      return sendMessageWarningRequest(api, message, {
        caption: "⚠️ Không tìm thấy nội dung hoặc hình ảnh.",
      }, 30000);
    }

    console.log(`🚀 Gọi Gemini...`);
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    let replyText = null;
    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🌀 Attempt ${attempt}/${maxRetries}...`);
        
        const result = await model.generateContent({
          contents: [{ role: "user", parts }]
        });

        replyText = result.response.text();
        console.log(`✅ Success!`);
        break;
        
      } catch (err) {
        console.error(`❌ Attempt ${attempt} failed: ${err.message}`);
        
        if (attempt === maxRetries) {
          throw err;
        }
        await new Promise(res => setTimeout(res, 2000));
      }
    }

    return await sendMessageCompleteRequest(api, message, { caption: replyText }, 3000000);
    
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    console.error(err.stack);
    return sendMessageFailed(api, message, `Lỗi: ${err.message}`);
    
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
      console.log(`🗑️ Cleanup done`);
    }
  }
}
