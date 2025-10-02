import schedule from "node-schedule"
import fs from "fs"
import { readGroupSettings, writeGroupSettings } from "../../utils/io-json.js"
import { MessageType } from "../../api-zalo/index.js"
import { getTodayTopWithStats } from "../info-service/rank-chat.js"
import { getRandomVideoFromArray, searchVideoTiktok } from "../api-crawl/tiktok/tiktok-service.js"
import { sendRandomGirlVideo } from "../chat-zalo/chat-special/send-video/send-video.js"

const scheduledTasks = [
  {
    cronExpression: "5 3 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 03:05 <-\nNgày mới chúc các bạn may mắn!\n\n`
      await sendTaskMusic(api, caption, ttl)
    },
  },
  {
    cronExpression: "5 6 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 06:05 <-\nThức dậy cho một ngày mới\nđầy năng lượng thôi nào!\n\nĐón bình minh ngày mới cùng tớ nhé!!!`
      await sendTaskVideo(api, caption, ttl, "ngắm bình minh chill")
    },
  },
  {
    cronExpression: "5 9 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 09:05 <-\nChào buổi sáng\ncùng đón nắng ấm suơng mưa nhé!\n\nGiải trí một chút để bớt căng thẳng thôi nào!!!`
      await sendTaskVideo(api, caption, ttl, "nhạc chill cảnh đẹp")
    },
  },
  {
    cronExpression: "5 10 * * *",
    task: async (api, ttl) => {
      const groupSettings = readGroupSettings()
      for (const threadId of Object.keys(groupSettings)) {
        if (groupSettings[threadId].sendTask) {
          const { totalMessages, topUsers } = getTodayTopWithStats(threadId, 10)
          let msg = `-> SendTask 10:05 <-\nTổng kết tương tác trong ngày 📝\n\n📊 Thống kê tương tác của hôm nay:\n💬 Tổng số tin nhắn: ${totalMessages}\n\n🏆 Top tương tác:\n`
          topUsers.forEach((user, index) => {
            msg += `${index + 1}. ${user.UserName}: ${user.messageCountToday} tin nhắn\n`
          })
          await api.sendMessage(
            { msg, threadId, type: MessageType.GroupMessage, ttl },
            threadId,
            MessageType.GroupMessage
          )
        }
      }
    },
  },
  {
    cronExpression: "5 11 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 11:05 <-\nChào một buổi trưa đầy năng lượng!\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`
      await sendTaskGirlVideo(api, caption, ttl, "sexy")
    },
  },
  {
    cronExpression: "5 12 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 12:05 <-\nChào một buổi trưa đầy năng lượng!\n\nGiải trí với nữ cosplay cho anh em đây!!!`
      await sendTaskGirlVideo(api, caption, ttl, "cosplay")
    },
  },
  {
    cronExpression: "5 13 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 13:05 <-\nChào một buổi trưa đầy năng lượng!\n\nGiải trí anime cho bớt căng não anh em nhé!!!`
      await sendTaskGirlVideo(api, caption, ttl, "anime")
    },
  },
  {
    cronExpression: "5 14 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 14:05 <-\nChào một buổi trưa đầy năng lượng!\n\nCung cấp vitamin gái cho anh em đây!!!`
      await sendTaskGirlVideo(api, caption, ttl)
    },
  },
  {
    cronExpression: "5 15 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 15:05 <-\nChào một buổi xế chiều đầy năng lượng!\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`
      await sendTaskGirlVideo(api, caption, ttl, "sexy")
    },
  },
  {
    cronExpression: "5 16 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 16:05 <-\nChào một buổi xế chiều đầy năng lượng!\n\nGiải trí với nữ cosplay cho anh em đây!!!`
      await sendTaskGirlVideo(api, caption, ttl, "cosplay")
    },
  },
  {
    cronExpression: "5 17 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 17:05 <-\nChúc buổi chiều thật chill và vui vẻ nhé!\n\nĐón hoàng hôn ánh chiều tà thôi nào!!!`
      await sendTaskVideo(api, caption, ttl, "ngắm hoàng hôn chill")
    },
  },
  {
    cronExpression: "5 19 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 19:05 <-\nChúc các bạn một buổi tối vui vẻ bên gia đình!\n\nThư giãn cuối ngày thôi nào!!!`
      await sendTaskVideo(api, caption, ttl, "âm nhạc nhẹ nhàng")
    },
  },
  {
    cronExpression: "5 21 * * *",
    task: async (api, ttl) => {
      const caption = `-> SendTask 21:05 <-\nChúc buổi tối thật thư giãn!\n\nGiải trí với chút âm nhạc thôi nào!!!`
      await sendTaskVideo(api, caption, ttl, "nhạc thư giãn buổi tối")
    },
  },
]

