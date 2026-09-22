# Login shells on a cloud workspace sandbox. The image ships no locale
# database; C.UTF-8 is built into glibc and keeps prompt glyphs rendering.
export LANG="${LANG:-C.UTF-8}" LC_ALL="${LC_ALL:-C.UTF-8}"
[ -f /etc/superset/contract.sh ] && . /etc/superset/contract.sh
export SUPERSET_WORKSPACE_PATH="${SUPERSET_WORKSPACE_DIR:-/workspace}"
export BROWSER=/usr/local/bin/google-chrome
export DISPLAY="${DISPLAY:-${SUPERSET_DISPLAY:-:1}}"
# The desktop session's bus, written by superset-desktop-init once it is up.
[ -r "${SUPERSET_RUN_DIR:-/run/superset}/desktop.env" ] && . "${SUPERSET_RUN_DIR:-/run/superset}/desktop.env"
case ":$PATH:" in *":/usr/local/go/bin:"*) ;; *) export PATH="$PATH:/usr/local/go/bin" ;; esac
# The agent CLIs are installed by root at image build; a self-update from the
# sandbox user has nowhere to write and only prints a warning every session.
export DISABLE_AUTOUPDATER=1
