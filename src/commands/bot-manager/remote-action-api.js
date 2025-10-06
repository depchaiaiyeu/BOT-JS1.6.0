import {
  sendMessageComplete,
  sendMessageFromSQL,
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";

export async function handleEval(api, message) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  if (!content.startsWith(`${prefix}eval `)) return;
  const code = content.slice(prefix.length + 5).trim();
  if (!code) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Vui lòng sử dụng:\n${prefix}eval [code]\nEg: ${prefix}eval api.sendMessage("Your MSG")`,
      },
      false,
      30000
    );
    return;
  }
  try {
    const result = eval(code);
    const output = result ? result.toString() : "";
    if (output) {
      await sendMessageComplete(api, message, { caption: output }, 30000);
    }
  } catch (error) {
    await sendMessageComplete(api, message, { caption: error.message }, 30000);
  }
}
