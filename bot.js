/*@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
                   _ooOoo_
                  o8888888o
                  88" . "88
                  (| -_- |)
                  O\  =  /O
               ____/`---'\____
             .'  \\|     |//  `.
            /  \\|||  :  |||//  \
           /  _||||| -:- |||||-  \
           |   | \\\  -  /// |   |
           | \_|  ''\---/''  |   |
           \  .-\__  `-`  ___/-. /
         ___`. .'  /--.--\  `. . __
      ."" '<  `.___\_<|>_/___.'  >'"".
     | | :  `- \`.;`\ _ /`;.`/ - ` : | |
     \  \ `-.   \_ __\ /__ _/   .-` /  /
======`-.____`-.___\_____/___.-`____.-'======
                   `=---='
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  PHẬT ĐỘ, CODE KHÔNG LỖI, TỐI ƯU KHÔNG BUG
            DEVELOPER: NDQ x LQT BY 1.6.0
    UPGRADE: Hà Huy Hoàng 1.6.0 => ...
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@*/

import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ensureLogFiles, logManagerBot } from './src/utils/io-json.js';

const cmdPath = path.join('C:', 'Windows', 'System32', 'cmd.exe');
let botProcess;

function startBot() {
  botProcess = spawn(cmdPath, ['/c', 'npm start'], {
    detached: true,
    stdio: 'ignore'
  });
  attachBotEvents(botProcess);
  botProcess.unref();
  logManagerBot('Bot started');
  console.log('Bot started');
}

function stopBot() {
  if (botProcess && botProcess.pid) {
    exec(`taskkill /PID ${botProcess.pid} /T /F`, (err) => {
      if (err) {
        logManagerBot(`Failed to stop bot: ${err.message}`);
        console.log('Failed to stop bot:', err.message);
      } else {
        logManagerBot('Bot stopped');
        console.log('Bot stopped');
      }
    });
  } else {
    logManagerBot('Failed to stop bot: invalid PID');
    console.log('Failed to stop bot: invalid PID');
  }
}

function restartBot() {
  stopBot();
  setTimeout(() => {
    startBot();
    logManagerBot('Bot restarted');
    console.log('Bot restarted');
  }, 3000);
}

ensureLogFiles();
startBot();

function attachBotEvents(proc) {
  proc.on('error', (err) => {
    logManagerBot(`Bot error: ${err.message}`);
    console.error('Bot error:', err.message);
    setTimeout(restartBot, 3000);
  });

  proc.on('exit', (code) => {
    logManagerBot(`Bot exited with code: ${code}`);
    console.log('Bot exited with code:', code);
    setTimeout(restartBot, 3000);
  });
}

// ========== AUTO COMMIT & PUSH CHANGES ==========
function autoCommitPush() {
  exec('git status --porcelain', (err, stdout) => {
    if (err) {
      console.log('Git status failed:', err.message);
      return;
    }

    const changedFiles = stdout
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => line.slice(3).trim())
      .filter(f => !f.startsWith('node_modules') && !f.endsWith('.txt'));

    if (changedFiles.length === 0) {
      console.log('No changes to commit.');
      return;
    }

    console.log('Detected changes:', changedFiles.join(', '));

    exec('git add .', (err) => {
      if (err) {
        console.log('Git add failed:', err.message);
        return;
      }

      const commitMsg = `Auto commit at ${new Date().toLocaleString()}`;
      exec(`git commit -m "${commitMsg}"`, (err) => {
        if (err) {
          console.log('Git commit failed:', err.message);
          return;
        }

        exec('git push', (err) => {
          if (err) {
            console.log('Git push failed:', err.message);
          } else {
            console.log('✅ Auto commit & push completed successfully.');
            logManagerBot('Auto commit & push success.');
          }
        });
      });
    });
  });
}

// Kiểm tra thay đổi mỗi 5 phút (300000 ms)
setInterval(() => {
  autoCommitPush();
}, 300000);

// ================================================

setInterval(() => {
  // restartBot();
}, 1800000); // 30 phút

process.on('SIGINT', () => {
  logManagerBot('Bot stopped by user (SIGINT). Restarting...');
  console.log('Bot stopped by user (SIGINT). Restarting...');
  restartBot();
});

process.on('SIGTERM', () => {
  logManagerBot('Bot stopped (SIGTERM). Restarting...');
  console.log('Bot stopped (SIGTERM). Restarting...');
  restartBot();
});
