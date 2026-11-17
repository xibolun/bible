"""Resolve a staged package's desktop icon through real GTK4 theme lookup.

Run with system Python (python3-gi and gir1.2-gtk-4.0), in a graphical session
or under xvfb-run. --share points to the extracted package's usr/share.
"""
import argparse
import json
import os
from pathlib import Path


def verify(share):
    import gi
    gi.require_version('Gtk', '4.0')
    gi.require_version('Gdk', '4.0')
    from gi.repository import Gdk, Gio, Gtk

    share = share.resolve()
    identity = 'io.github.xibolun.bible'
    # Gio validates the Exec target. Prefer the staged binary, without launching it.
    os.environ['PATH'] = str(share.parent/'bin')+os.pathsep+os.environ.get('PATH', '')
    desktop = Gio.DesktopAppInfo.new_from_filename(str(share/'applications'/f'{identity}.desktop'))
    if desktop is None or desktop.get_string('Icon') != identity:
        raise RuntimeError('Desktop entry does not identify the installed Bible icon')
    if desktop.get_string('StartupWMClass') != identity:
        raise RuntimeError('Desktop/window identity mismatch')
    Gtk.init()
    display = Gdk.Display.get_default()
    if display is None:
        raise RuntimeError('Run the icon check in a graphical session or under xvfb-run')
    theme = Gtk.IconTheme.new()
    theme.set_search_path([str(share/'icons'), *Gtk.IconTheme.get_for_display(display).get_search_path()])
    theme.set_theme_name('hicolor')
    if not theme.has_icon(identity):
        raise RuntimeError('GTK4 cannot find the packaged Bible icon in registered theme directories')
    resolved = {}
    for size in (16, 24, 32, 48, 64, 128, 256, 512):
        paintable = theme.lookup_icon(identity, None, size, 1, Gtk.TextDirection.NONE, 0)
        file = paintable.get_file()
        path = Path(file.get_path()).resolve() if file and file.get_path() else None
        if path is None or not path.is_relative_to(share/'icons') or path.stem != identity:
            raise RuntimeError(f'{size}px icon fell back outside the package: {path}')
        resolved[str(size)] = str(path.relative_to(share))
    return {'desktopId': desktop.get_id(), 'icon': identity, 'resolved': resolved}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--share', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.share), indent=2))


if __name__ == '__main__':
    main()
