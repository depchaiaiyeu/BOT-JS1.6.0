import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

/**
 * Tạo ảnh từ danh sách quản trị viên (cả danh sách quản trị viên cấp cao và nhóm).
 * @param {Array} highLevelAdminList - Danh sách quản trị viên cấp cao.
 * @param {Array} groupAdminList - Danh sách quản trị viên nhóm.
 * @param {string} imagePath - Đường dẫn để lưu ảnh.
 * @returns {Promise<void>} - Promise khi lưu xong ảnh.
 */
export async function createAdminListImage(highLevelAdminList, groupAdminList, imagePath) {
  const width = 930;
  let yTemp = 300;
  const lineHeight = 32;

  // Tính chiều cao của ảnh dựa trên số lượng quản trị viên cấp cao và nhóm
  yTemp += (highLevelAdminList.length + groupAdminList.length) * lineHeight;

  // Tính chiều cao ảnh tối thiểu là 300px
  const height = yTemp > 300 ? yTemp : 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Áp dụng nền với gradient
  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, '#3B82F6');
  backgroundGradient.addColorStop(1, '#111827');
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  // Vẽ tiêu đề cho danh sách quản trị viên cấp cao
  ctx.font = 'bold 32px Tahoma';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  const titleY = 40;
  ctx.fillText("Danh sách Quản trị Cấp Cao của Bot", width / 2, titleY);

  // Vẽ danh sách quản trị viên cấp cao
  let yPosition = titleY + 40;
  ctx.font = 'bold 24px Tahoma';
  highLevelAdminList.forEach((line, index) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${index + 1}. ${line}`, 20, yPosition);
    yPosition += lineHeight;
  }

  // Vẽ tiêu đề cho danh sách quản trị viên nhóm
  const groupTitleY = yPosition + 40;
  ctx.fillText("Danh sách Quản trị viên của Nhóm", width / 2, groupTitleY);

  // Vẽ danh sách quản trị viên nhóm
  yPosition = groupTitleY + 40;
  groupAdminList.forEach((line, index) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${index + 1}. ${line}`, 20, yPosition);
    yPosition += lineHeight;
  }

  // Lưu ảnh vào file
  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(imagePath, buffer);
}
