//go:build windows

package afk

import (
	"errors"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32                   = syscall.NewLazyDLL("user32.dll")
	kernel32                 = syscall.NewLazyDLL("kernel32.dll")
	procGetLastInputInfo     = user32.NewProc("GetLastInputInfo")
	procGetTickCount         = kernel32.NewProc("GetTickCount")
)

type lastInputInfo struct {
	cbSize uint32
	dwTime uint32
}

func detectSystemIdleFetcher() (IdleFetcher, error) {
	if user32.Load() != nil || kernel32.Load() != nil {
		return nil, errors.New("[afk adapter] fatal init error: user32.dll/kernel32.dll could not be loaded")
	}

	return func() (time.Duration, error) {
		var lii lastInputInfo
		lii.cbSize = uint32(unsafe.Sizeof(lii))

		ret, _, _ := procGetLastInputInfo.Call(uintptr(unsafe.Pointer(&lii)))
		if ret == 0 {
			return 0, errors.New("GetLastInputInfo failed")
		}

		now, _, _ := procGetTickCount.Call()
		idleMs := uint32(now) - lii.dwTime

		return time.Duration(idleMs) * time.Millisecond, nil
	}, nil
}
