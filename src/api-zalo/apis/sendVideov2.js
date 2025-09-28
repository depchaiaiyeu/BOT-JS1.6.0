import path from "path";
import { appContext } from "../context.js";
import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { encodeAES, getVideoMetadata, handleZaloResponse, makeURL, request } from "../utils.js";
import { Zalo } from "../index.js";
import { MessageType } from "../models/Message.js";
import { deleteFile, execAsync } from "../../utils/util.js";
import { tempDir } from "../../utils/io-json.js";
import ffmpeg from "fluent-ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import fs from "fs";
import { promisify } from "util";

ffmpeg.setFfprobePath(ffprobeInstaller.path);

const getVideoInfo = (url, timeout = 30000) => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Video analysis timeout after ${timeout}ms`));
    }, timeout);

    if (!url || typeof url !== 'string') {
      clearTimeout(timeoutId);
      reject(new Error('Invalid video URL'));
      return;
    }

    ffmpeg.ffprobe(url, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration:format=size,duration',
      '-of', 'json'
    ], (err, metadata) => {
      clearTimeout(timeoutId);
      
      if (err) {
        if (err.message.includes('SIGSEGV')) {
          reject(new Error('Video file is corrupted or in unsupported format'));
        } else if (err.message.includes('timeout')) {
          reject(new Error('Video analysis timeout - file may be too large or corrupted'));
        } else if (err.message.includes('Permission denied')) {
          reject(new Error('Permission denied accessing video file'));
        } else if (err.message.includes('No such file')) {
          reject(new Error('Video file not found or URL is invalid'));
        } else {
          reject(new Error(`Unable to analyze video: ${err.message}`));
        }
        return;
      }

      try {
        let duration = 0;
        let width = 1280;
        let height = 720;
        let fileSize = 0;

        if (metadata.streams && metadata.streams.length > 0) {
          const videoStream = metadata.streams.find(stream => stream.codec_type === 'video') || metadata.streams[0];
          
          duration = parseFloat(videoStream.duration) || parseFloat(metadata.format?.duration) || 0;
          width = parseInt(videoStream.width) || 1280;
          height = parseInt(videoStream.height) || 720;
        }

        if (metadata.format && metadata.format.size) {
          fileSize = parseInt(metadata.format.size) || 0;
        }

        duration = duration * 1000;

        if (width <= 0 || height <= 0) {
          width = 1280;
          height = 720;
        }

        if (duration < 0) {
          duration = 0;
        }

        resolve({
          duration,
          width,
          height,
          fileSize
        });

      } catch (parseError) {
        reject(new Error(`Failed to parse video metadata: ${parseError.message}`));
      }
    });
  });
};

const getVideoInfoAlternative = async (url) => {
  try {
    const command = `"${ffprobeInstaller.path}" -v error -select_streams v:0 -show_entries stream=width,height,duration:format=size,duration -of json "${url}"`;
    
    const { stdout, stderr } = await execAsync(command, { 
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });

    if (stderr && stderr.includes('error')) {
      throw new Error(`FFprobe stderr: ${stderr}`);
    }

    const metadata = JSON.parse(stdout);
    
    let duration = 0;
    let width = 1280;
    let height = 720;
    let fileSize = 0;

    if (metadata.streams && metadata.streams.length > 0) {
      const videoStream = metadata.streams[0];
      duration = parseFloat(videoStream.duration) || parseFloat(metadata.format?.duration) || 0;
      width = parseInt(videoStream.width) || 1280;
      height = parseInt(videoStream.height) || 720;
    }

    if (metadata.format && metadata.format.size) {
      fileSize = parseInt(metadata.format.size) || 0;
    }

    return {
      duration: duration * 1000,
      width: width > 0 ? width : 1280,
      height: height > 0 ? height : 720,
      fileSize
    };

  } catch (error) {
    throw new Error(`Alternative video analysis failed: ${error.message}`);
  }
};

export function sendVideov2Factory(api) {
  const directMessageServiceURL = makeURL(`${api.zpwServiceMap.file[0]}/api/message/forward`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
    nretry: 0,
  });
  const groupMessageServiceURL = makeURL(`${api.zpwServiceMap.file[0]}/api/group/forward`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
    nretry: 0,
  });

  return async function sendVideov2({
    videoUrl,
    threadId,
    threadType,
    message = null,
    ttl = 0,
  }) {
    if (!appContext.secretKey) throw new ZaloApiError("Secret key is not available");
    if (!appContext.imei) throw new ZaloApiError("IMEI is not available");
    if (!appContext.cookie) throw new ZaloApiError("Cookie is not available");
    if (!appContext.userAgent) throw new ZaloApiError("User agent is not available");
    
    let fileSize = 0;
    let duration = 0;
    let width = 1280;
    let height = 720;
    let thumbnailUrl = null;

    try {
      let videoInfo;
      try {
        videoInfo = await getVideoInfo(videoUrl, 30000);
      } catch (primaryError) {
        try {
          videoInfo = await getVideoInfoAlternative(videoUrl);
        } catch (alternativeError) {
          videoInfo = {
            duration: 10000,
            width: 1280,
            height: 720,
            fileSize: 1024 * 1024
          };
        }
      }

      duration = videoInfo.duration || 0;
      width = videoInfo.width || 1280;
      height = videoInfo.height || 720;
      fileSize = videoInfo.fileSize || 0;
      
      try {
        thumbnailUrl = videoUrl.replace(/\.[^/.]+$/, ".jpg");
      } catch (urlError) {
        thumbnailUrl = null;
      }

    } catch (error) {
      duration = 10000;
      width = 1280;
      height = 720;
      fileSize = 1024 * 1024;
      thumbnailUrl = null;
    }

    const payload = {
      params: {
        clientId: String(Date.now()),
        ttl: ttl,
        zsource: 704,
        msgType: 5,
        msgInfo: JSON.stringify({
          videoUrl: String(videoUrl),
          thumbUrl: String(thumbnailUrl || ""),
          duration: Number(duration),
          width: Number(width),
          height: Number(height),
          fileSize: Number(fileSize),
          properties: {
            color: -1,
            size: -1,
            type: 1003,
            subType: 0,
            ext: {
              sSrcType: -1,
              sSrcStr: "",
              msg_warning_type: 0,
            },
          },
          title: message ? message.text : "",
        }),
      },
    };

    if (message && message.mention) {
      payload.params.mentionInfo = message.mention;
    }

    let url;
    if (threadType === MessageType.DirectMessage) {
      url = directMessageServiceURL;
      payload.params.toId = String(threadId);
      payload.params.imei = appContext.imei;
    } else if (threadType === MessageType.GroupMessage) {
      url = groupMessageServiceURL;
      payload.params.visibility = 0;
      payload.params.grid = String(threadId);
      payload.params.imei = appContext.imei;
    } else {
      throw new ZaloApiError("Thread type is invalid");
    }

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(payload.params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");

    const response = await request(url, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);
    
    return result.data;
  };
    }
