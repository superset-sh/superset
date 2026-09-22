#!/usr/bin/env bash
# Chrome's desktop entry, wrappers and two pre-seeded profiles for the sandbox
# user: the visible one (CDP on the debug port, what the dock opens and an
# agent drives; in its own directory because Chrome 136+ refuses remote
# debugging on the default one) and a private one for automation that
# launches its own Chrome, since Chrome is single-instance per profile. Runs after
# install-chrome: the deb ships google-chrome.desktop and overwrites the patch.
set -euo pipefail
. /etc/superset/contract.sh
user="$SUPERSET_USER"; home="$SUPERSET_HOME_DIR"
[ -x /usr/bin/google-chrome-stable ] || { echo "Chrome is not installed" >&2; exit 1; }

# The dock and xdg-open go through the wrapper, which owns the flags.
desktop=/usr/share/applications/google-chrome.desktop
if [ -f "$desktop" ]; then
	sed -i -E "s|^Exec=/usr/bin/google-chrome-stable( .*)?( %U)?$|Exec=/usr/local/bin/google-chrome %U|" "$desktop"
fi
update-alternatives --install /usr/bin/x-www-browser x-www-browser /usr/local/bin/google-chrome 300
update-alternatives --install /usr/bin/gnome-www-browser gnome-www-browser /usr/local/bin/google-chrome 300

seed_profile() {
	local dir="$1"
	install -d -m 0755 -o "$user" -g "$user" "$dir" "$dir/Default"
	install -m 0644 -o "$user" -g "$user" "${SUPERSET_DESKTOP_TEMPLATES}/chrome-preferences.json" "$dir/Default/Preferences"
	install -m 0644 -o "$user" -g "$user" /dev/null "$dir/First Run"
}
install -d -m 0755 -o "$user" -g "$user" "$home/.config"
seed_profile "$home/.config/google-chrome-visible"
seed_profile "$home/.config/google-chrome-playwright"
