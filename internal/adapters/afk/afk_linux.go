//go:build linux

package afk

import (
	"errors"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

func detectSystemIdleFetcher() (IdleFetcher, error) {
	// 1. Try xprintidle (returns idle time in ms)
	if _, err := exec.LookPath("xprintidle"); err == nil {
		return func() (time.Duration, error) {
			out, err := exec.Command("xprintidle").Output()
			if err != nil {
				return 0, err
			}
			ms, err := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
			if err != nil {
				return 0, err
			}
			return time.Duration(ms) * time.Millisecond, nil
		}, nil
	}

	// 2. Try xssstate (xssstate -i returns idle ms)
	if _, err := exec.LookPath("xssstate"); err == nil {
		return func() (time.Duration, error) {
			out, err := exec.Command("xssstate", "-i").Output()
			if err != nil {
				return 0, err
			}
			ms, err := strconv.ParseInt(strings.TrimSpace(string(out)), 10, 64)
			if err != nil {
				return 0, err
			}
			return time.Duration(ms) * time.Millisecond, nil
		}, nil
	}

	return nil, errors.New("[afk adapter] fatal init error: no supported system idle query utility found (e.g. xprintidle or xssstate)")
}
