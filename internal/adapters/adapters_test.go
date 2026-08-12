package adapters_test

import (
	"context"
	"os"
	"testing"

	"chrolog/internal/adapters/httplistener"
	"chrolog/internal/adapters/hyprland"
	"chrolog/internal/adapters/x11"
)

func TestHyprlandAdapterFailFast(t *testing.T) {
	// Ensure HYPRLAND_INSTANCE_SIGNATURE is unset for test
	origSig := os.Getenv("HYPRLAND_INSTANCE_SIGNATURE")
	os.Unsetenv("HYPRLAND_INSTANCE_SIGNATURE")
	defer func() {
		if origSig != "" {
			os.Setenv("HYPRLAND_INSTANCE_SIGNATURE", origSig)
		}
	}()

	adapter := hyprland.NewAdapter()
	err := adapter.Init(context.Background())
	if err == nil {
		t.Fatalf("expected fatal init error when HYPRLAND_INSTANCE_SIGNATURE is missing, got nil")
	}
	t.Logf("Pass: Hyprland fail-fast error caught correctly: %v", err)
}

func TestX11AdapterFailFast(t *testing.T) {
	origDisplay := os.Getenv("DISPLAY")
	os.Unsetenv("DISPLAY")
	defer func() {
		if origDisplay != "" {
			os.Setenv("DISPLAY", origDisplay)
		}
	}()

	adapter := x11.NewAdapter()
	err := adapter.Init(context.Background())
	if err == nil {
		t.Fatalf("expected fatal init error when DISPLAY is missing, got nil")
	}
	t.Logf("Pass: X11 fail-fast error caught correctly: %v", err)
}

func TestHTTPListenerInit(t *testing.T) {
	adapter := httplistener.NewAdapter("127.0.0.1:18999")
	err := adapter.Init(context.Background())
	if err != nil {
		t.Fatalf("expected HTTP listener init success on available port, got: %v", err)
	}
}
