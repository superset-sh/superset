/**
 * Builds the sandbox image that hosts host-service and pushes it to Vercel
 * Container Registry, where Sandbox.create() pulls it by repository name.
 *
 *   bun run scripts/sandbox/image.ts           # build linux/amd64 and push
 *   bun run scripts/sandbox/image.ts --dry     # print the Dockerfile only
 *   SANDBOX_IMAGE_TAG=2026-09-10 bun run …     # tag other than `latest`
 *
 * Needs Docker running and a registry login for the sandboxes project:
 * `vercel vcr login docker --project <VERCEL_SANDBOX_PROJECT_ID> --scope <team>`
 * (valid 12 hours). The project and team come from the root .env.
 *
 * Two constraints keep a compiler out of this image, and both must hold:
 * node-pty's prebuilt binary links glibc, so Alpine's musl would force a
 * source build; and only the node-pty version this repo pins ships prebuilds
 * at all, so installing plain `node-pty` compiles even on Debian. A compile
 * needs build-essential + python3, roughly 315 MiB.
 */
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SANDBOX_CREDENTIAL_PLACEHOLDER,
	SANDBOX_IMAGE_NAME,
	SANDBOX_WORKSPACE_PATH,
} from "../../packages/shared/src/constants.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const HOST_SERVICE_PKG = join(
	REPO_ROOT,
	"packages",
	"host-service",
	"package.json",
);

/** host-service's default; the platform reserves nothing here. */
const HOST_SERVICE_PORT = 4879;
const IMAGE_TAG = process.env.SANDBOX_IMAGE_TAG ?? "latest";
const IMAGE_REF = `${SANDBOX_IMAGE_NAME}:${IMAGE_TAG}`;

/**
 * Read from host-service rather than hardcoded: a sandbox running a
 * different better-sqlite3 than host-service was built against is a
 * native-ABI mismatch that surfaces as a runtime crash.
 */
