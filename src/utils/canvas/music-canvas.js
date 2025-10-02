import { createCanvas, loadImage } from "canvas";
import * as cv from "./index.js";
import path from "path";
import fsPromises from "fs/promises";
import { loadImageBuffer } from "../util.js";
import { formatStatistic } from "../format-util.js";

const CARD_WIDTH = 700;
const PADDING = 25;

const THUMB_SIZE = 160;
const THUMB_BORDER_WIDTH = 4;
const THUMB_SHADOW_BLUR = 10;
const THUMB_SHADOW_OFFSET = 4;

const ICON_SIZE = 45;
const ICON_BORDER_WIDTH = 2;
const ICON_BORDER_COLOR = 'rgba(255, 255, 255, 0.8)';

const AVATAR_SIZE = 75;
const AVATAR_BORDER_WIDTH = 3;
const AVATAR_SHADOW_BLUR = 8;
const AVATAR_SHADOW_OFFSET = 3;

const QUALITY_BADGE_HEIGHT = 30;
const QUALITY_BADGE_FONT_SIZE = 13;

const FONT_FAMILY = "BeVietnamPro";
const TITLE_FONT_SIZE = 28;
const ARTIST_FONT_SIZE = 22;
const SOURCE_FONT_SIZE = 18;
const STATS_FONT_SIZE = 20;
const CREDIT_FONT_SIZE = 9;

const TEXT_SHADOW_COLOR = 'rgba(0, 0, 0, 0.6)';
const TEXT_SHADOW_BLUR = 4;
const TEXT_SHADOW_OFFSET = 1;

const TITLE_SPACING_FACTOR = 0.5;
const ARTIST_SPACING_FACTOR = 0.7;
const SOURCE_SPACING_FACTOR = 1.2;
const STATS_SPACING_FACTOR = 0;

const dataIconPlatform = {
    "zingmp3": {
        "linkIcon": "https://static-zmp3.zmdcdn.me/skins/zmp3-mobile-v5.2/images/favicon192.png",
        "shape": "circle"
    },
    "youtube": {
        "linkIcon": "https://www.youtube.com/s/desktop/c01ea7e3/img/logos/favicon_144x144.png",
        "shape": "rectangle"
    },
    "soundcloud": {
        "linkIcon": "https://a-v2.sndcdn.com/assets/images/sc-icons/ios-a62dfc8fe7.png",
        "shape": "circle"
    },
    "nhaccuatui": {
        "linkIcon": "https://stc-id.nixcdn.com/v11/images/logo_600x600.png",
        "shape": "circle"
    },
    "tiktok": {
        "linkIcon": "https://sf-static.tiktokcdn.com/obj/eden-sg/uhtyvueh7nulogpoguhm/tiktok-icon2.png",
        "shape": "circle"
    }
};

function drawDefaultBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#3a4a5a");
    gradient.addColorStop(1, "#2c3e50");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

function truncateText(ctx, text, font, maxWidth) {
    ctx.font = font;
    let width = ctx.measureText(text).width;
    const ellipsis = "...";
    const ellipsisWidth = ctx.measureText(ellipsis).width;

    if (width <= maxWidth) {
        return text;
    }

    let truncated = text;
    while (width + ellipsisWidth > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
        width = ctx.measureText(truncated).width;
    }
    return truncated + ellipsis;
}

const drawTextWithShadow = (ctx, text, x, y, font, maxWidth = null) => {
    ctx.save();
    ctx.font = font;
    ctx.shadowColor = TEXT_SHADOW_COLOR;
    ctx.shadowBlur = TEXT_SHADOW_BLUR;
    ctx.shadowOffsetX = TEXT_SHADOW_OFFSET;
    ctx.shadowOffsetY = TEXT_SHADOW_OFFSET;
    if (maxWidth) {
        ctx.fillText(text, x, y, maxWidth);
    } else {
        ctx.fillText(text, x, y);
    }
    ctx.restore();
};

