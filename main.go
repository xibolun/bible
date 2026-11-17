//go:build windows || darwin || linux || bindings

package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/xibolun/bible/internal/bible"
	"github.com/xibolun/bible/internal/service"
	"github.com/xibolun/bible/internal/storage"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

var version = "dev"

type desktop struct {
	app      *application.App
	window   *application.WebviewWindow
	smokeDir string
}

func (d *desktop) Copy(text string) error {
	if !d.app.Clipboard.SetText(text) {
		return fmt.Errorf("clipboard unavailable")
	}
	return nil
}
func (d *desktop) Save(b []byte, name string) (string, error) {
	var path string
	var e error
	if d.smokeDir != "" {
		path = filepath.Join(d.smokeDir, name)
	} else {
		path, e = d.app.Dialog.SaveFile().SetMessage("保存经文卡片 · 选择 PNG 图片保存位置").SetFilename(name).AddFilter("PNG 图片", "*.png").CanCreateDirectories(true).AttachToWindow(d.window).PromptForSingleSelection()
	}
	if e != nil || path == "" {
		return path, e
	}
	f, e := os.CreateTemp(filepath.Dir(path), ".bible-card-*.png")
	if e != nil {
		return "", e
	}
	temp := f.Name()
	defer os.Remove(temp)
	if _, e = f.Write(b); e != nil {
		f.Close()
		return "", e
	}
	if e = f.Sync(); e != nil {
		f.Close()
		return "", e
	}
	if e = f.Close(); e != nil {
		return "", e
	}
	if e = os.Rename(temp, path); e != nil {
		return "", e
	}
	return path, nil
}

func (d *desktop) FinishSmoke(passed bool) error {
	if d.smokeDir == "" {
		return fmt.Errorf("smoke mode not enabled")
	}
	clipboard, clipboardOK := d.app.Clipboard.Text()
	passed = passed && clipboardOK && strings.Contains(clipboard, "起初")
	report := map[string]any{"passed": passed, "os": runtime.GOOS, "arch": runtime.GOARCH, "version": version, "nativeWebview": true, "clipboardRoundTrip": strings.Contains(clipboard, "起初"), "fileDialogAutomation": false}
	b, e := json.MarshalIndent(report, "", "  ")
	if e != nil {
		return e
	}
	if e = os.WriteFile(filepath.Join(d.smokeDir, "native-smoke.json"), b, 0600); e != nil {
		return e
	}
	go func() { time.Sleep(time.Second); d.app.Quit() }()
	return nil
}

func main() {
	data, e := bible.Load()
	if e != nil {
		log.Fatal("DATA_UNAVAILABLE")
	}
	config, e := os.UserConfigDir()
	if e != nil {
		log.Fatal("STORAGE_ERROR")
	}
	if slices.Contains(os.Args, "--smoke-test") {
		config = os.Getenv("BIBLE_SMOKE_DIR")
		if config == "" {
			log.Fatal("SMOKE_DIRECTORY_REQUIRED")
		}
	}
	store, e := storage.Open(filepath.Join(config, "Bible", "user.db"))
	if e != nil {
		log.Print("STORAGE_ERROR: user database retained")
	}
	defer func() {
		if store != nil {
			store.Close()
		}
	}()
	desk := &desktop{}
	if slices.Contains(os.Args, "--smoke-test") {
		desk.smokeDir = os.Getenv("BIBLE_SMOKE_DIR")
		if desk.smokeDir == "" {
			log.Fatal("SMOKE_DIRECTORY_REQUIRED")
		}
		if os.MkdirAll(desk.smokeDir, 0700) != nil {
			log.Fatal("SMOKE_DIRECTORY_UNAVAILABLE")
		}
	}
	svc := service.New(data, store, desk)
	app := application.New(application.Options{Name: "Bible", Description: "离线圣经阅读与经文卡片", Icon: appIcon, Services: []application.Service{application.NewService(svc)}, Assets: application.AssetOptions{Handler: application.AssetFileServerFS(assets)}, Mac: application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true}, Linux: application.LinuxOptions{ApplicationID: "io.github.xibolun.bible", ProgramName: "io.github.xibolun.bible"}})
	desk.app = app
	p := service.Defaults()
	if r := svc.GetPreferences(); r.OK {
		p = *r.Data
	}
	state := application.WindowStateNormal
	if p.Maximized {
		state = application.WindowStateMaximised
	}
	url := "/"
	if desk.smokeDir != "" {
		url = "/?nativeSmoke=1"
	}
	win := app.Window.NewWithOptions(application.WebviewWindowOptions{Name: "reader", Title: "圣经 · Bible", Width: p.WindowWidth, Height: p.WindowHeight, MinWidth: 1024, MinHeight: 640, URL: url, StartState: state, BackgroundColour: application.NewRGB(255, 255, 255), Linux: application.LinuxWindow{Icon: appIcon}})
	desk.window = win
	normal := application.Rect{X: p.WindowX, Y: p.WindowY, Width: p.WindowWidth, Height: p.WindowHeight}
	// Clamp saved normal bounds to a currently connected work area.
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(event *application.ApplicationEvent) {
		chosen := app.Screen.GetPrimary()
		for _, screen := range app.Screen.GetAll() {
			a := screen.WorkArea
			if p.WindowX >= a.X && p.WindowY >= a.Y && p.WindowX+min(p.WindowWidth, 300) <= a.X+a.Width && p.WindowY+80 <= a.Y+a.Height {
				chosen = screen
				break
			}
		}
		if chosen != nil {
			a := chosen.WorkArea
			normal.Width = min(p.WindowWidth, max(1024, a.Width))
			normal.Height = min(p.WindowHeight, max(640, a.Height))
			normal.X = max(a.X, min(p.WindowX, a.X+a.Width-normal.Width))
			normal.Y = max(a.Y, min(p.WindowY, a.Y+a.Height-normal.Height))
			if !p.Maximized {
				win.SetBounds(normal)
			}
		}
	})
	saveWindow := func(event *application.WindowEvent) {
		if store == nil {
			return
		}
		r := svc.GetPreferences()
		if !r.OK {
			return
		}
		prefs := *r.Data
		if !win.IsMaximised() && !win.IsFullscreen() {
			normal = win.Bounds()
		}
		prefs.WindowX = normal.X
		prefs.WindowY = normal.Y
		prefs.WindowWidth = max(1024, normal.Width)
		prefs.WindowHeight = max(640, normal.Height)
		prefs.Maximized = win.IsMaximised()
		if !svc.SavePreferences(prefs).OK {
			log.Print("STORAGE_ERROR: window preferences not saved")
		}
	}
	win.OnWindowEvent(events.Common.WindowDidMove, saveWindow)
	win.OnWindowEvent(events.Common.WindowDidResize, saveWindow)
	win.OnWindowEvent(events.Common.WindowClosing, saveWindow)
	// Native CI smoke mode starts the real WebView and runs bridge checks after the page loads.
	if slices.Contains(os.Args, "--smoke-test") {
		go func() { time.Sleep(30 * time.Second); log.Print("NATIVE_SMOKE_TIMEOUT"); app.Quit() }()
	}
	app.OnShutdown(func() { saveWindow(nil) })
	if e = app.Run(); e != nil {
		log.Fatal("DESKTOP_START_ERROR")
	}
}