function pinnedVersion(dep: string): string {
	const pkg = JSON.parse(readFileSync(HOST_SERVICE_PKG, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	const version = pkg.dependencies?.[dep];
	if (!version) {
		throw new Error(
			`${dep} is not a host-service dependency — the sandbox image and host-service must agree on native module versions`,
		);
	}
	return version;
}

// The repo pins bun once, in .bun-version; a sandbox on any other version
// rejects the frozen lockfile and every dependency install fails.
const BUN_VERSION = readFileSync(
	join(REPO_ROOT, ".bun-version"),
	"utf8",
).trim();

const AGENT_CLI_VERSIONS = {
	claudeCode: "2.1.257",
	codex: "0.152.0",
} as const;

const natives = [
	`better-sqlite3@${pinnedVersion("better-sqlite3")}`,
	`node-pty@${pinnedVersion("node-pty")}`,
];

/** Imported at module load but never executed, so they only need to resolve. */
const runtimeResolutionOnly = ["@parcel/watcher", "@xterm/headless"];

const APT_PACKAGES = [
	// git for the workspace checkout, openssh-client for SSH remotes,
	// ca-certificates for HTTPS clones. Deliberately no build-essential or
	// python3 — see the header.
	"git",
	"git-lfs",
	"ca-certificates",
	"openssh-client",
	"curl",
	"wget",
	"procps",
	"rsync",
	"zip",
	"unzip",
	"tzdata",
	"locales",
	"less",
	"jq",
	"ripgrep",
	"sqlite3",
	"inotify-tools",
	"dnsutils",
	"iputils-ping",
	"netcat-openbsd",
	"vim",
	"iproute2",
];

/**
 * The toolchain a project might need: compilers and headers, Python, a JDK,
 * Go (upstream, below), Docker (upstream, below), GitHub's CLI, and the usual
 * shell tools. Debian's own Docker and Go lag by years, so those come from
 * their vendors.
 */
const TOOLCHAIN_PACKAGES = [
	"build-essential",
	"pkg-config",
	"libx11-dev",
	"libxkbfile-dev",
	"libsecret-1-dev",
	"clang",
	"python3",
	"python3-pip",
	"python3-venv",
	"pipx",
	"default-jdk",
	"universal-ctags",
	"gnupg",
	"lsb-release",
	"iptables",
	"fuse-overlayfs",
	"yq",
	"xvfb",
	"emacs-nox",
	"nano",
	"htop",
	"lsof",
	"net-tools",
	"man-db",
	"tmux",
	"pigz",
	"oathtool",
];
const GO_VERSION = "1.27.1";
const VENDOR_TOOLS_COMMAND = [
	"install -m 0755 -d /etc/apt/keyrings",
	"curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc",
	`echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list`,
	"curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg",
	`echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list`,
	"apt-get update",
	"apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin gh",
	"rm -rf /var/lib/apt/lists/*",
	`curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz | tar -C /usr/local -xz`,
	"ln -s /usr/local/go/bin/go /usr/local/bin/go && ln -s /usr/local/go/bin/gofmt /usr/local/bin/gofmt",
].join(" && ");

/** Docker's default overlay2 cannot stack on the sandbox's overlay root. */
const DOCKER_DAEMON_JSON = { "storage-driver": "fuse-overlayfs" };

/**
 * The desktop, installed with recommends: the xfce4 metapackage and the
 * standard companions of a VNC desktop — display server and tools, agents'
 * input and clipboard tools, screen recording, keyring, editor, fonts, theme
 * build tools. Nothing here is trimmed to save space; the SVG pixbuf loader
 * that every icon theme needs only arrives as a recommend, and each missing
 * package has cost a rebuild to find.
 */
const DESKTOP_PACKAGES = [
	"xfce4",
	"xfce4-terminal",
	"xfce4-settings",
	"thunar",
	"tigervnc-standalone-server",
	"tigervnc-common",
	"tigervnc-tools",
	"x11-utils",
	"x11-xserver-utils",
	"xdg-utils",
	"xdotool",
	"xclip",
	"dbus-x11",
	"at-spi2-core",
	"mousepad",
	"seahorse",
	"gnome-keyring",
	"sudo",
	"ffmpeg",
	"imagemagick",
	"adwaita-icon-theme",
	"gnome-themes-extra",
	"librsvg2-common",
	"plank",
	"fonts-dejavu-core",
	"fonts-inter",
	"fonts-jetbrains-mono",
	"sassc",
	"libglib2.0-dev-bin",
	"libglib2.0-bin",
	"libgtk-3-bin",
	"libxml2-utils",
	"dconf-cli",
	"xz-utils",
];

/**
 * The GTK, icon and cursor themes, built from source at image time and
 * pinned by commit. The GTK repo also carries the xfwm4 window frames.
 */
const THEME_SOURCES = [
	{
		repo: "https://github.com/vinceliuice/WhiteSur-gtk-theme",
		commit: "99247ecd219bdc1c7409baff062b4aafcf1102a7",
		install:
			"./install.sh -d /usr/share/themes -c Light -c Dark -t default --silent-mode",
	},
	{
		repo: "https://github.com/vinceliuice/WhiteSur-icon-theme",
		commit: "73d8040da51a9ed74e47c7366e7e9ff437601a5c",
		install: "./install.sh -d /usr/share/icons -t default",
	},
	{
		repo: "https://github.com/vinceliuice/WhiteSur-cursors",
		commit: "e190baf618ed95ee217d2fd45589bd309b37672b",
		install: "./install.sh",
	},
];
const THEME_COMMANDS = THEME_SOURCES.map(
	({ repo, commit, install }) =>
		// The installers read the login name and home; a build has neither.
		`mkdir -p /tmp/theme && cd /tmp/theme && git init -q && git fetch -q --depth 1 ${repo} ${commit} && git checkout -q FETCH_HEAD && USER=root HOME=/root ${install} >/dev/null && cd / && rm -rf /tmp/theme`,
).join(" && ");

/**
 * A wallpaper per workspace, picked by the boot script from these: photos
 * from elementary's wallpaper set (Unsplash photographers, credited in each
 * file's EXIF), pinned by commit and cropped to the display at build time.
 */
const WALLPAPER_SOURCE =
	"https://raw.githubusercontent.com/elementary/wallpapers/b198df190adeffe8562e67d28370c91442f7dd77/backgrounds";
const WALLPAPERS = [
	"Tj Holowaychuk.jpg",
	"Martin Adams.jpg",
	"Morskie Oko.jpg",
	"Sunset by the Pier.jpg",
	"Photo by SpaceX.jpg",
	"Ashim DSilva.jpg",
	"Viktor Forgacs.jpg",
	"Snow-Capped Mountain.jpg",
];
const WALLPAPER_COMMANDS = WALLPAPERS.map(
	(file, index) =>
		`curl -fsSL '${WALLPAPER_SOURCE}/${encodeURIComponent(file)}' -o /tmp/wallpaper.jpg && convert /tmp/wallpaper.jpg -resize 1920x1200^ -gravity center -extent 1920x1200 -quality 85 /usr/share/backgrounds/superset/${index}.jpg && rm -f /tmp/wallpaper.jpg`,
).join(" && ");

/**
 * Plank's three launchers: browser, files, terminal. Plank pairs a window with
 * the launcher whose desktop file is named after the window's class, so
 * Chrome's own entry is the launcher (its Exec is patched below) — a second
 * entry for the same binary puts a second Chrome in the dock the moment one
 * opens.
 */
const PLANK_LAUNCHERS = {
	"01-chrome.dockitem": "google-chrome.desktop",
	"02-files.dockitem": "thunar.desktop",
	"03-terminal.dockitem": "xfce4-terminal.desktop",
};

/**
 * Chrome refuses to run as root without `--no-sandbox`; the sandbox runs
 * everything as root, and the microVM is the isolation boundary. `--test-type`
 * hides the "unsupported flag" bar that `--no-sandbox` otherwise puts on
 * every window. First run is pre-answered: the `First Run` sentinel and
 * `--no-first-run` skip the terms dialog, and the policy below turns off the
 * sign-in, sync and default-browser prompts a fresh profile would open with.
 */
/** Chrome draws the window manager's frame instead of its own tab-strip frame. */
const CHROME_PREFERENCES = { browser: { custom_chrome_frame: false } };

const CHROME_POLICY = {
	MetricsReportingEnabled: false,
	DefaultBrowserSettingEnabled: false,
	PromotionsEnabled: false,
	BrowserSignin: 0,
	SyncDisabled: true,
};

/**
 * A stopped sandbox kills Chrome mid-session, so without the crash-bubble
 * flags every wake opens on a "Restore pages?" bubble. The debugging port is
 * loopback-only and is how an agent drives the browser; SwiftShader gives
 * WebGL a software renderer, since there is no GPU.
 */
const CHROME_FLAGS =
	"--no-sandbox --test-type --no-first-run --no-default-browser-check --disable-dev-shm-usage --password-store=basic --start-maximized --disable-session-crashed-bubble --hide-crash-restore-bubble --remote-debugging-port=9222 --use-angle=swiftshader-webgl --enable-unsafe-swiftshader";

/**
 * Plank keeps its preferences in GSettings, not a file, so the dock is
 * configured through a schema override compiled into the image.
 */
const PLANK_GSETTINGS = `[net.launchpad.plank.dock.settings]
theme="Superset"
icon-size=48
zoom-enabled=false
position="bottom"
alignment="center"
hide-mode="none"
dock-items=${JSON.stringify(Object.keys(PLANK_LAUNCHERS))}
`;

/** The common macOS-style light dock (Big Sur Light), with Plank's launch bounce and zoom off. */
const PLANK_THEME = `[PlankTheme]
TopRoundness=15
BottomRoundness=15
LineWidth=0
OuterStrokeColor=255;;255;;255;;0
FillStartColor=255;;255;;255;;140
FillEndColor=255;;255;;255;;140
InnerStrokeColor=255;;255;;255;;0
[PlankDockTheme]
HorizPadding=2
TopPadding=1.4
BottomPadding=2
ItemPadding=1.3
IndicatorSize=8
IconShadowSize=0
LaunchBounceHeight=0
UrgentBounceHeight=0
LaunchBounceTime=0
ClickTime=0
ActiveTime=120
SlideTime=120
ItemMoveTime=120
`;

/**
 * The panel is light and theme-drawn, so its text is set black. Thunar puts
 * a warning bar on every window because the account is root; the sandbox has
 * no other account, so the bar is collapsed to nothing.
 */
const GTK_CSS = `.xfce4-panel, .xfce4-panel button, .xfce4-panel label, #clock-button label {
  color: #000000;
}
infobar, infobar > revealer > box {
  background: none;
  border: none;
  box-shadow: none;
  min-height: 0;
  padding: 0;
  margin: 0;
}
infobar label, infobar button, infobar image {
  min-height: 0;
  min-width: 0;
  padding: 0;
  margin: 0;
  font-size: 0.1px;
  color: transparent;
  opacity: 0;
}
`;

/** The app's mark (apps/desktop … SupersetIcon), black on the light panel. */
const SUPERSET_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="19.84 65.5 144.26 58.6"><path fill="#000000" d="M42.0256 67.5455H51.1165V76.6364H42.0256V67.5455ZM32.9347 67.5455H42.0256V76.6364H32.9347V67.5455ZM32.9347 76.6364H42.0256V85.7273H32.9347V76.6364ZM23.8438 85.7273H32.9347V94.8182H23.8438V85.7273ZM23.8438 94.8182H32.9347V103.909H23.8438V94.8182ZM32.9347 103.909H42.0256V113H32.9347V103.909ZM32.9347 113H42.0256V122.091H32.9347V113ZM42.0256 113H51.1165V122.091H42.0256V113ZM78.3537 67.5455H87.4446V76.6364H78.3537V67.5455ZM69.2628 67.5455H78.3537V76.6364H69.2628V67.5455ZM69.2628 76.6364H78.3537V85.7273H69.2628V76.6364ZM60.1719 85.7273H69.2628V94.8182H60.1719V85.7273ZM60.1719 94.8182H69.2628V103.909H60.1719V94.8182ZM69.2628 103.909H78.3537V113H69.2628V103.909ZM69.2628 113H78.3537V122.091H69.2628V113ZM78.3537 113H87.4446V122.091H78.3537V113ZM96.5 67.5455H105.591V76.6364H96.5V67.5455ZM105.591 76.6364H114.682V85.7273H105.591V76.6364ZM114.682 85.7273H123.773V94.8182H114.682V85.7273ZM105.591 103.909H114.682V113H105.591V103.909ZM96.5 113H105.591V122.091H96.5V113ZM114.682 94.8182H123.773V103.909H114.682V94.8182ZM105.591 113H114.682V122.091H105.591V113ZM105.591 67.5455H114.682V76.6364H105.591V67.5455ZM132.828 67.5455H141.919V76.6364H132.828V67.5455ZM141.919 76.6364H151.01V85.7273H141.919V76.6364ZM151.01 85.7273H160.101V94.8182H151.01V85.7273ZM141.919 103.909H151.01V113H141.919V103.909ZM132.828 113H141.919V122.091H132.828V113ZM151.01 94.8182H160.101V103.909H151.01V94.8182ZM141.919 113H151.01V122.091H141.919V113ZM141.919 67.5455H151.01V76.6364H141.919V67.5455Z"/></svg>
`;

/** The terminal: the app's monospace face on a dark palette. */
const TERMINAL_RC = `[Configuration]
FontName=JetBrains Mono 11
MiscAlwaysShowTabs=FALSE
MiscBell=FALSE
MiscCursorBlinks=FALSE
MiscCursorShape=TERMINAL_CURSOR_SHAPE_BLOCK
MiscDefaultGeometry=110x30
MiscMenubarDefault=FALSE
MiscToolbarDefault=FALSE
MiscHighlightUrls=TRUE
ScrollingBar=TERMINAL_SCROLLBAR_NONE
ColorForeground=#e6e1dc
ColorBackground=#151110
ColorCursor=#e6e1dc
ColorPalette=#1c1a19;#f07178;#c3e88d;#ffcb6b;#82aaff;#c792ea;#89ddff;#d6d0ca;#5c5552;#ff8b92;#ddffa7;#ffe585;#9cc4ff;#e1acff;#a3f7ff;#ffffff
`;

/** Top panel only: menu, window buttons, clock. Xfce's default adds a second dock we replace with Plank. */
const PANEL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-panel" version="1.0">
  <property name="configver" type="int" value="2"/>
  <property name="panels" type="array">
    <value type="int" value="1"/>
    <property name="panel-1" type="empty">
      <property name="position" type="string" value="p=6;x=0;y=0"/>
      <property name="length" type="uint" value="100"/>
      <property name="position-locked" type="bool" value="true"/>
      <property name="size" type="uint" value="28"/>
      <property name="background-style" type="uint" value="0"/>
      <property name="plugin-ids" type="array">
        <value type="int" value="1"/>
        <value type="int" value="2"/>
        <value type="int" value="3"/>
        <value type="int" value="4"/>
        <value type="int" value="5"/>
      </property>
    </property>
  </property>
  <property name="plugins" type="empty">
    <property name="plugin-1" type="string" value="separator">
      <property name="style" type="uint" value="0"/>
    </property>
    <property name="plugin-2" type="string" value="applicationsmenu">
      <property name="show-button-title" type="bool" value="false"/>
      <property name="button-icon" type="string" value="superset"/>
    </property>
    <property name="plugin-3" type="string" value="separator">
      <property name="expand" type="bool" value="true"/>
      <property name="style" type="uint" value="0"/>
    </property>
    <property name="plugin-4" type="string" value="clock">
      <property name="digital-format" type="string" value="%a %b %-d  %-I:%M %p"/>
      <property name="digital-time-format" type="string" value="%a %b %-d  %-I:%M %p"/>
      <property name="digital-layout" type="uint" value="3"/>
    </property>
    <property name="plugin-5" type="string" value="separator">
      <property name="style" type="uint" value="0"/>
    </property>
  </property>
</channel>
`;

const XFWM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfwm4" version="1.0">
  <property name="general" type="empty">
    <property name="use_compositing" type="bool" value="true"/>
    <property name="show_frame_shadow" type="bool" value="true"/>
    <property name="show_popup_shadow" type="bool" value="true"/>
    <property name="theme" type="string" value="WhiteSur-Light"/>
    <property name="title_font" type="string" value="Inter Bold 10"/>
    <property name="title_alignment" type="string" value="center"/>
    <property name="button_layout" type="string" value="CHM|O"/>
    <property name="show_dock_shadow" type="bool" value="false"/>
  </property>
</channel>
`;

const XSETTINGS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<channel name="xsettings" version="1.0">
  <property name="Net" type="empty">
    <property name="ThemeName" type="string" value="WhiteSur-Light"/>
    <property name="IconThemeName" type="string" value="WhiteSur"/>
    <property name="EnableEventSounds" type="bool" value="false"/>
    <property name="EnableInputFeedbackSounds" type="bool" value="false"/>
  </property>
  <property name="Gtk" type="empty">
    <property name="FontName" type="string" value="Inter 10"/>
    <property name="MonospaceFontName" type="string" value="JetBrains Mono 10"/>
    <property name="CursorThemeName" type="string" value="WhiteSur-cursors"/>
    <property name="CursorThemeSize" type="int" value="24"/>
  </property>
  <property name="Xft" type="empty">
    <property name="Antialias" type="int" value="1"/>
    <property name="Hinting" type="int" value="1"/>
    <property name="HintStyle" type="string" value="hintslight"/>
    <property name="RGBA" type="string" value="rgb"/>
  </property>
</channel>
`;

const PLANK_AUTOSTART = `[Desktop Entry]
Type=Application
Name=Plank
Exec=plank
OnlyShowIn=XFCE;
`;

/**
 * Every first run of the Claude TUI otherwise opens with a theme picker, an
 * "approve this API key?" prompt and a workspace trust dialog — three
 * confirmations before a sandbox agent can do anything, on a machine whose
 * answers are the same every time. These are the keys the TUI writes when
 * you answer them; `-p` runs never write them, which is why the prompts
 * survive a headless smoke test. `customApiKeyResponses` matches on the
 * key's last 20 characters, so it stays valid as long as the placeholder does.
 * The builtin agent launches `claude --dangerously-skip-permissions`, which
 * opens a fourth dialog — accept Bypass Permissions mode — that headless runs
 * never reach either; this is the key that answers it.
 */
const CLAUDE_CONFIG = {
	hasCompletedOnboarding: true,
	bypassPermissionsModeAccepted: true,
	theme: "dark",
	customApiKeyResponses: {
		approved: [SANDBOX_CREDENTIAL_PLACEHOLDER.slice(-20)],
		rejected: [],
	},
	projects: {
		[SANDBOX_WORKSPACE_PATH]: {
			hasTrustDialogAccepted: true,
			projectOnboardingSeenCount: 1,
		},
	},
};

/**
 * The schema, baked. host-service creates it on first boot, which used to
 * mean provisioning ran host-service once just to initialise the database
 * and then killed it. Running that at build time instead removes the entire
 * step: a fresh sandbox copies a file.
 */
const SEED_TEMPLATE_DB = `
const { spawn } = require("node:child_process");
const p = spawn("node", ["host-service.js"], { stdio: ["ignore", "pipe", "pipe"] });
let out = "";
const done = (code) => { try { p.kill("SIGTERM"); } catch {} process.exit(code); };
const watch = (chunk) => { out += chunk; if (out.includes("Initialized at")) setTimeout(() => done(0), 2000); };
p.stdout.on("data", watch);
p.stderr.on("data", watch);
setTimeout(() => { console.error(out.slice(-800)); done(1); }, 60000);
`;

/**
 * SQLite in WAL mode leaves the schema in host.db.template-wal until
 * something checkpoints it, and a signalled process does not. Without this
 * the template ships as an empty 4 KiB file and every sandbox pays for the
 * migrations it was supposed to skip — which is why the size is asserted
 * rather than assumed.
 */
const CHECKPOINT_TEMPLATE_DB = `
const D = require("better-sqlite3");
const d = new D("/app/host.db.template");
d.pragma("journal_mode = DELETE");
d.close();
`;

export const dockerfile = `FROM node:24-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ${APT_PACKAGES.join(" ")} \\
 && apt-get install -y --no-install-recommends ${TOOLCHAIN_PACKAGES.join(" ")} \\
 && apt-get install -y ${DESKTOP_PACKAGES.join(" ")} && rm -rf /var/lib/apt/lists/*
RUN ${VENDOR_TOOLS_COMMAND}
COPY docker-daemon.json /etc/docker/daemon.json
RUN npm install -g bun@${BUN_VERSION} --no-audit --no-fund && bun --version
WORKDIR /app
# The bundle is ESM; without type=module Node parses /app/*.js as CommonJS and
# dies on the first \`import\`.
RUN npm init -y && npm pkg set type=module \\
 && npm install ${natives.join(" ")} --no-audit --no-fund \\
 && npm install ${runtimeResolutionOnly.join(" ")} --no-audit --no-fund \\
 && (test -d node_modules/node-pty/prebuilds/linux-x64 || (echo 'node-pty prebuild missing — it would compile at runtime' && exit 1))
# The agents the sandbox can actually run. Without a CLI installed the agent
# picker has nothing to offer, since a sandbox has none of the user's
# locally-installed agents. Both read their key from the environment.
RUN npm install -g @anthropic-ai/claude-code@${AGENT_CLI_VERSIONS.claudeCode} @openai/codex@${AGENT_CLI_VERSIONS.codex} --no-audit --no-fund && claude --version && codex --version
COPY claude.json /root/.claude.json
# Lands in /app so the externalised natives resolve from its node_modules.
COPY hostsvc-dist/ /app/
COPY hostsvc-drizzle/ /app/drizzle/
COPY agent-templates/ /app/agent-templates/
# The supervisor resolves the daemon as ../../../pty-daemon/dist relative to
# its own source path, which from /app/host-service.js lands at /. The daemon
# imports node-pty and Node resolves upward from /pty-daemon, so the modules
# are linked rather than installed twice and can never diverge on the addon.
COPY ptyd-dist/ /pty-daemon/dist/
RUN ln -s /app/node_modules /pty-daemon/node_modules
COPY seed-template-db.cjs checkpoint-template-db.cjs /app/
RUN ORGANIZATION_ID=00000000-0000-0000-0000-000000000000 HOST_DB_PATH=/app/host.db.template HOST_MIGRATIONS_FOLDER=/app/drizzle AUTH_TOKEN=build SUPERSET_API_URL=https://example.invalid SUPERSET_HOST_RUN_MODE=sandbox SUPERSET_SANDBOX_WORKSPACE_ID=build SUPERSET_SANDBOX_ACCESS_PUBLIC_KEY=build node seed-template-db.cjs \\
 && node checkpoint-template-db.cjs \\
 && test "$(stat -c %s /app/host.db.template)" -gt 100000 \\
 && rm -f /app/host.db.template-wal /app/host.db.template-shm seed-template-db.cjs checkpoint-template-db.cjs
# Chrome from Google's package (amd64 only, which is what sandboxes run).
RUN curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \\
 && apt-get update && apt-get install -y --no-install-recommends /tmp/chrome.deb && rm -rf /tmp/chrome.deb /var/lib/apt/lists/*
RUN sed -i -E 's|^Exec=/usr/bin/google-chrome-stable|Exec=/usr/bin/google-chrome-stable ${CHROME_FLAGS}|' /usr/share/applications/google-chrome.desktop
RUN sed -i -E 's|^Name=Thunar File Manager|Name=Files|; s|^Icon=org.xfce.thunar|Icon=folder|; s|^Exec=thunar %U|Exec=thunar /workspace|' /usr/share/applications/thunar.desktop
COPY chrome-policy.json /etc/opt/chrome/policies/managed/superset.json
COPY chrome-preferences.json /root/.config/google-chrome/Default/Preferences
RUN touch "/root/.config/google-chrome/First Run"
RUN ${THEME_COMMANDS} && fc-cache -f >/dev/null
RUN mkdir -p /usr/share/backgrounds/superset && ${WALLPAPER_COMMANDS}
COPY superset.svg /usr/share/icons/hicolor/scalable/apps/superset.svg
RUN gtk-update-icon-cache -f -q /usr/share/icons/hicolor
COPY plank-dock.theme /usr/share/plank/themes/Superset/dock.theme
COPY plank.gschema.override /usr/share/glib-2.0/schemas/90_superset-plank.gschema.override
RUN glib-compile-schemas /usr/share/glib-2.0/schemas
COPY desktop-config/ /root/.config/
COPY start.sh git-askpass.sh /app/
RUN chmod +x /app/start.sh /app/git-askpass.sh
ENV NODE_ENV=production PORT=${HOST_SERVICE_PORT}
EXPOSE ${HOST_SERVICE_PORT}
# No ENTRYPOINT: the platform runs none for custom images. /app/start.sh is
# launched through the sandbox API instead, once, without waiting on it.
`;

function assertBuilt(): void {
	for (const file of [
		"packages/host-service/dist/host-service.js",
		"packages/pty-daemon/dist/pty-daemon.js",
	]) {
		if (!existsSync(join(REPO_ROOT, file))) {
			throw new Error(
				`${file} is missing — run \`bun run --cwd packages/host-service build:host\` and \`bun run --cwd packages/pty-daemon build:daemon\` first`,
			);
		}
	}
}

/**
 * A build context assembled from the pieces the image needs, rather than the
 * repo root: that context would be the whole monorepo with node_modules.
 */
function assembleContext(): string {
	const context = mkdtempSync(join(tmpdir(), "superset-sandbox-image-"));
	const copy = (from: string, to: string) =>
		cpSync(join(REPO_ROOT, from), join(context, to), { recursive: true });
	copy("packages/host-service/dist", "hostsvc-dist");
	copy("packages/host-service/drizzle", "hostsvc-drizzle");
	copy("packages/agent-setup/templates", "agent-templates");
	copy("packages/pty-daemon/dist", "ptyd-dist");
	copy("scripts/sandbox/start.sh", "start.sh");
	copy("scripts/sandbox/git-askpass.sh", "git-askpass.sh");
	writeFileSync(join(context, "plank-dock.theme"), PLANK_THEME);
	writeFileSync(join(context, "superset.svg"), SUPERSET_ICON_SVG);
	writeFileSync(join(context, "plank.gschema.override"), PLANK_GSETTINGS);
	writeFileSync(
		join(context, "chrome-policy.json"),
		JSON.stringify(CHROME_POLICY),
	);
	writeFileSync(
		join(context, "chrome-preferences.json"),
		JSON.stringify(CHROME_PREFERENCES),
	);
	writeFileSync(
		join(context, "docker-daemon.json"),
		JSON.stringify(DOCKER_DAEMON_JSON),
	);
	const configDir = join(context, "desktop-config");
	mkdirSync(join(configDir, "plank", "dock1", "launchers"), {
		recursive: true,
	});
	mkdirSync(join(configDir, "xfce4", "xfconf", "xfce-perchannel-xml"), {
		recursive: true,
	});
	mkdirSync(join(configDir, "autostart"), { recursive: true });
	mkdirSync(join(configDir, "gtk-3.0"), { recursive: true });
	writeFileSync(join(configDir, "gtk-3.0", "gtk.css"), GTK_CSS);
	mkdirSync(join(configDir, "xfce4", "terminal"), { recursive: true });
	writeFileSync(
		join(configDir, "xfce4", "terminal", "terminalrc"),
		TERMINAL_RC,
	);
	for (const [item, desktop] of Object.entries(PLANK_LAUNCHERS)) {
		writeFileSync(
			join(configDir, "plank", "dock1", "launchers", item),
			`[PlankDockItemPreferences]\nLauncher=file:///usr/share/applications/${desktop}\n`,
		);
	}
	const xml = join(configDir, "xfce4", "xfconf", "xfce-perchannel-xml");
	writeFileSync(join(xml, "xfce4-panel.xml"), PANEL_XML);
	writeFileSync(join(xml, "xfwm4.xml"), XFWM_XML);
	writeFileSync(join(xml, "xsettings.xml"), XSETTINGS_XML);
	writeFileSync(join(configDir, "autostart", "plank.desktop"), PLANK_AUTOSTART);
	writeFileSync(join(context, "claude.json"), JSON.stringify(CLAUDE_CONFIG));
	writeFileSync(join(context, "seed-template-db.cjs"), SEED_TEMPLATE_DB);
	writeFileSync(
		join(context, "checkpoint-template-db.cjs"),
		CHECKPOINT_TEMPLATE_DB,
	);
	writeFileSync(join(context, "Dockerfile"), dockerfile);
	return context;
}

if (import.meta.main) {
	if (process.argv.includes("--dry")) {
		console.log(dockerfile);
	} else {
		assertBuilt();
		const project = process.env.VERCEL_SANDBOX_PROJECT_ID;
		const team = process.env.VERCEL_SANDBOX_TEAM_ID;
		if (!project || !team) {
			throw new Error(
				"VERCEL_SANDBOX_PROJECT_ID and VERCEL_SANDBOX_TEAM_ID are required",
			);
		}
		const context = assembleContext();
		try {
			console.log(`building ${IMAGE_REF} with ${natives.join(", ")}`);
			const build = Bun.spawnSync(
				[
					"vercel",
					"vcr",
					"build",
					"docker",
					context,
					IMAGE_REF,
					"--push",
					"--project",
					project,
					"--scope",
					team,
				],
				{ stdout: "inherit", stderr: "inherit" },
			);
			if (build.exitCode !== 0) {
				throw new Error(`vercel vcr build exited ${build.exitCode}`);
			}
			console.log(`built: ${IMAGE_REF}`);
		} finally {
			rmSync(context, { recursive: true, force: true });
		}
	}
}
