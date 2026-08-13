package parser

import (
	"regexp"
	"strings"
)

var notificationRegex = regexp.MustCompile(`^\(\d+\)\s*`)

// extractLanguage attempts to guess the programming language from a file extension.
func extractLanguage(filename string) string {
	idx := strings.LastIndex(filename, ".")
	if idx == -1 {
		return ""
	}
	ext := strings.ToLower(filename[idx+1:])
	switch ext {
	case "ts", "tsx":
		return "typescript"
	case "js", "jsx":
		return "javascript"
	case "go":
		return "go"
	case "py":
		return "python"
	case "rs":
		return "rust"
	case "cpp", "cc", "cxx", "hpp":
		return "c++"
	case "c":
		return "c"
	case "cs":
		return "csharp"
	case "java":
		return "java"
	case "rb":
		return "ruby"
	case "php":
		return "php"
	case "html":
		return "html"
	case "css":
		return "css"
	case "json":
		return "json"
	case "md":
		return "markdown"
	case "sh", "bash":
		return "shell"
	}
	return ""
}

// ExtractContext attempts to extract contextual data (e.g., document, project)
// from a raw window title, based on common application patterns.
func ExtractContext(appName, windowTitle string) map[string]string {
	ctx := make(map[string]string)
	
	// Strip notification badges from window titles (e.g. "(5) YouTube" -> "YouTube")
	windowTitle = notificationRegex.ReplaceAllString(windowTitle, "")

	app := strings.ToLower(appName)

	// VS Code
	if strings.Contains(app, "code") {
		// Usually: "filename - project - Visual Studio Code"
		// Sometimes: "filename - project (Workspace) - Visual Studio Code"
		parts := strings.Split(windowTitle, " - ")
		if len(parts) >= 1 {
			doc := strings.TrimSpace(parts[0])
			doc = strings.TrimPrefix(doc, "● ")
			ctx["document"] = doc
			if lang := extractLanguage(doc); lang != "" {
				ctx["language"] = lang
			}
		}
		if len(parts) >= 3 {
			// e.g. ["AppDetails.tsx", "chrolog", "Visual Studio Code"]
			// The project is the second to last part (parts[len-2])
			project := parts[len(parts)-2]
			// Remove " (Workspace)" if it exists
			project = strings.TrimSuffix(project, " (Workspace)")
			ctx["project"] = project
		}
		return ctx
	}

	// Antigravity IDE
	if strings.Contains(app, "antigravity") {
		// Format: "project - Antigravity IDE - filename"
		// Or: "project - Antigravity IDE"
		parts := strings.Split(windowTitle, " - ")
		if len(parts) >= 1 {
			ctx["project"] = strings.TrimSpace(parts[0])
		}
		if len(parts) >= 3 {
			doc := strings.TrimSpace(parts[2])
			doc = strings.TrimSuffix(doc, "●")
			
			// Agent files appear as "file:///... (Agent) (filename)"
			if strings.Contains(doc, "(Agent)") {
				start := strings.LastIndex(doc, "(")
				end := strings.LastIndex(doc, ")")
				if start != -1 && end != -1 && end > start {
					doc = doc[start+1 : end]
				}
			}
			
			ctx["document"] = doc
			if lang := extractLanguage(doc); lang != "" {
				ctx["language"] = lang
			}
		} else {
			// No file is open, just project
			ctx["document"] = ctx["project"]
		}
		return ctx
	}

	// Browsers
	browsers := []string{"chrome", "firefox", "brave", "edge", "safari", "opera"}
	for _, b := range browsers {
		if strings.Contains(app, b) {
			// Usually: "Tab Title - Site Name - Google Chrome"
			parts := strings.Split(windowTitle, " - ")
			if len(parts) > 1 {
				var siteName string
				if len(parts) > 2 {
					siteName = strings.TrimSpace(parts[len(parts)-2])
					ctx["document"] = strings.Join(parts[:len(parts)-2], " - ")
				} else {
					siteName = strings.TrimSpace(parts[1])
					ctx["document"] = strings.TrimSpace(parts[0])
				}

				lowerSite := strings.ToLower(siteName)
				domain := ""
				if strings.Contains(lowerSite, "youtube") {
					domain = "www.youtube.com"
				} else if strings.Contains(lowerSite, "github") {
					domain = "github.com"
				} else if strings.Contains(lowerSite, "google search") {
					domain = "google.com"
				} else if strings.Contains(lowerSite, "gmail") {
					domain = "mail.google.com"
				} else if strings.Contains(lowerSite, "gemini") {
					domain = "gemini.google.com"
				} else if strings.Contains(lowerSite, "chatgpt") {
					domain = "chat.openai.com"
				} else if strings.Contains(lowerSite, "stackoverflow") || strings.Contains(lowerSite, "stack overflow") {
					domain = "stackoverflow.com"
				} else if strings.Contains(lowerSite, "notion") {
					domain = "notion.so"
				} else if strings.Contains(lowerSite, "figma") {
					domain = "figma.com"
				} else if strings.Contains(lowerSite, "x.com") || strings.Contains(lowerSite, "twitter") {
					domain = "x.com"
				} else if strings.Contains(lowerSite, "reddit") {
					domain = "reddit.com"
				} else {
					domain = siteName
				}

				ctx["project"] = domain
				return ctx
			}
		}
	}

	// Terminal or generic
	ctx["document"] = windowTitle
	return ctx
}