export async function createMusicCard(musicInfo) {

    let estimatedHeight = PADDING;
    estimatedHeight += TITLE_FONT_SIZE;
    estimatedHeight += TITLE_FONT_SIZE * TITLE_SPACING_FACTOR;
    estimatedHeight += ARTIST_FONT_SIZE;
    estimatedHeight += ARTIST_FONT_SIZE * ARTIST_SPACING_FACTOR;
    estimatedHeight += SOURCE_FONT_SIZE;
    estimatedHeight += SOURCE_FONT_SIZE * SOURCE_SPACING_FACTOR;

    const stats = [
        { icon: "🎧", value: formatStatistic(musicInfo.listen) },
        { icon: "👀", value: formatStatistic(musicInfo.viewCount) },
        { icon: "💜", value: formatStatistic(musicInfo.like) },
        { icon: "💬", value: formatStatistic(musicInfo.comment) },
        { icon: "🔗", value: formatStatistic(musicInfo.share) },
        { icon: "📅", value: musicInfo.publishedTime ? formatStatistic(musicInfo.publishedTime) : null }
    ].filter(stat => stat.value !== null && stat.value !== undefined && String(stat.value).trim() !== '');

    if (stats.length > 0) {
        estimatedHeight += STATS_FONT_SIZE;
        estimatedHeight += STATS_FONT_SIZE * STATS_SPACING_FACTOR;
    }

    estimatedHeight += CREDIT_FONT_SIZE + PADDING / 2;
    estimatedHeight += PADDING;

    const minHeightForElements = Math.max(
        THUMB_SIZE + PADDING * 2,
        AVATAR_SIZE + PADDING * 2,
        CREDIT_FONT_SIZE + PADDING * 1.5
    );

    const finalHeight = Math.ceil(Math.max(minHeightForElements, estimatedHeight));

    const canvas = createCanvas(CARD_WIDTH, finalHeight);
    const ctx = canvas.getContext("2d");

    try {
        let thumbnailImage = null;
        if (musicInfo.thumbnailPath) {
            try {
                const processedThumbnail = await loadImageBuffer(musicInfo.thumbnailPath);
                if (processedThumbnail) {
                    thumbnailImage = await loadImage(processedThumbnail);

                    ctx.save();
                    ctx.filter = 'blur(18px)';
                    const bgScale = 1.15;
                    const bgWidth = CARD_WIDTH * bgScale;
                    const bgHeight = finalHeight * bgScale;
                    ctx.drawImage(thumbnailImage, -(bgWidth - CARD_WIDTH) / 2, -(bgHeight - finalHeight) / 2, bgWidth, bgHeight);
                    ctx.restore();

                    const overlay = ctx.createLinearGradient(0, 0, 0, finalHeight);
                    overlay.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
                    overlay.addColorStop(0.6, 'rgba(0, 0, 0, 0.65)');
                    overlay.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
                    ctx.fillStyle = overlay;
                    ctx.fillRect(0, 0, CARD_WIDTH, finalHeight);

                } else {
                    drawDefaultBackground(ctx, CARD_WIDTH, finalHeight);
                }
            } catch (thumbError) {
                console.error("Lỗi khi xử lý thumbnail:", thumbError);
                drawDefaultBackground(ctx, CARD_WIDTH, finalHeight);
            }
        } else {
            drawDefaultBackground(ctx, CARD_WIDTH, finalHeight);
        }

        if (thumbnailImage) {
            const thumbX = PADDING;
            const thumbY = (finalHeight - THUMB_SIZE) / 2;
            const thumbCenterX = thumbX + THUMB_SIZE / 2;
            const thumbCenterY = thumbY + THUMB_SIZE / 2;

            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = THUMB_SHADOW_BLUR + 2;
            ctx.shadowOffsetX = THUMB_SHADOW_OFFSET;
            ctx.shadowOffsetY = THUMB_SHADOW_OFFSET + 1;

            ctx.beginPath();
            ctx.arc(thumbCenterX, thumbCenterY, THUMB_SIZE / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(thumbnailImage, thumbX, thumbY, THUMB_SIZE, THUMB_SIZE);
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = cv.getRandomGradient(ctx, CARD_WIDTH);
            ctx.lineWidth = THUMB_BORDER_WIDTH;
            ctx.beginPath();
            ctx.arc(thumbCenterX, thumbCenterY, THUMB_SIZE / 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            const qualityText = musicInfo.quality || "Standard Quality";
            const qualityFont = `${QUALITY_BADGE_FONT_SIZE}px ${FONT_FAMILY}`;
            ctx.font = qualityFont;
            const qualityTextWidth = ctx.measureText(qualityText).width;
            const qualityBadgeWidth = qualityTextWidth + 20;
            const qualityBadgeX = thumbX;
            const qualityBadgeY = thumbY + THUMB_SIZE - QUALITY_BADGE_HEIGHT;

            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.beginPath();
            ctx.roundRect(qualityBadgeX, qualityBadgeY, qualityBadgeWidth, QUALITY_BADGE_HEIGHT, 6);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.fillStyle = 'white';
            ctx.font = qualityFont;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(qualityText, qualityBadgeX + qualityBadgeWidth / 2, qualityBadgeY + QUALITY_BADGE_HEIGHT / 2);
            ctx.restore();

            const source = musicInfo.source?.toLowerCase() || "zingmp3";
            const dataIcon = dataIconPlatform[source];

            if (dataIcon) {
                try {
                    const iconX = thumbX + THUMB_SIZE - ICON_SIZE * 1.1;
                    const iconY = thumbY + THUMB_SIZE - ICON_SIZE * 1.1;
                    const iconCenterX = iconX + ICON_SIZE / 2;
                    const iconCenterY = iconY + ICON_SIZE / 2;

                    ctx.save();
                    ctx.fillStyle = ICON_BORDER_COLOR;
                    ctx.beginPath();
                    if (dataIcon.shape === 'rectangle') {
                        const borderRadius = 8;
                        ctx.roundRect(iconX - ICON_BORDER_WIDTH, iconY - ICON_BORDER_WIDTH, ICON_SIZE + 2 * ICON_BORDER_WIDTH, ICON_SIZE + 2 * ICON_BORDER_WIDTH, borderRadius + ICON_BORDER_WIDTH);
                    } else {
                        ctx.arc(iconCenterX, iconCenterY, ICON_SIZE / 2 + ICON_BORDER_WIDTH, 0, Math.PI * 2);
                    }
                    ctx.fill();
                    ctx.restore();

                    ctx.save();
                    ctx.beginPath();
                    if (dataIcon.shape === 'rectangle') {
                        const borderRadius = 8;
                        ctx.roundRect(iconX, iconY, ICON_SIZE, ICON_SIZE, borderRadius);
                    } else {
                        ctx.arc(iconCenterX, iconCenterY, ICON_SIZE / 2, 0, Math.PI * 2);
                    }
                    ctx.clip();
                    const icon = await loadImage(dataIcon.linkIcon);
                    ctx.drawImage(icon, iconX, iconY, ICON_SIZE, ICON_SIZE);
                    ctx.restore();

                } catch (iconError) {
                    console.error("Lỗi khi vẽ icon nguồn nhạc:", iconError);
                }
            }
        }

        const textX = PADDING + (thumbnailImage ? THUMB_SIZE : 0) + PADDING;
        const maxTextWidth = CARD_WIDTH - textX - PADDING;
        let currentY = PADDING + 5;

        const title = musicInfo.title || "Unknown Title";
        const titleFont = `bold ${TITLE_FONT_SIZE}px ${FONT_FAMILY}`;
        const truncatedTitle = truncateText(ctx, title, titleFont, maxTextWidth);
        currentY += TITLE_FONT_SIZE;
        ctx.fillStyle = cv.getRandomGradient(ctx, CARD_WIDTH);
        drawTextWithShadow(ctx, truncatedTitle, textX, currentY, titleFont, maxTextWidth);
        currentY += TITLE_FONT_SIZE * TITLE_SPACING_FACTOR;

        const artistText = musicInfo.artists || "Unknown Artist";
        const artistFont = `${ARTIST_FONT_SIZE}px ${FONT_FAMILY}`;
        const truncatedArtist = truncateText(ctx, artistText, artistFont, maxTextWidth);
        currentY += ARTIST_FONT_SIZE;
        ctx.fillStyle = cv.getRandomGradient(ctx, CARD_WIDTH);
        drawTextWithShadow(ctx, truncatedArtist, textX, currentY, artistFont, maxTextWidth);
        currentY += ARTIST_FONT_SIZE * ARTIST_SPACING_FACTOR;

        const sourceText = `From ${musicInfo.source || "ZingMp3"}${musicInfo.rank ? ` - 🏆 Top ${musicInfo.rank}` : ""}`;
        const sourceFont = `${SOURCE_FONT_SIZE}px ${FONT_FAMILY}`;
        const truncatedSource = truncateText(ctx, sourceText, sourceFont, maxTextWidth);
        currentY += SOURCE_FONT_SIZE;
        ctx.fillStyle = cv.getRandomGradient(ctx, CARD_WIDTH);
        drawTextWithShadow(ctx, truncatedSource, textX, currentY, sourceFont, maxTextWidth);
        currentY += SOURCE_FONT_SIZE * SOURCE_SPACING_FACTOR;

        if (stats.length > 0) {
            currentY += STATS_FONT_SIZE;
            const statsFont = `${STATS_FONT_SIZE}px ${FONT_FAMILY}`;
            ctx.font = statsFont;
            const statSpacing = 15;
            let currentX = textX;

            ctx.fillStyle = cv.getRandomGradient(ctx, CARD_WIDTH);
            stats.forEach((stat) => {
                const statText = `${stat.icon} ${stat.value}`;
                const statWidth = ctx.measureText(statText).width;
                if (currentX + statWidth <= CARD_WIDTH - PADDING) {
                    drawTextWithShadow(ctx, statText, currentX, currentY, statsFont);
                    currentX += statWidth + statSpacing;
                } else {
                    return;
                }
            });
        }

        if (musicInfo.userAvatar) {
            try {
                const avatar = await loadImage(musicInfo.userAvatar);
                const avatarX = CARD_WIDTH - PADDING - AVATAR_SIZE;
                const avatarY = finalHeight - PADDING - AVATAR_SIZE;
                const avatarCenterX = avatarX + AVATAR_SIZE / 2;
                const avatarCenterY = avatarY + AVATAR_SIZE / 2;

                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = AVATAR_SHADOW_BLUR;
                ctx.shadowOffsetX = AVATAR_SHADOW_OFFSET;
                ctx.shadowOffsetY = AVATAR_SHADOW_OFFSET;

                ctx.fillStyle = cv.getRandomGradient(ctx, CARD_WIDTH);
                ctx.beginPath();
                ctx.arc(avatarCenterX, avatarCenterY, AVATAR_SIZE / 2 + AVATAR_BORDER_WIDTH, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarCenterX, avatarCenterY, AVATAR_SIZE / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatar, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
                ctx.restore();

            } catch (avatarError) {
                console.error("Lỗi khi vẽ avatar người dùng:", avatarError);
            }
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, CARD_WIDTH - 1, finalHeight - 1);

    } catch (error) {
        console.error("Lỗi nghiêm trọng khi tạo music card:", error);
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, CARD_WIDTH, finalHeight);
        ctx.font = '20px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText('Error generating card', CARD_WIDTH / 2, finalHeight / 2);
    }

    const tempDir = path.resolve('./assets/temp');
    try {
        await fsPromises.mkdir(tempDir, { recursive: true });
    } catch (dirError) {
        if (dirError.code !== 'EEXIST') {
            console.error("Không thể tạo thư mục temp:", dirError);
            throw dirError;
        }
    }

    const filePath = path.join(tempDir, `music_${Date.now()}.png`);
    await fsPromises.writeFile(filePath, canvas.toBuffer("image/png"));
    return filePath;
}
