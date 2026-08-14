# Chrolog ⚡️

Chrolog is a robust, lightweight, local-first, privacy-respecting desktop activity and time tracker. Built with Go (Wails) and React, it automatically monitors your active windows and applications to provide granular insights into how you spend your time—all while keeping your data 100% locally on your machine.

![Chrolog Dashboard](https://github.com/henacodes/chrolog/assets/placeholder.jpg) <!-- Optional: Add a screenshot here later -->

## ✨ Key Features

- **Local-First & Private:** All tracking data is stored locally in an embedded SQLite database. No cloud sync, no required accounts, complete privacy.
- **Smart Context Parsing:** Intelligently extracts project and document names from window titles (e.g., separating the file name `parser.go` from the project `chrolog` when using VS Code).
- **Stunning Analytics:** View your daily, weekly, and monthly activity trends via a beautifully designed React + Recharts dashboard.
- **System Tray Integration:** Runs quietly in the background with a system tray icon for quick access to the dashboard.
- **Multi-Environment Support:** Tracks active windows reliably across X11 and Wayland (including Hyprland IPC).

---

## 🧩 Extensions (Highly Recommended)

Chrolog functions out-of-the-box using OS-level window tracking. However, to get the absolute best granular insights—especially for web browsing—you **should install the Chrolog extensions**. 

### 1. Browser Extension (Chrome, Brave, Edge, etc.)
* **What you miss without it:** Modern browsers obscure internal metadata from the OS. Without the extension, Chrolog can only capture the raw window title (e.g., "Google Chrome"). It won't know the exact URL, the specific site domain, or rich media metadata.
* **What you get with it:** The browser extension communicates directly with the local Chrolog desktop app. It allows Chrolog to track precise domains (e.g., `github.com`), extract specific OpenGraph metadata (like YouTube video titles, categories, and channel names), and reliably determine when the browser is actively focused.
* **How to install (Easiest Method):**
  1. Download the `chrolog-browser-extension.zip` file from the [latest GitHub Release](https://github.com/henacodes/chrolog/releases).
  2. Extract the ZIP file to a folder.
  3. Open your browser and go to `chrome://extensions/` (or `edge://extensions/`).
  4. Enable **Developer mode** (top right toggle).
  5. Click **Load unpacked** and select the extracted folder.

### 2. VS Code Extension (Optional)
* **What you get with it:** While Chrolog's OS tracker does a decent job extracting the project name from the VS Code window title, the dedicated VS Code extension provides much richer context. It reliably sends exact project names, active languages, and currently focused document metadata directly to the local Chrolog desktop app.
* **How to install:**
  1. Download the `chrolog-vscode.vsix` file from the [latest GitHub Release](https://github.com/henacodes/chrolog/releases).
  2. Open VS Code, go to the Extensions view (`Ctrl+Shift+X`).
  3. Click the `...` menu at the top right of the Extensions view and select **Install from VSIX...**.
  4. Choose the downloaded `.vsix` file.

---

## 🛠️ Installation & Setup

### Pre-compiled Binaries (Easiest Method)

If you don't want to build from source, you can install the latest release directly:

**Linux:**
We provide a convenient installation script that downloads the latest binary, sets up a `.desktop` application menu entry, and automatically installs the necessary GNOME window-tracking extension if you use GNOME.
```bash
curl -sLf https://raw.githubusercontent.com/henacodes/chrolog/master/install.sh | bash
```

*(Note for GNOME Wayland users: The script installs the window-tracking extension automatically. However, GNOME natively hides system tray icons. To see the Chrolog lightning bolt tray icon, you must install and enable an AppIndicator extension, such as `ubuntu-appindicators@ubuntu.com`)*.

**Windows:**
Go to the [Releases](https://github.com/henacodes/chrolog/releases) page, download the latest `chrolog.exe` file, and run it.

---

### Building from Source (Linux)

Chrolog requires a few system libraries to compile and run properly. 
```bash
sudo apt-get update
sudo apt-get install -y build-essential libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev libxss-dev
```

1. Install Go (v1.22+) and Node.js (v20+).
2. Install the Wails CLI:
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```
3. Clone the repository and build:
   ```bash
   git clone https://github.com/henacodes/chrolog.git
   cd chrolog
   wails build -platform linux/amd64 -tags webkit2_41
   ```
4. The executable binary will be available in the `build/bin/` directory.

### Development Mode
To run in live development mode with hot-reloading for the React frontend:
```bash
wails dev -tags webkit2_41
```

## 📄 License
Copyright (c) 2026 Kirakos / henacodes.
