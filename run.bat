@echo off
setlocal

if not exist "node_modules" (
    echo "No required modules found, starting module installation process..."
    npm install
) else (
    echo "Starting Bot Zalo D Q T - V1.5.4 Developed by N D Q x L Q T"
)

npm run bot

endlocal
