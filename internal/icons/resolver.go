package icons

import (
	"bufio"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	iconCache = make(map[string]string)
	mu        sync.RWMutex
)

// GetAppIcon resolves the app_id to a base64 encoded data URI.
// E.g., data:image/png;base64,...
func GetAppIcon(appID string) string {
	mu.RLock()
	cached, ok := iconCache[appID]
	mu.RUnlock()
	if ok {
		return cached
	}

	appIDLower := strings.ToLower(appID)
	// Some apps like "Code" (VS Code) have desktop files named "code.desktop".
	// We'll search in common application directories.
	dirs := []string{
		"/usr/share/applications",
		filepath.Join(os.Getenv("HOME"), ".local/share/applications"),
	}

	var iconName string
	var bestMatchName string
	var bestMatchLen int

	for _, dir := range dirs {
		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, f := range files {
			if !strings.HasSuffix(f.Name(), ".desktop") {
				continue
			}
			baseName := strings.ToLower(strings.TrimSuffix(f.Name(), ".desktop"))

			// Exact match is best
			if baseName == appIDLower {
				path := filepath.Join(dir, f.Name())
				name := extractIconName(path)
				if name != "" {
					iconName = name
					break
				}
			}

			// Prefix match: appID contains baseName (e.g. org.telegram.desktop._hash -> org.telegram.desktop)
			if strings.HasPrefix(appIDLower, baseName) {
				if len(baseName) > bestMatchLen {
					path := filepath.Join(dir, f.Name())
					name := extractIconName(path)
					if name != "" {
						bestMatchName = name
						bestMatchLen = len(baseName)
					}
				}
			}

			// Substring match: baseName contains appID (e.g. google-chrome -> chrome, code-oss -> code)
			if len(appIDLower) >= 3 && strings.Contains(baseName, appIDLower) {
				if bestMatchName == "" {
					path := filepath.Join(dir, f.Name())
					name := extractIconName(path)
					if name != "" {
						bestMatchName = name
					}
				}
			}
		}
		if iconName != "" {
			break
		}
	}

	if iconName == "" && bestMatchName != "" {
		iconName = bestMatchName
	}

	if iconName == "" {
		iconName = appIDLower // fallback: try the app ID as the icon name
	}

	// Now we have the icon name. If it's an absolute path, use it.
	var iconPath string
	if filepath.IsAbs(iconName) {
		iconPath = iconName
	} else {
		iconPath = findIconFile(iconName)
	}

	var dataURI string
	if iconPath != "" {
		data, err := os.ReadFile(iconPath)
		if err == nil {
			mimeType := http.DetectContentType(data)
			// DetectContentType doesn't reliably detect svg
			if strings.HasSuffix(iconPath, ".svg") {
				mimeType = "image/svg+xml"
			}
			b64 := base64.StdEncoding.EncodeToString(data)
			dataURI = fmt.Sprintf("data:%s;base64,%s", mimeType, b64)
		}
	}

	mu.Lock()
	iconCache[appID] = dataURI
	mu.Unlock()

	return dataURI
}

func extractIconName(desktopFile string) string {
	f, err := os.Open(desktopFile)
	if err != nil {
		return ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "Icon=") {
			return strings.TrimPrefix(line, "Icon=")
		}
	}
	return ""
}

func findIconFile(iconName string) string {
	exts := []string{".png", ".svg", ".xpm", ""}
	
	// If iconName already has extension, use empty string for ext fallback
	hasExt := false
	for _, ext := range exts {
		if ext != "" && strings.HasSuffix(iconName, ext) {
			hasExt = true
			break
		}
	}
	if hasExt {
		exts = []string{""}
	}

	home := os.Getenv("HOME")
	searchDirs := []string{
		"/usr/share/pixmaps",
		"/usr/share/icons/hicolor/scalable/apps",
		"/usr/share/icons/hicolor/512x512/apps",
		"/usr/share/icons/hicolor/256x256/apps",
		"/usr/share/icons/hicolor/128x128/apps",
		"/usr/share/icons/hicolor/64x64/apps",
		"/usr/share/icons/hicolor/48x48/apps",
		"/usr/share/icons/hicolor/32x32/apps",
		"/usr/share/icons/Papirus/64x64/apps",
		"/usr/share/icons/Papirus/48x48/apps",
		"/usr/share/icons/Papirus/32x32/apps",
		filepath.Join(home, ".local/share/icons/hicolor/scalable/apps"),
		filepath.Join(home, ".local/share/icons/hicolor/512x512/apps"),
		filepath.Join(home, ".local/share/icons/hicolor/256x256/apps"),
		filepath.Join(home, ".local/share/icons/hicolor/128x128/apps"),
		filepath.Join(home, ".local/share/icons/hicolor/64x64/apps"),
		filepath.Join(home, ".local/share/icons/hicolor/48x48/apps"),
		filepath.Join(home, ".local/share/icons/hicolor/32x32/apps"),
	}

	for _, dir := range searchDirs {
		for _, ext := range exts {
			path := filepath.Join(dir, iconName+ext)
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
	}
	return ""
}
