#!/bin/bash
set -e

EXT_UUID="chrolog@henacodes.com"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"

echo "==============================================="
echo "   Installing Chrolog GNOME Wayland Extension"
echo "==============================================="

# 1. Create extension directory
echo "-> Creating extension directory..."
mkdir -p "$INSTALL_DIR"

# 2. Copy files
echo "-> Copying extension files..."
cp metadata.json "$INSTALL_DIR/"
cp extension.js "$INSTALL_DIR/"

# 3. Enable extension
echo "-> Enabling extension..."
if command -v gnome-extensions &> /dev/null; then
    gnome-extensions enable "$EXT_UUID"
    echo "==============================================="
    echo "✅ Extension successfully installed and enabled!"
    echo "Note: If you don't see it tracking, you may need to log out and log back into your GNOME session."
    echo "==============================================="
else
    echo "==============================================="
    echo "⚠️ Extension installed, but 'gnome-extensions' CLI is missing."
    echo "Please enable it manually using the GNOME Extensions App."
    echo "You may need to log out and log back in first."
    echo "==============================================="
fi
