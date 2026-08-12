//go:build !windows

package win32

import (
	"context"
	"errors"

	"chrolog/pkg/tracker"
)

type Adapter struct{}

func NewAdapter() *Adapter {
	return &Adapter{}
}

func (a *Adapter) ID() string {
	return "win32"
}

func (a *Adapter) Init(ctx context.Context) error {
	return errors.New("[win32 adapter] fatal init error: Win32 adapter is not supported on non-Windows operating systems")
}

func (a *Adapter) Start(ctx context.Context, eventChan chan<- tracker.NormalizedEvent) error {
	return errors.New("[win32 adapter] cannot start Win32 adapter on non-Windows OS")
}

func (a *Adapter) Stop() error {
	return nil
}
