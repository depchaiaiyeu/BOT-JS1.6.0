import { spawn, exec } from "child_process"
import path from "path"
import { ensureLogFiles, logManagerBot } from "./src/utils/io-json.js"

const cmdPath = path.join("C:", "Windows", "System32", "cmd.exe")
const GITHUB_TOKEN = "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"
let botProcess

function runCommand(command, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, shell: "cmd.exe", maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message))
      resolve(stdout || stderr)
    })
  })
}

async function cancelPreviousWorkflows() {
  try {
    const repoPath = path.resolve(process.cwd())
    const owner = "depchaiyeu"
    const repo = "BOT-JS1.6.0"
    const currentRunId = process.env.GITHUB_RUN_ID

    console.log(`Checking for previous workflows in ${owner}/${repo}`)

    const statuses = ["in_progress", "queued", "waiting"]
    const allRuns = []

    for (const status of statuses) {
      const listCmd = `curl -s -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${owner}/${repo}/actions/runs?status=${status}&per_page=100"`
      const result = await runCommand(listCmd, repoPath)
      const data = JSON.parse(result)
      if (data.workflow_runs && data.workflow_runs.length > 0) {
        allRuns.push(...data.workflow_runs)
      }
    }

    const completedCmd = `curl -s -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${owner}/${repo}/actions/runs?status=completed&per_page=100"`
    const completedResult = await runCommand(completedCmd, repoPath)
    const completedData = JSON.parse(completedResult)
    
    if (completedData.workflow_runs && completedData.workflow_runs.length > 0) {
      const failedRuns = completedData.workflow_runs.filter(run => 
        run.conclusion === "failure" || 
        run.conclusion === "cancelled" || 
        run.conclusion === "timed_out" ||
        run.conclusion === "action_required"
      )
      allRuns.push(...failedRuns)
    }

    if (allRuns.length === 0) {
      console.log("No workflows found to cancel or delete")
      return
    }

    for (const run of allRuns) {
      if (currentRunId && run.id.toString() === currentRunId) {
        console.log(`Skipping current workflow run #${run.id}`)
        continue
      }

      console.log(`Processing workflow run #${run.id} (${run.name}) - Status: ${run.status}, Conclusion: ${run.conclusion || 'N/A'}`)
      
      if (run.status !== "completed") {
        console.log(`Canceling workflow run #${run.id}`)
        const cancelCmd = `curl -s -X POST -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/cancel"`
        await runCommand(cancelCmd, repoPath)
        
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        let attempts = 0
        while (attempts < 10) {
          const statusCmd = `curl -s -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}"`
          const statusResult = await runCommand(statusCmd, repoPath)
          const runStatus = JSON.parse(statusResult)
          
          if (runStatus.status === "completed") {
            console.log(`Workflow run #${run.id} is now completed`)
            break
          }
          
          attempts++
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
      
      console.log(`Deleting workflow run #${run.id}`)
      const deleteCmd = `curl -s -X DELETE -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}"`
      await runCommand(deleteCmd, repoPath)
      
      console.log(`Successfully processed workflow run #${run.id}`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  } catch (e) {
    console.error("Cancel previous workflows failed:", e.message)
  }
}

async function autoCommit() {
  try {
    const repoPath = path.resolve(process.cwd())
    await runCommand('git config --global user.email "action@github.com"', repoPath)
    await runCommand('git config --global user.name "GitHub Action"', repoPath)
    const excludeList = [
      "node_modules",
      "package-lock.json",
      "*.txt",
      "*.log",
      "*.cache",
      "*.zip",
      "*.rar",
      ".gitignore",
      "message.json"
    ]
    const excludeArgs = excludeList.map(x => `:(exclude)${x}`).join(" ")
    await runCommand(`git add :/ ${excludeArgs}`, repoPath)
    const diff = await runCommand("git diff --staged --quiet || echo changed", repoPath)
    if (!diff.includes("changed")) {
      console.log("No changes to commit")
      return
    }
    await runCommand('git commit -m "Auto commit changes"', repoPath)
    try {
      await runCommand("git push", repoPath)
      console.log("Auto commit & push done")
    } catch (err) {
      if (err.message.includes("fetch first") || err.message.includes("rejected")) {
        console.log("Push rejected, pulling latest changes...")
        await runCommand("git fetch origin main", repoPath)
        await runCommand("git rebase origin/main", repoPath)
        await runCommand("git push", repoPath)
        console.log("Auto commit after rebase done")
      } else {
        throw err
      }
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

async function main() {
  await cancelPreviousWorkflows()
  ensureLogFiles()
  startBot()
  setInterval(autoCommit, 5 * 6 * 1000)
  process.on("SIGINT", () => restartBot())
  process.on("SIGTERM", () => restartBot())
  process.on("exit", () => setTimeout(startBot, 1000))
}

main()
