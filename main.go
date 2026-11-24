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
	"github.com/xibolun/bible/internal/editions"
	"github.com/xibolun/bible/internal/service"
	"github.com/xibolun/bible/internal/storage"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

var version = "dev"

type desktop struct {
	app        *application.App
	window     *application.WebviewWindow
	smokeDir   string
	projection *application.WebviewWindow
}

func (d *desktop) ChooseEditionFile() (string, error) {
	if d.app == nil {
		return "", fmt.Errorf("desktop unavailable")
	}
	return d.app.Dialog.OpenFile().SetTitle("导入本地圣经译本 · Import Bible edition").CanChooseFiles(true).CanChooseDirectories(false).AddFilter("Bible editions", "*.SQLite3;*.sqlite3;*.bbl.mybible;*.ont;*.ot;*.nt;*.xml;*.osis;*.zip;*.gz").AllowsOtherFileTypes(true).AttachToWindow(d.window).PromptForSingleSelection()
}

func (d *desktop) ProjectionChanged(state service.ProjectionState) {
	d.app.Event.Emit("bible:projection", state)
}

func (d *desktop) ProjectionWindow(action string) error {
	if d.app == nil {
		return fmt.Errorf("desktop unavailable")
	}
	application.InvokeSync(func() {
		if action == "controls" {
			d.window.Show().Focus()
			d.window.ExecJS("window.dispatchEvent(new Event('bible:projection-controls'))")
			return
		}
		if action == "stop" {
			if d.projection != nil {
				d.projection.Close()
				d.projection = nil
			}
			return
		}
		if action == "escape" {
			if d.projection != nil && d.projection.IsFullscreen() {
				d.projection.UnFullscreen()
			}
			return
		}
		if d.projection == nil {
			win := d.app.Window.NewWithOptions(application.WebviewWindowOptions{
				Name: "projection", Title: "圣经投影 · Bible", URL: "/?projection=1",
				Width: 1280, Height: 720, MinWidth: 640, MinHeight: 360,
				BackgroundColour: application.NewRGB(255, 255, 255),
				Linux:            application.LinuxWindow{Icon: appIcon},
				KeyBindings: map[string]func(application.Window){
					"F8":     func(_ application.Window) { go d.ProjectionWindow("controls") },
					"F11":    func(w application.Window) { w.(*application.WebviewWindow).ToggleFullscreen() },
					"Escape": func(_ application.Window) { go d.ProjectionWindow("escape") },
				},
			})
			d.projection = win
			win.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
				application.InvokeAsync(func() {
					if d.projection == win {
						d.projection = nil
					}
				})
			})
			if readerScreen, err := d.window.GetScreen(); err == nil {
				for _, screen := range d.app.Screen.GetAll() {
					if screen.ID != readerScreen.ID {
						win.SetScreen(screen)
						win.Center()
						break
					}
				}
			}
		}
		switch action {
		case "fullscreen":
			d.projection.Fullscreen()
		case "window":
			d.projection.UnFullscreen()
		case "toggle-fullscreen":
			d.projection.ToggleFullscreen()
		}
		d.projection.Show()
		// Leave keyboard focus with the operator when publishing a passage.
		if action == "show" {
			d.window.Focus()
		} else {
			d.projection.Focus()
		}
	})
	return nil
}

func (d *desktop) Copy(text string) error {
	if !d.app.Clipboard.SetText(text) {
		return fmt.Errorf("clipboard unavailable")
	}
	return nil
}
func (d *desktop) Quit() error {
	if d.app == nil {
		return fmt.Errorf("desktop unavailable")
	}
	go d.app.Quit()
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

func (d *desktop) FinishSmoke(passed bool, frontendVersion string) error {
	if d.smokeDir == "" {
		return fmt.Errorf("smoke mode not enabled")
	}
	clipboard, clipboardOK := d.app.Clipboard.Text()
	passed = passed && clipboardOK && strings.Contains(clipboard, "起初") && frontendVersion == version
	report := map[string]any{"passed": passed, "os": runtime.GOOS, "arch": runtime.GOARCH, "version": version, "frontendVersion": frontendVersion, "nativeWebview": true, "clipboardRoundTrip": strings.Contains(clipboard, "起初"), "fileDialogAutomation": false}
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
	importRoot := filepath.Join(config, "Bible", "imports")
	if err := service.CleanupEditionInputs(importRoot); err != nil {
		log.Print("IMPORT_STAGING_CLEANUP: pending inputs retained")
	}
	library, libraryErr := editions.Open(filepath.Join(config, "Bible", "editions.sqlite"))
	if libraryErr != nil {
		log.Print("EDITION_LIBRARY_UNAVAILABLE: user library retained; bundled reading available")
	}
	svc := service.NewWithEditions(data, store, desk, library, importRoot)
	defer func() {
		service.CloseEditionInputs(svc)
		if library != nil {
			_ = library.Close()
		}
	}()
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
	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "reader", Title: "圣经 · Bible", Width: p.WindowWidth, Height: p.WindowHeight,
		MinWidth: 1024, MinHeight: 640, URL: url, StartState: state,
		BackgroundColour: application.NewRGB(255, 255, 255), Linux: application.LinuxWindow{Icon: appIcon},
		KeyBindings: map[string]func(application.Window){
			"F8": func(window application.Window) {
				window.(*application.WebviewWindow).ExecJS("window.dispatchEvent(new Event('bible:projection-controls'))")
			},
			"CmdOrCtrl+f": func(window application.Window) {
				if webview, ok := window.(*application.WebviewWindow); ok {
					webview.ExecJS("window.dispatchEvent(new Event('bible:search'))")
				}
			},
			"CmdOrCtrl+q": func(window application.Window) {
				if webview, ok := window.(*application.WebviewWindow); ok {
					webview.ExecJS("window.dispatchEvent(new Event('bible:quit'))")
				}
			},
		},
	})
	desk.window = win
	if runtime.GOOS == "darwin" {
		menu := application.NewMenu()
		appMenu := menu.AddSubmenu("Bible")
		appMenu.AddRole(application.About)
		appMenu.AddSeparator()
		quitLabel := "退出圣经"
		if p.UILanguage == "en" {
			quitLabel = "Quit Bible"
		}
		appMenu.Add(quitLabel).SetAccelerator("CmdOrCtrl+q").OnClick(func(_ *application.Context) {
			win.ExecJS("window.dispatchEvent(new Event('bible:quit'))")
		})
		menu.AddRole(application.EditMenu)
		app.Menu.Set(menu)
	}
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
	win.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		go desk.ProjectionWindow("stop")
	})
	// Native CI smoke mode starts the real WebView and runs bridge checks after the page loads.
	if slices.Contains(os.Args, "--smoke-test") {
		go func() { time.Sleep(30 * time.Second); log.Print("NATIVE_SMOKE_TIMEOUT"); app.Quit() }()
	}
	app.OnShutdown(func() { saveWindow(nil) })
	if e = app.Run(); e != nil {
		log.Fatal("DESKTOP_START_ERROR")
	}
}
