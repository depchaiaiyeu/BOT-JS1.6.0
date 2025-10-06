import {
  sendMessageComplete,
  sendMessageFromSQL,
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";

export async function handleEvaluate(api, message) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  
  const code = content.replace(`${prefix}eval`, "").trim();

  if (!code) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Thiếu tham số!\nVí dụ: ${prefix}eval [code]\nEg: ${prefix}eval api.sendMessage("Hello")`,
      },
      false,
      30000
    );
    return;
  }

  try {
    const result = await eval(`(async () => { return ${code}; })()`);
    
    const output = typeof result === 'object' 
      ? JSON.stringify(result, null, 2) 
      : String(result);

    await sendMessageComplete(
      api,
      message,
      {
        caption: output,
      },
      60000
    );
  } catch (error) {
    await sendMessageComplete(
      api,
      message,
      {
        caption: `${error.message}\n\n${error.stack}`,
      },
      60000
    );
  }
}
