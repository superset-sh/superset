#!/usr/bin/env bash
# Renders the desktop templates into the sandbox user's home with the numbers
# from the contract, compiles the dock's schema override, and points Thunar's
# launcher at the workspace. Declares every template as an input, so a
# changed number or file re-renders on the next wake.
set -euo pipefail
. /etc/superset/contract.sh
user="$SUPERSET_USER"; home="$SUPERSET_HOME_DIR"; t="$SUPERSET_DESKTOP_TEMPLATES"

render() { # template dest
	sed -e "s|@PANEL_HEIGHT@|28|g" \
		-e "s|@TITLE_FONT@|Inter Bold 10|g" \
		-e "s|@UI_FONT@|Inter 10|g" \
		-e "s|@MONOSPACE_FONT@|JetBrainsMono Nerd Font 10|g" \
		-e "s|@TERMINAL_FONT@|JetBrainsMono Nerd Font 11|g" \
		-e "s|@CURSOR_SIZE@|24|g" \
		"$1" > "$2"
	chown "$user:$user" "$2"; chmod 0644 "$2"
}
own_dir() { install -d -m 0755 -o "$user" -g "$user" "$@"; }

xml="$home/.config/xfce4/xfconf/xfce-perchannel-xml"
own_dir "$home/.config" "$home/.config/xfce4" "$home/.config/xfce4/xfconf" "$xml" \
	"$home/.config/xfce4/terminal" "$home/.config/gtk-3.0" "$home/.config/autostart" \
	"$home/.config/plank" "$home/.config/plank/dock1" "$home/.config/plank/dock1/launchers"
render "$t/xfce4-panel.xml" "$xml/xfce4-panel.xml"
render "$t/xfwm4.xml" "$xml/xfwm4.xml"
render "$t/xsettings.xml" "$xml/xsettings.xml"
render "$t/terminalrc" "$home/.config/xfce4/terminal/terminalrc"
render "$t/gtk.css" "$home/.config/gtk-3.0/gtk.css"
render "$t/autostart/plank.desktop" "$home/.config/autostart/plank.desktop"
for item in "$t"/plank-launchers/*.dockitem; do
	render "$item" "$home/.config/plank/dock1/launchers/$(basename "$item")"
done
chown "$user:$user" "$home/.claude.json" 2>/dev/null || true

glib-compile-schemas /usr/share/glib-2.0/schemas
if [ -f /usr/share/applications/thunar.desktop ]; then
	sed -i -E "s|^Name=Thunar File Manager|Name=Files|; s|^Icon=org.xfce.thunar|Icon=folder|; s|^Exec=thunar %U|Exec=thunar ${SUPERSET_WORKSPACE_DIR}|" /usr/share/applications/thunar.desktop
fi
