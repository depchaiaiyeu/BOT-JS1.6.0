import mysql from "mysql2/promise";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { claimDailyReward, getMyCard } from "./player.js";
import { getTopPlayers } from "./jdbc.js";

export * from "./player.js";
export * from "./jdbc.js";

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

async function ensureMySQLRunning() {
  try {
    const testConnection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      connectTimeout: 5000
    });
    await testConnection.end();
    return true;
  } catch (error) {
    return false;
  }
}

async function installAndStartMySQL() {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execPromise = promisify(exec);

  try {
    console.log(chalk.yellow("Đang kiểm tra MySQL..."));
    
    const isRunning = await ensureMySQLRunning();
    if (isRunning) {
      console.log(chalk.green("✓ MySQL đã chạy"));
      return true;
    }

    console.log(chalk.yellow("Đang khởi động MySQL service..."));
    
    try {
      await execPromise('net start MySQL', { shell: 'cmd.exe' });
      console.log(chalk.green("✓ Đã khởi động MySQL service"));
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const isNowRunning = await ensureMySQLRunning();
      if (isNowRunning) {
        return true;
      }
    } catch (startError) {
      console.log(chalk.yellow("Không thể khởi động MySQL service tự động"));
    }

    try {
      await execPromise('net start MySQL80', { shell: 'cmd.exe' });
      console.log(chalk.green("✓ Đã khởi động MySQL80 service"));
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const isNowRunning = await ensureMySQLRunning();
      if (isNowRunning) {
        return true;
      }
    } catch (startError) {
      console.log(chalk.yellow("Không thể khởi động MySQL80 service"));
    }

    console.log(chalk.red("⚠ Vui lòng cài đặt và khởi động MySQL thủ công"));
    console.log(chalk.yellow("Tải MySQL tại: https://dev.mysql.com/downloads/installer/"));
    return false;
  } catch (error) {
    console.error(chalk.red("Lỗi khi kiểm tra MySQL:"), error.message);
    return false;
  }
}

export async function initializeDatabase() {
  try {
    const mysqlReady = await installAndStartMySQL();
    if (!mysqlReady) {
      throw new Error("MySQL chưa sẵn sàng. Vui lòng cài đặt và khởi động MySQL");
    }

    const config = await loadConfig();

    nameServer = config.nameServer;
    NAME_TABLE_PLAYERS = config.tablePlayerZalo;
    NAME_TABLE_ACCOUNT = config.tableAccount;
    DAILY_REWARD = config.dailyReward;

    const tempConnection = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
    });

    await tempConnection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\``
    );

    await tempConnection.end();

    connection = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
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
    console.error(chalk.red("Lỗi khi khởi tạo cơ sở dữ liệu: "), error);
    console.error(chalk.red("Vui lòng cài đặt MySQL và khởi động lại!"));
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
