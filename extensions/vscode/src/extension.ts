import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Chrolog extension is now active');

    const triggerUpdate = () => {
        sendStateToChrolog();
    };

    // Trigger on active editor change (switching files)
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        triggerUpdate();
    }));

    // Trigger on window state change (focusing/unfocusing the editor)
    context.subscriptions.push(vscode.window.onDidChangeWindowState((windowState) => {
        if (windowState.focused) {
            triggerUpdate();
        }
    }));

    // Initial trigger
    triggerUpdate();
}

function sendStateToChrolog() {
    const editor = vscode.window.activeTextEditor;
    const isFocused = vscode.window.state.focused;

    if (!isFocused) return; // Only track if the window is currently focused

    // 1. Get the Editor Name (handles forks like Cursor, VSCodium, etc.)
    const appName = vscode.env.appName; // e.g., "Visual Studio Code" or "Cursor"
    
    // Convert appName to a suitable app_id (e.g., "Cursor" -> "cursor", "Visual Studio Code" -> "code")
    let appId = appName.toLowerCase().replace(/\s+/g, '-');
    if (appName.includes('Visual Studio Code')) {
        appId = 'code';
    } else if (appName.toLowerCase().includes('cursor')) {
        appId = 'cursor';
    }

    // 2. Extract file and workspace data
    let projectName = "No Workspace";
    let fileName = "No File Open";
    let fullPath = "";
    let language = "";

    if (vscode.workspace.name) {
        projectName = vscode.workspace.name;
    }

    if (editor && editor.document) {
        const doc = editor.document;
        fullPath = doc.fileName;
        fileName = path.basename(fullPath);
        language = doc.languageId;
        
        // If there's no workspace, maybe we can extract the parent directory of the file
        if (projectName === "No Workspace") {
            const dir = path.dirname(fullPath);
            projectName = path.basename(dir);
        }
    }

    const windowTitle = `${projectName} - ${fileName}`;

    const payload = JSON.stringify({
        app_id: appId,
        app_name: appName,
        window_title: windowTitle,
        source: 'vscode_extension',
        metadata: {
            project: projectName,
            document: fileName,
            language: language,
            full_path: fullPath
        }
    });

    const req = http.request({
        hostname: '127.0.0.1',
        port: 1738,
        path: '/event',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    });

    req.on('error', (e) => {
        // Silently fail if backend is not running
        // console.error(`Problem with request: ${e.message}`);
    });

    req.write(payload);
    req.end();
}

export function deactivate() {}
