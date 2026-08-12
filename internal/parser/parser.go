package parser

import (
	"strings"
)

// ExtractContext attempts to extract contextual data (e.g., document, project)
// from a raw window title, based on common application patterns.
func ExtractContext(appName, windowTitle string) map[string]string {
	app := strings.ToLower(appName)
	ctx := make(map[string]string)

	// VS Code
	if strings.Contains(app, "code") {
		// Usually: "filename - project - Visual Studio Code"
		// Sometimes: "filename - project (Workspace) - Visual Studio Code"
		parts := strings.Split(windowTitle, " - ")
		if len(parts) >= 1 {
			ctx["document"] = parts[0]
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

	// Browsers
	browsers := []string{"chrome", "firefox", "brave", "edge", "safari", "opera"}
	for _, b := range browsers {
		if strings.Contains(app, b) {
			// Usually: "Tab Title - Google Chrome"
			parts := strings.Split(windowTitle, " - ")
			if len(parts) > 1 {
				// Return everything except the last part (which is usually the browser name)
				ctx["document"] = strings.Join(parts[:len(parts)-1], " - ")
				return ctx
			}
		}
	}

	// Terminal or generic
	ctx["document"] = windowTitle
	return ctx
}
