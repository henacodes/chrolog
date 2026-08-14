import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';

export default class WindowTrackerExtension extends Extension {
    enable() {
        this._session = new Soup.Session();
        this._focusId = global.display.connect('notify::focus-window', this._onFocusChanged.bind(this));
        this._titleId = null;
        this._currentWin = null;
        this._lastTitle = null;

        // Poll every 1.5 seconds to catch apps that update title without firing notify::title
        // (e.g. Electron/GTK apps that flush title lazily to the compositor)
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._pollTitle();
            return GLib.SOURCE_CONTINUE;
        });

        // Trigger once immediately on startup
        this._onFocusChanged();
    }

    disable() {
        if (this._focusId) {
            global.display.disconnect(this._focusId);
            this._focusId = null;
        }
        if (this._titleId && this._currentWin) {
            this._currentWin.disconnect(this._titleId);
            this._titleId = null;
            this._currentWin = null;
        }
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = null;
        }
        if (this._session) {
            this._session.abort();
            this._session = null;
        }
        this._lastTitle = null;
    }

    _pollTitle() {
        let win = global.display.get_focus_window();
        if (!win) return;
        let title = win.get_title() || '';
        if (title !== this._lastTitle) {
            this._lastTitle = title;
            this._sendEvent(win);
        }
    }

    _onFocusChanged() {
        let win = global.display.get_focus_window();
        
        if (this._currentWin && this._titleId) {
            this._currentWin.disconnect(this._titleId);
            this._titleId = null;
        }
        
        this._currentWin = win;
        if (!win) return;
        
        this._titleId = win.connect('notify::title', this._sendEvent.bind(this, win));
        this._lastTitle = win.get_title() || '';
        this._sendEvent(win);
    }

    _sendEvent(win) {

        let title = win.get_title() || "";
        let wmClass = win.get_wm_class() || "";
        let appName = wmClass;
        
        // Try to get a clean application name using GNOME's WindowTracker
        let tracker = Shell.WindowTracker.get_default();
        let app = tracker.get_window_app(win);
        if (app) {
            appName = app.get_name() || appName;
        }

        let payload = JSON.stringify({
            app_id: wmClass,
            app_name: appName,
            window_title: title,
            source: "gnome_wayland",
            url: "",
            favicon: "",
            metadata: {}
        });

        let msg = Soup.Message.new('POST', 'http://127.0.0.1:1738/event');
        if (!msg) return;

        let bytes = new GLib.Bytes(new TextEncoder().encode(payload));
        msg.set_request_body_from_bytes('application/json', bytes);

        // Send asynchronously to avoid blocking the GNOME UI thread
        this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, res) => {
            try {
                session.send_and_read_finish(res);
            } catch (e) {
                // Ignore connection refused errors (chrolog might be closed)
            }
        });
    }
}
