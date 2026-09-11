#!/bin/bash
# Brings a freshly created sandbox to serving. Everything expensive already
# happened at image build time — the repo is cloned, node_modules installed,
# host.db carries the schema — so this is per-workspace work only and takes a
# second or two.
#
# Started once, fire-and-forget, right after the sandbox is created (and again
# on every resume: a session boots from the filesystem snapshot with no
# processes). Not the image's ENTRYPOINT: the platform runs none.
set -uo pipefail

WORKSPACE="${SUPERSET_SANDBOX_WORKSPACE_PATH:-/workspace}"
BRANCH="${SUPERSET_SANDBOX_BRANCH:-}"
REPO_URL="${SUPERSET_SANDBOX_REPO_URL:-}"

# host-service reads PORT; pinned here so nothing the platform or the image
# sets can move it off the port the sandbox exposes.
export PORT="${SUPERSET_SANDBOX_HOST_PORT:-4879}"

# The environment's variables. The sandbox's own env holds only the workspace
# identity — the platform caps it at 4 KB — so provisioning writes the rest
# here (root-only) and everything below, host-service and the display's
# autostart included, descends from this shell.
if [ -f /data/environment.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /data/environment.env
  set +a
fi

# The schema is baked, so first boot has nothing to migrate. Copied rather than
# used in place because /data is where a persistent volume would mount.
mkdir -p /data
if [ ! -f /data/host.db ] && [ -f /app/host.db.template ]; then
  cp /app/host.db.template /data/host.db
fi

# The image bakes no repo, but an environment forked from a configured sandbox
# may carry one. When the workspace wants that repo, moving to its
# branch is a one-ref fetch against an object store that is already warm. When
# it wants a different one — any project that isn't the baked one — the baked
# objects are useless and it clones instead, which is what provisioning did for
# every workspace before the repo was baked.
#
# Getting this wrong is silent rather than loud: fetching the requested branch
# from the wrong origin leaves a sandbox serving somebody else's code, so the
# URLs are compared rather than assumed to match.
BOOTSTRAP_MARKER=/data/.workspace-bootstrapped
BOOT_LOG=/data/boot.log

if [ -n "$REPO_URL" ] && [ ! -f "$BOOTSTRAP_MARKER" ]; then
  # A fork's filesystem comes from a snapshot; give a checkout that should be
  # there a moment to appear before concluding it is not.
  for _ in $(seq 1 60); do [ -e "$WORKSPACE/.git/config" ] && break; sleep 0.5; done
  BAKED_URL=$(git -C "$WORKSPACE" remote get-url origin 2>/dev/null || echo "")
  echo "$(date -u +%FT%TZ) bootstrap baked='$BAKED_URL' requested='$REPO_URL' git=$([ -d "$WORKSPACE/.git" ] && echo yes || echo no) modules=$([ -d "$WORKSPACE/node_modules" ] && echo yes || echo no)" >> "$BOOT_LOG"
  if [ -n "${SUPERSET_SANDBOX_GIT_TOKEN:-}" ]; then
    export GIT_ASKPASS=/app/git-askpass.sh
  fi
  if [ "$BAKED_URL" = "$REPO_URL" ] && [ -d "$WORKSPACE/.git" ]; then
    (
      cd "$WORKSPACE" || exit 1
      git fetch --depth 1 origin "$BRANCH" >/dev/null 2>&1 &&
        git checkout -q -B "$BRANCH" FETCH_HEAD >/dev/null 2>&1
    ) && touch "$BOOTSTRAP_MARKER"
  else
    rm -rf "$WORKSPACE"
    if git clone --depth 1 --single-branch --branch "$BRANCH" "$REPO_URL" "$WORKSPACE" \
      >/dev/null 2>&1 ||
      git clone --depth 1 "$REPO_URL" "$WORKSPACE" >/dev/null 2>&1; then
      touch "$BOOTSTRAP_MARKER"
    fi
  fi
  unset GIT_ASKPASS
fi

# Docker for the projects that need it; the VM has no init to start it. A
# daemon that fails to come up costs `docker`, not the workspace.
if command -v dockerd >/dev/null 2>&1 && ! pgrep -x dockerd >/dev/null; then
  dockerd >/var/log/dockerd.log 2>&1 &
fi

# The display for the desktop pane. Xvnc listens on loopback only; host-service
# proxies /desktop/vnc onto it, so nothing here is reachable from outside the
# sandbox. All fire-and-forget: a missing display costs the pane, not the
# workspace.
if command -v Xvnc >/dev/null 2>&1; then
  export DISPLAY=:1
  # No GPU: GTK and Chrome render through llvmpipe instead of probing for one.
  export LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe
  # A resumed session restores the previous session's lock and socket files
  # but none of its processes; the stale ones would keep Xvnc from starting.
  rm -f /tmp/.X1-lock /tmp/.X11-unix/X1
  # xfce4-session, xfconf, Chrome and Electron all look for the system bus;
  # the session buses dbus-launch leaves behind are a different thing.
  if [ ! -S /run/dbus/system_bus_socket ]; then
    mkdir -p /run/dbus && dbus-daemon --system --fork >/dev/null 2>&1
  fi
  # 1920x1200 at 96 DPI, scaled to fit the pane. Every client arrives from
  # loopback, so one misbehaving client must not blacklist the rest.
  Xvnc :1 -geometry 1920x1200 -depth 24 -dpi 96 -rfbport 5900 -localhost \
    -SecurityTypes None -AlwaysShared -BlacklistThreshold 1000000 \
    -desktop superset >/dev/null 2>&1 &
  (
    # The socket appears before the server accepts connections.
    for _ in $(seq 1 80); do xdpyinfo -display :1 >/dev/null 2>&1 && break; sleep 0.25; done
    # The wallpaper is chosen once per workspace from the set the image ships,
    # by the workspace id, so it is the same on every wake and differs between
    # boxes. Written before the session starts: xfdesktop reads it on launch.
    if [ -d /usr/share/backgrounds/superset ]; then
      COUNT=$(find /usr/share/backgrounds/superset -name '*.jpg' | wc -l)
      SEED=$(printf '%s' "${SUPERSET_SANDBOX_WORKSPACE_ID:-$(hostname)}" | cksum | cut -d' ' -f1)
      WALLPAPER="/usr/share/backgrounds/superset/$((SEED % COUNT)).jpg"
      mkdir -p /root/.config/xfce4/xfconf/xfce-perchannel-xml
      cat > /root/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml <<DESKTOP
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-desktop" version="1.0">
  <property name="backdrop" type="empty">
    <property name="screen0" type="empty">
      <property name="monitorVNC-0" type="empty">
        <property name="workspace0" type="empty">
          <property name="image-style" type="int" value="5"/>
          <property name="last-image" type="string" value="$WALLPAPER"/>
        </property>
      </property>
      <property name="monitor0" type="empty">
        <property name="workspace0" type="empty">
          <property name="image-style" type="int" value="5"/>
          <property name="last-image" type="string" value="$WALLPAPER"/>
        </property>
      </property>
      <property name="monitorscreen" type="empty">
        <property name="workspace0" type="empty">
          <property name="image-style" type="int" value="5"/>
          <property name="last-image" type="string" value="$WALLPAPER"/>
        </property>
      </property>
    </property>
  </property>
  <property name="desktop-icons" type="empty">
    <property name="style" type="int" value="0"/>
  </property>
</channel>
DESKTOP
    fi
    # The Xfce session brings up the panel, window manager, desktop and the
    # ~/.config/autostart entries (Plank; the golden adds the dev stack).
    if command -v xfce4-session >/dev/null 2>&1; then
      dbus-launch --exit-with-session xfce4-session >/dev/null 2>&1 &
    fi
  ) &
fi

cd /app
exec node host-service.js
