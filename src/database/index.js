import mysql from "mysql2/promise";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import https from "https";
import { createWriteStream } from "fs";
import AdmZip from "adm-zip";
import { claimDailyReward, getMyCard } from "./player.js";
import { getTopPlayers } from "./jdbc.js";

export * from "./player.js";
export * from "./jdbc.js";

const execAsync = promisify(exec);

let nameServer = "";
let connection;
let NAME_TABLE_PLAYERS;
let NAME_TABLE_ACCOUNT;
let DAILY_REWARD;

async function loadConfig() {
  const configPath = path.join(
    process.cwd(),
    "assets",
    "json-data",
    "database-config.json"
  );
  const configFile = await fs.readFile(configPath, "utf8");
  return JSON.parse(configFile);
}

export async function getNameServer() {
  const config = await loadConfig();
  return config.nameServer;
}

export function updateNameServer(newName) {
  nameServer = newName;
}

// Download file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(dest);
      reject(err);
    });
  });
}

// Tự động tải và cài đặt MySQL Portable
async function autoInstallMySQL() {
  try {
    console.log(chalk.yellow("\n⏳ Đang tự động cài đặt MySQL Portable..."));
    
    const mysqlDir = path.join(process.cwd(), "mysql-portable");
    const zipFile = path.join(process.cwd(), "mysql.zip");
    
    // Tạo thư mục nếu chưa có
    await fs.mkdir(mysqlDir, { recursive: true });
    
    // URL MySQL Portable (winx64 no install)
    const downloadUrl = "https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.40-winx64.zip";
    
    console.log(chalk.blue("📥 Đang tải MySQL... (có thể mất vài phút)"));
    await downloadFile(downloadUrl, zipFile);
    
    console.log(chalk.blue("📦 Đang giải nén MySQL..."));
    const zip = new AdmZip(zipFile);
    zip.extractAllTo(mysqlDir, true);
    
    // Xóa file zip
    await fs.unlink(zipFile);
    
    // Tìm thư mục MySQL đã giải nén
    const files = await fs.readdir(mysqlDir);
    const mysqlFolder = files.find(f => f.startsWith("mysql-"));
    const mysqlPath = path.join(mysqlDir, mysqlFolder);
    
    // Tạo file my.ini
    const myIniContent = `[mysqld]
basedir=${mysqlPath.replace(/\\/g, "/")}
datadir=${mysqlPath.replace(/\\/g, "/")}/data
port=3306
bind-address=127.0.0.1
max_connections=200`;
    
    await fs.writeFile(path.join(mysqlPath, "my.ini"), myIniContent);
    
    // Khởi tạo data directory
    console.log(chalk.blue("🔧 Đang khởi tạo MySQL..."));
    const binPath = path.join(mysqlPath, "bin");
    await execAsync(`"${path.join(binPath, "mysqld.exe")}" --initialize-insecure --console`, {
      cwd: mysqlPath
    });
    
    // Khởi động MySQL
    console.log(chalk.blue("🚀 Đang khởi động MySQL..."));
    exec(`"${path.join(binPath, "mysqld.exe")}" --console`, { cwd: mysqlPath });
    
    // Đợi MySQL khởi động
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(chalk.green("✓ MySQL đã được cài đặt và khởi động thành công!"));
    console.log(chalk.cyan(`📁 MySQL được cài tại: ${mysqlPath}`));
    console.log(chalk.cyan(`🔑 User: root | Password: (trống)`));
    
    return {
      host: "localhost",
      user: "root",
      password: "",
      port: 3306,
      binPath: binPath
    };
    
  } catch (error) {
    console.error(chalk.red("❌ Lỗi khi cài đặt MySQL:"), error.message);
    throw error;
  }
}

// Kiểm tra MySQL có đang chạy không
async function checkMySQLRunning(host = "localhost", port = 3306) {
  try {
    const testConn = await mysql.createConnection({
      host: host,
      port: port,
      user: "root",
      password: "",
      connectTimeout: 2000,
    });
    await testConn.end();
    return true;
  } catch (error) {
    return false;
  }
}

// Khởi động MySQL portable nếu đã cài
async function startPortableMySQL() {
  try {
    const mysqlDir = path.join(process.cwd(), "mysql-portable");
    const files = await fs.readdir(mysqlDir);
    const mysqlFolder = files.find(f => f.startsWith("mysql-"));
    
    if (!mysqlFolder) return false;
    
    const mysqlPath = path.join(mysqlDir, mysqlFolder);
    const binPath = path.join(mysqlPath, "bin");
    const mysqldPath = path.join(binPath, "mysqld.exe");
    
    // Kiểm tra file có tồn tại
    await fs.access(mysqldPath);
    
    console.log(chalk.blue("🚀 Đang khởi động MySQL Portable..."));
    exec(`"${mysqldPath}" --console`, { cwd: mysqlPath });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    return true;
  } catch (error) {
    return false;
  }
}

