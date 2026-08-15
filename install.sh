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

if ! curl -#Lf "$DOWNLOAD_URL" -o "$INSTALL_DIR/chrolog.tmp"; then
    echo "Error: Failed to download the binary. Are you sure you published a GitHub Release with a 'chrolog' asset?"
    exit 1
fi
mv -f "$INSTALL_DIR/chrolog.tmp" "$INSTALL_DIR/chrolog"
chmod +x "$INSTALL_DIR/chrolog"

# 3. Get the icon
echo "[3/4] Fetching application icon..."
if [ -f "build/appicon.png" ]; then
    cp "build/appicon.png" "$ICON_DIR/chrolog.png"
    echo "Copied local icon."
else
    ICON_URL="https://raw.githubusercontent.com/$REPO/master/build/appicon.png"
    if ! curl -sLf "$ICON_URL" -o "$ICON_DIR/chrolog.png"; then
        echo "Warning: Could not download the icon. The application menu will show a generic icon."
    fi
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

# 5. GNOME Wayland Support
if [[ ( "${XDG_CURRENT_DESKTOP,,}" == *"gnome"* || "${DESKTOP_SESSION,,}" == *"gnome"* ) ]] && command -v gnome-extensions &> /dev/null; then
    echo "[5/5] GNOME desktop detected. Installing window tracker extension..."
    EXT_UUID="chrolog@henacodes.com"
    EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"
    mkdir -p "$EXT_DIR"
    
    # Try local first
    if [ -f "extensions/gnome/metadata.json" ] && [ -f "extensions/gnome/extension.js" ]; then
        cp extensions/gnome/metadata.json "$EXT_DIR/"
        cp extensions/gnome/extension.js "$EXT_DIR/"
        echo "Copied local GNOME extension."
    else
        echo "Downloading GNOME extension from GitHub..."
        curl -sLf "https://raw.githubusercontent.com/$REPO/master/extensions/gnome/metadata.json" -o "$EXT_DIR/metadata.json" || true
        curl -sLf "https://raw.githubusercontent.com/$REPO/master/extensions/gnome/extension.js" -o "$EXT_DIR/extension.js" || true
    fi

    gnome-extensions enable "$EXT_UUID" || true
    echo "GNOME Extension installed and enabled! (Note: You may need to log out and back in for it to take effect)."
else
    echo "[5/5] Skipping GNOME extension (not running GNOME or gnome-extensions missing)."
fi

echo "========================================"
echo "✅ Chrolog has been installed successfully!"
echo "   You can now launch it from your application menu."
echo ""
echo "Note: Ensure '$INSTALL_DIR' is in your system PATH."
echo "========================================"