async function sendTaskGirlVideo(api, caption, ttl, type = "default") {
  const groupSettings = readGroupSettings()
  for (const threadId of Object.keys(groupSettings)) {
    if (groupSettings[threadId].sendTask) {
      try {
        const message = { threadId, type: MessageType.GroupMessage }
        await sendRandomGirlVideo(api, message, caption, type, ttl)
      } catch (error) {
        if (error.message && error.message.includes("không tồn tại")) {
          groupSettings[threadId].sendTask = false
          writeGroupSettings(groupSettings)
        }
      }
    }
  }
}

async function sendTaskVideo(api, caption, ttl, query) {
  const chillListVideo = await searchVideoTiktok(query)
  if (chillListVideo) {
    const groupSettings = readGroupSettings()
    for (const threadId of Object.keys(groupSettings)) {
      if (groupSettings[threadId].sendTask) {
        try {
          const message = { threadId, type: MessageType.GroupMessage }
          const videoUrl = await getRandomVideoFromArray(api, message, chillListVideo)
          await api.sendVideo({
            videoUrl,
            threadId: message.threadId,
            threadType: message.type,
            message: { text: caption },
            ttl,
          })
        } catch (error) {
          if (error.message && error.message.includes("không tồn tại")) {
            groupSettings[threadId].sendTask = false
            writeGroupSettings(groupSettings)
          }
        }
      }
    }
  }
}

async function sendTaskMusic(api, caption, ttl) {
  const groupSettings = readGroupSettings()
  for (const threadId of Object.keys(groupSettings)) {
    if (groupSettings[threadId].sendTask) {
      try {
        await api.sendMessage(
          { msg: caption, threadId, type: MessageType.GroupMessage, ttl },
          threadId,
          MessageType.GroupMessage
        )
      } catch (error) {
        if (error.message && error.message.includes("không tồn tại")) {
          groupSettings[threadId].sendTask = false
          writeGroupSettings(groupSettings)
        }
      }
    }
  }
}

export async function initializeScheduler(api) {
  for (let i = 0; i < scheduledTasks.length; i++) {
    const current = scheduledTasks[i]
    const next = scheduledTasks[(i + 1) % scheduledTasks.length]
    const ttlMs = calculateTtlMs(current.cronExpression, next.cronExpression)
    schedule.scheduleJob(current.cronExpression, () => {
      current.task(api, ttlMs).catch((error) => {
        console.error("Lỗi khi thực thi tác vụ định kỳ:", error)
      })
    })
  }
}

function calculateTtlMs(currentCron, nextCron) {
  const now = new Date()
  const currentDate = nextDateFromCron(currentCron, now)
  const nextDate = nextDateFromCron(nextCron, currentDate)
  return nextDate - currentDate
}

function nextDateFromCron(cronExpression, afterDate) {
  const job = schedule.scheduleJob(cronExpression, () => {})
  const nextInvocation = job.nextInvocationDate(afterDate)
  job.cancel()
  return new Date(nextInvocation)
}