export async function initializeDatabase() {
  try {
    const config = await loadConfig();

    nameServer = config.nameServer;
    NAME_TABLE_PLAYERS = config.tablePlayerZalo;
    NAME_TABLE_ACCOUNT = config.tableAccount;
    DAILY_REWARD = config.dailyReward;

    // Bước 1: Kiểm tra MySQL đang chạy
    console.log(chalk.blue("🔍 Đang kiểm tra MySQL..."));
    let isRunning = await checkMySQLRunning(config.host, config.port);
    
    if (!isRunning) {
      console.log(chalk.yellow("⚠️  MySQL chưa chạy."));
      
      // Bước 2: Thử khởi động MySQL portable nếu đã cài
      const portableStarted = await startPortableMySQL();
      
      if (portableStarted) {
        isRunning = await checkMySQLRunning(config.host, config.port);
      }
      
      // Bước 3: Nếu vẫn không chạy, tự động cài đặt
      if (!isRunning) {
        console.log(chalk.yellow("💾 Đang tự động cài đặt MySQL..."));
        const mysqlConfig = await autoInstallMySQL();
        
        // Cập nhật config
        config.host = mysqlConfig.host;
        config.user = mysqlConfig.user;
        config.password = mysqlConfig.password;
        config.port = mysqlConfig.port;
        
        // Lưu lại config
        const configPath = path.join(
          process.cwd(),
          "assets",
          "json-data",
          "database-config.json"
        );
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      }
    }

    console.log(chalk.green("✓ MySQL đang chạy!"));

    // Tạo kết nối tạm thời không cần chọn database
    const tempConnection = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
      connectTimeout: 10000,
    });

    // Tạo database nếu chưa tồn tại
    await tempConnection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\``
    );
    console.log(chalk.green(`✓ Database '${config.database}' đã sẵn sàng`));

    // Đóng kết nối tạm thời
    await tempConnection.end();

    // Tạo pool connection với database đã chọn
    connection = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const [tablesAccount] = await connection.execute(
      `SHOW TABLES LIKE '${NAME_TABLE_ACCOUNT}'`
    );
    if (tablesAccount.length === 0) {
      await connection.execute(`
            CREATE TABLE IF NOT EXISTS ${NAME_TABLE_ACCOUNT} (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT false,
                vnd BIGINT DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
      console.log(`✓ Đã kiểm tra/tạo bảng ${NAME_TABLE_ACCOUNT}`);
    }

    const [tables] = await connection.execute(
      `SHOW TABLES LIKE '${NAME_TABLE_PLAYERS}'`
    );

    if (tables.length === 0) {
      await connection.execute(`
                CREATE TABLE ${NAME_TABLE_PLAYERS} (
                    id INT AUTO_INCREMENT,
                    username VARCHAR(255) NOT NULL,
                    idUserZalo VARCHAR(255) DEFAULT '-1',
                    playerName VARCHAR(255) NOT NULL,
                    balance BIGINT DEFAULT 10000,
                    registrationTime DATETIME,
                    totalWinnings BIGINT DEFAULT 0,
                    totalLosses BIGINT DEFAULT 0,
                    netProfit BIGINT DEFAULT 0,
                    totalWinGames BIGINT DEFAULT 0,
                    totalGames BIGINT DEFAULT 0,
                    winRate DECIMAL(5, 2) DEFAULT 0,
                    lastDailyReward DATETIME,
                    isBanned BOOLEAN DEFAULT FALSE,
                    PRIMARY KEY (id),
                    UNIQUE KEY (username)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
      console.log(`✓ Đã tạo bảng ${NAME_TABLE_PLAYERS}`);
    } else {
      const [columns] = await connection.execute(
        `SHOW COLUMNS FROM ${NAME_TABLE_PLAYERS}`
      );
      const existingColumns = columns.map((col) => col.Field);

      const requiredColumns = [
        {
          name: "username",
          query: "ADD COLUMN username VARCHAR(255) NOT NULL UNIQUE",
        },
        {
          name: "idUserZalo",
          query: "ADD COLUMN idUserZalo VARCHAR(255) DEFAULT '-1'",
        },
        {
          name: "playerName",
          query: "ADD COLUMN playerName VARCHAR(255) NOT NULL",
        },
        {
          name: "balance",
          query: "ADD COLUMN balance bigint(20) DEFAULT 10000",
        },
        {
          name: "registrationTime",
          query: "ADD COLUMN registrationTime DATETIME",
        },
        {
          name: "totalWinnings",
          query: "ADD COLUMN totalWinnings bigint(20) DEFAULT 0",
        },
        {
          name: "totalLosses",
          query: "ADD COLUMN totalLosses bigint(20) DEFAULT 0",
        },
        {
          name: "netProfit",
          query: "ADD COLUMN netProfit bigint(20) DEFAULT 0",
        },
        {
          name: "totalWinGames",
          query: "ADD COLUMN totalWinGames bigint(20) DEFAULT 0",
        },
        {
          name: "totalGames",
          query: "ADD COLUMN totalGames bigint(20) DEFAULT 0",
        },
        {
          name: "winRate",
          query: "ADD COLUMN winRate DECIMAL(5, 2) DEFAULT 0",
        },
        {
          name: "lastDailyReward",
          query: "ADD COLUMN lastDailyReward DATETIME",
        },
        {
          name: "isBanned",
          query: "ADD COLUMN isBanned BOOLEAN DEFAULT FALSE",
        },
      ];

      for (const column of requiredColumns) {
        if (!existingColumns.includes(column.name)) {
          await connection.execute(
            `ALTER TABLE ${NAME_TABLE_PLAYERS} ${column.query}`
          );
          console.log(
            `Đã thêm/sửa cột ${column.name} vào bảng ${NAME_TABLE_PLAYERS}`
          );
        }
      }
    }

    console.log(chalk.green("✓ Khởi tạo database thành công"));
  } catch (error) {
    console.error(chalk.red("❌ Lỗi khi khởi tạo cơ sở dữ liệu: "), error);
    throw error;
  }
}

export {
  connection,
  NAME_TABLE_PLAYERS,
  NAME_TABLE_ACCOUNT,
  claimDailyReward,
  getTopPlayers,
  getMyCard,
  nameServer,
  DAILY_REWARD,
};
