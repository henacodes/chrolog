#!/bin/bash
set -e

# Configuration
REPO="henacodes/chrolog"
INSTALL_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

echo "========================================"
echo "      Installing Chrolog (Linux)..."
echo "========================================"

# 1. Ensure user-local installation directories exist
echo "[1/4] Preparing directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$ICON_DIR"

# 2. Download the binary from the latest GitHub Release
# We assume the binary uploaded to your release is simply named 'chrolog'
echo "[2/4] Downloading latest binary from GitHub..."
DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/chrolog"

if ! curl -sLf "$DOWNLOAD_URL" -o "$INSTALL_DIR/chrolog"; then
    echo "Error: Failed to download the binary. Are you sure you published a GitHub Release with a 'chrolog' asset?"
    exit 1
fi
chmod +x "$INSTALL_DIR/chrolog"

# 3. Download the icon from the master branch
echo "[3/4] Fetching application icon..."
ICON_URL="https://raw.githubusercontent.com/$REPO/master/build/appicon.png"
if ! curl -sLf "$ICON_URL" -o "$ICON_DIR/chrolog.png"; then
    echo "Warning: Could not download the icon. The application menu will show a generic icon."
fi

# 4. Create the .desktop configuration file
echo "[4/4] Configuring Application Menu..."
cat > "$DESKTOP_DIR/chrolog.desktop" <<EOF
[Desktop Entry]
Name=Chrolog
Comment=Time tracking dashboard for developers
Exec=$INSTALL_DIR/chrolog
Icon=$ICON_DIR/chrolog.png
Terminal=false
Type=Application
Categories=Utility;Development;Productivity;
StartupNotify=true
EOF

# Update the desktop database so the menu refreshes immediately (if available)
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$DESKTOP_DIR"
fi

echo "========================================"
echo "✅ Chrolog has been installed successfully!"
echo "   You can now launch it from your application menu."
echo ""
echo "Note: Ensure '$INSTALL_DIR' is in your system PATH."
echo "========================================"
