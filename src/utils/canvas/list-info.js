import { createCanvas, registerFont } from 'canvas';
import fs from 'fs';
import path from 'path';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

registerFont(path.resolve(__dirname, "../../../assets/fonts/NotoEmoji-Bold.ttf"), { family: "NotoEmoji" });

export async function createAdminListImage(highLevelAdminList, groupAdminList, imagePath) {
  const width = 930;
  let yTemp = 300;
  const lineHeight = 32;
  yTemp += (highLevelAdminList.length + groupAdminList.length) * lineHeight;
  const height = yTemp > 300 ? yTemp : 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, '#3B82F6');
  backgroundGradient.addColorStop(1, '#111827');
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.font = 'bold 32px Tahoma, NotoEmoji';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  const titleY = 40;
  ctx.fillText("Danh sách Quản trị Cấp Cao của Bot", width / 2, titleY);

  let yPosition = titleY + 40;
  ctx.font = 'bold 24px Tahoma, NotoEmoji';
  highLevelAdminList.forEach((line, index) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${index + 1}. ${line}`, 20, yPosition);
    yPosition += lineHeight;
  });

  const groupTitleY = yPosition + 40;
  ctx.fillText("Danh sách Quản trị viên của Nhóm", width / 2, groupTitleY);

  yPosition = groupTitleY + 40;
  groupAdminList.forEach((line, index) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${index + 1}. ${line}`, 20, yPosition);
    yPosition += lineHeight;
  });

  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(imagePath, buffer);
}
