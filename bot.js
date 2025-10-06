import { spawn, exec } from "child_process"
import path from "path"
import fs from "fs"
import { ensureLogFiles, logManagerBot } from "./src/utils/io-json.js"

const cmdPath = path.join("C:", "Windows", "System32", "cmd.exe")
let botProcess

function runCommand(command, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, shell: "cmd.exe" }, (error, stdout, stderr) => {
      if (error) return reject(error)
      resolve(stdout || stderr)
    })
  })
}

async function autoCommit() {
  try {
    const repoPath = path.resolve(process.cwd())
    await runCommand('git config --global user.email "action@github.com"', repoPath)
    await runCommand('git config --global user.name "GitHub Action"', repoPath)
    await runCommand("git add .", repoPath)
    const excluded = ["package-lock.json", "node_modules", "*.txt"]
    for (const ex of excluded) await runCommand(`git reset ${ex}`, repoPath)
    const diff = await runCommand("git diff --staged --quiet || echo changed", repoPath)
    if (diff.includes("changed")) {
      await runCommand('git commit -m "Auto commit changes"', repoPath)
      await runCommand("git push", repoPath)
      console.log("Auto commit & push done")
    }
  } catch (e) {
    console.error("Auto commit failed:", e.message)
  }
}

function startBot() {
  botProcess = spawn(cmdPath, ["/c", "npm start"], { detached: true, stdio: "ignore" })
  attachBotEvents(botProcess)
  botProcess.unref()
  logManagerBot("Bot started")
  console.log("Bot started")
}

function stopBot() {
  if (botProcess && botProcess.pid) {
    try {
      process.kill(-botProcess.pid)
      logManagerBot("Bot stopped")
      console.log("Bot stopped")
    } catch (err) {
      logManagerBot(`Failed to stop bot: ${err.message}`)
      console.log("Failed to stop bot:", err.message)
    }
  } else {
    logManagerBot("Failed to stop bot: invalid PID")
    console.log("Failed to stop bot: invalid PID")
  }
}

function restartBot() {
  stopBot()
  setTimeout(() => {
    startBot()
    logManagerBot("Bot restarted")
    console.log("Bot restarted")
  }, 1000)
}

function attachBotEvents(botProcess) {
  botProcess.on("error", (err) => {
    logManagerBot(`Bot error: ${err.message}`)
    restartBot()
  })
  botProcess.on("exit", (code) => {
    logManagerBot(`Bot exited: ${code}`)
    restartBot()
  })
}

ensureLogFiles()
startBot()
setInterval(autoCommit, 5 * 60 * 1000)

process.on("SIGINT", () => restartBot())
process.on("SIGTERM", () => restartBot())
process.on("exit", () => setTimeout(startBot, 1000))
