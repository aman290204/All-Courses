# Course Library — Render config
# Render will auto-detect package.json and run: npm start

# To deploy on Render:
# 1. Push this folder to GitHub
# 2. New Web Service → connect repo → Root: ./ → Build: npm install → Start: node server.js
# 3. Add env var PORT=3000 (Render sets it automatically)

# To update your library:
# 1. Replace drive_folders.json with your new rclone output
# 2. Hit GET /api/reload  → stats rebuild without restart
