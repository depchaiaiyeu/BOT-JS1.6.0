import ffmpeg from 'fluent-ffmpeg';
import path from "path";
import { tempDir } from "../../../../utils/io-json.js";
import { getVideoMetadata } from "../../../../api-zalo/utils.js";
import { checkExstentionFileRemote, deleteFile, downloadFile } from "../../../../utils/util.js";
import fs from 'fs';
import sharp from 'sharp';
import { sendMessageWarningRequest } from '../../chat-style/chat-style.js';
import { Worker } from 'worker_threads';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createCircleWebp(api, message, imageUrl, idImage) {
    const ext = await checkExstentionFileRemote(imageUrl);
    const downloadedImage = path.join(tempDir, `original_${idImage}.${ext}`);
    const framesDir = path.join(tempDir, `frames_${idImage}`);
    const outputWebp = path.join(tempDir, `circle_${idImage}.webp`);
    try {
        await downloadFile(imageUrl, downloadedImage);

        const size = 512;
        const totalFrames = 160;
        const numWorkers = Math.min(os.cpus().length, totalFrames);
        const framesPerWorker = Math.ceil(totalFrames / numWorkers);

        const resizedImageBuffer = await sharp(downloadedImage)
            .resize(size, size, {
                fit: 'cover',
                position: 'center'
            })
            .toBuffer();

        if (!fs.existsSync(framesDir)) {
            await fs.promises.mkdir(framesDir, { recursive: true });
        }

        const circleMask = Buffer.from(`
    <svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>
`);

        const workers = [];
        const workerPath = path.join(__dirname, 'frame-worker.js');
        
        for (let i = 0; i < numWorkers; i++) {
            const startFrame = i * framesPerWorker;
            const endFrame = Math.min(startFrame + framesPerWorker, totalFrames);

            const worker = new Worker(workerPath, {
                workerData: {
                    startFrame,
                    endFrame,
                    size,
                    totalFrames,
                    framesDir,
                    imageBuffer: resizedImageBuffer,
                    circleMask
                }
            });

            workers.push(new Promise((resolve, reject) => {
                worker.on('message', resolve);
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    }
                });
            }));
        }

        await Promise.all(workers);

        const framePattern = path.join(framesDir, 'frame_%03d.png');
        await convertToWebpMulti(framePattern, outputWebp);

        const [linkUploadZalo, stickerData] = await Promise.all([
            api.uploadAttachment([outputWebp], message.threadId, message.type),
            getVideoMetadata(outputWebp)
        ]);

        const finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
        
        return {
            path: outputWebp,
            url: finalUrl,
            stickerData: stickerData
        };

    } catch (error) {
        console.error("Lỗi khi tạo Webp:", error);
        throw error;
    } finally {
        await deleteFile(downloadedImage);
        await fs.promises.rm(framesDir, { recursive: true, force: true });
        await deleteFile(outputWebp);
    }
}

export async function convertToWebpMulti(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .inputOptions([
                '-framerate', '20'
            ])
            .outputOptions([
                '-c:v', 'libwebp',
                '-lossless', '0',
                '-compression_level', '1',
                '-q:v', '50',
                '-loop', '0',
                '-preset', 'default',
                '-cpu-used', '5',
                '-deadline', 'realtime',
                '-threads', 'auto',
                '-vsync', '0',
                '-t', '8'
            ])
            .save(outputPath)
            .on('end', () => {
                resolve(true);
            })
            .on('error', (err) => {
                console.error('Lỗi khi chuyển đổi sang WebP:', err.message);
                reject(false);
            });
    });
}

export async function createImageWebp(api, message, imageUrl, idImage) {
    const ext = await checkExstentionFileRemote(imageUrl);
    const downloadedImage = path.join(tempDir, `original_${idImage}.${ext}`);
    const outputWebp = path.join(tempDir, `circle_${idImage}.webp`);
    try {
        await downloadFile(imageUrl, downloadedImage);
        
        const size = 512;
        const circleMask = Buffer.from(`
            <svg width="${size}" height="${size}">
                <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
            </svg>
        `);

        const imageBuffer = await fs.promises.readFile(downloadedImage);
        await sharp(imageBuffer)
            .resize(size, size, {
                fit: 'cover',
                position: 'center'
            })
            .composite([{
                input: circleMask,
                blend: 'dest-in'
            }])
            .toFile(outputWebp);

        const [linkUploadZalo, stickerData] = await Promise.all([
            api.uploadAttachment([outputWebp], message.threadId, message.type),
            getVideoMetadata(outputWebp)
        ]);

        const finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;

        return {
            path: outputWebp,
            url: finalUrl,
            stickerData: stickerData
        };
    } catch (error) {
        console.error("Lỗi khi tạo Webp:", error);
        const object = {
            caption: `Đã xảy ra lỗi khi xử lý hình ảnh!`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return null;
    } finally {
        await deleteFile(downloadedImage);
        await deleteFile(outputWebp);
    }
}

export async function convertToWebp(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-vf', 'scale=512:-2:flags=fast_bilinear',
                '-c:v', 'libwebp',
                '-lossless', '0',
                '-compression_level', '6',
                '-q:v', '60',
                '-loop', '0',
                '-preset', 'default',
                '-cpu-used', '4',
                '-deadline', 'realtime',
                '-threads', 'auto',
                '-an',
                '-vsync', '0'
            ])
            .save(outputPath)
            .on('end', () => {
                resolve(true);
            })
            .on('error', (err) => {
                console.error('Lỗi khi chuyển đổi sang WebP:', err.message);
                reject(false);
            });
    });
}