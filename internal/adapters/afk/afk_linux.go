//go:build linux

package afk

/*
#cgo LDFLAGS: -lX11 -lXss
#include <X11/Xlib.h>
#include <X11/extensions/scrnsaver.h>
#include <stdlib.h>

int check_extension() {
    Display *display = XOpenDisplay(NULL);
    if (display == NULL) return 0;
    
    int event_base, error_base;
    int has_ext = XScreenSaverQueryExtension(display, &event_base, &error_base);
    XCloseDisplay(display);
    return has_ext;
}

unsigned long get_idle_time() {
    Display *display = XOpenDisplay(NULL);
    if (display == NULL) {
        return 0; // Fallback if X11 is not available (e.g. pure Wayland without XWayland)
    }

    XScreenSaverInfo *info = XScreenSaverAllocInfo();
    if (info == NULL) {
        XCloseDisplay(display);
        return 0;
    }

    XScreenSaverQueryInfo(display, DefaultRootWindow(display), info);
    unsigned long idle_ms = info->idle;

    XFree(info);
    XCloseDisplay(display);

    return idle_ms;
}
*/
import "C"

import (
	"errors"
	"time"
)

func detectSystemIdleFetcher() (IdleFetcher, error) {
	if C.check_extension() == 0 {
		return nil, errors.New("X11 MIT-SCREEN-SAVER extension is missing or X server is unavailable")
	}

	// We can't really guarantee it works 100% on Wayland if XWayland is disabled,
	// but Wails currently relies heavily on X11/Gtk under the hood, so this is very reliable for Wails.
	return func() (time.Duration, error) {
		ms := C.get_idle_time()
		if ms == 0 {
			// It might actually be 0 ms idle, or it might be a failure to open display.
			// For AFK tracking, returning 0 just means "active", which is a safe fallback.
			return 0, nil
		}
		return time.Duration(ms) * time.Millisecond, nil
	}, nil
}
