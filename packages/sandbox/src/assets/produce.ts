/**
 * Produces the bytes behind assets.json rows and rewrites the rows.
 *
 *   bun run assets chrome            mirror the current stable Chrome deb
 *   bun run assets fonts             the Nerd Font ttfs, one row each
 *   bun run assets themes            prebuilt GTK, icon and cursor theme tarballs
 *   bun run assets wallpapers        eight photos, cropped to the display
 *   bun run assets host-service      the runtime tarball from this checkout
 *   bun run assets all
 *
 * Each producer writes its files to .cache/assets/<sha256><suffix>, then
 * rewrites its rows in bundle/assets.json with the new hashes. Nothing is
 * uploaded here; `bun run build --publish` uploads whatever the bucket lacks.
 * Anything that must run on Linux (theme builds, image crops, the runtime's
 * native modules) runs in a throwaway container.
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SANDBOX_PATHS } from "@superset/shared/sandbox-contract";
import { ASSET_CACHE, BUNDLE_SRC, PACKAGE_ROOT } from "../build";
import {
	type Asset,
	type Assets,
	assetObjectKey,
	loadAssets,
	sha256,
} from "../manifest";

const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const ASSETS_JSON = join(BUNDLE_SRC, "assets.json");
const NODE_IMAGE = "node:24-bookworm-slim";

function cache(
	bytes: Uint8Array,
	suffix: string,
): { sha256: string; key: string } {
	const hash = sha256(bytes);
	mkdirSync(ASSET_CACHE, { recursive: true });
	const key = `${hash}${suffix}`;
	writeFileSync(join(ASSET_CACHE, key), bytes);
	return { sha256: hash, key };
}

function rewriteRows(rows: Record<string, Asset>): void {
	const current: Assets = existsSync(ASSETS_JSON)
		? loadAssets(ASSETS_JSON)
		: {};
	const next: Assets = { ...current, ...rows };
	const sorted = Object.fromEntries(
		Object.entries(next).sort(([a], [b]) => a.localeCompare(b)),
	);
	writeFileSync(ASSETS_JSON, `${JSON.stringify(sorted, null, "\t")}\n`);
	for (const [name, row] of Object.entries(rows))
		console.log(`${name}: ${assetObjectKey(row)} -> ${row.dest}`);
}

async function fetchBytes(url: string): Promise<Uint8Array> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
}

/** Runs a script in a linux/amd64 container with `out` mounted at /out; returns nothing, files land in `out`. */
function inContainer(
	image: string,
	script: string,
	out: string,
	extraArgs: string[] = [],
): void {
	mkdirSync(out, { recursive: true });
	const run = Bun.spawnSync(
		[
			"docker",
			"run",
			"--rm",
			"--platform",
			"linux/amd64",
			"-v",
			`${out}:/out`,
			...extraArgs,
			image,
			"bash",
			"-euo",
			"pipefail",
			"-c",
			script,
		],
		{ stdout: "inherit", stderr: "inherit" },
	);
	if (run.exitCode !== 0)
		throw new Error(`container step failed (${run.exitCode})`);
}

// --- Chrome ---------------------------------------------------------------
async function chrome(): Promise<void> {
	const url =
		"https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb";
	const bytes = await fetchBytes(url);
	const out = join(PACKAGE_ROOT, ".cache", "work", "chrome");
	rmSync(out, { recursive: true, force: true });
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, "chrome.deb"), bytes);
	// The version lives in the deb's control archive; dpkg reads it where it exists.
	inContainer(
		"debian:bookworm-slim",
		"dpkg-deb -f /out/chrome.deb Version | sed 's/-.*//' > /out/version",
		out,
	);
	const version = readFileSync(join(out, "version"), "utf8").trim();
	if (!/^[0-9.]+$/.test(version))
		throw new Error(`could not read Chrome's version from the deb: ${version}`);
	const { sha256: hash } = cache(bytes, ".deb");
	rewriteRows({
		chrome: {
			sha256: hash,
			suffix: ".deb",
			dest: `${SANDBOX_PATHS.media}/google-chrome-${version}.deb`,
			mode: "0644",
			source: url,
			version,
		},
	});
}

// --- Fonts ----------------------------------------------------------------
async function fonts(): Promise<void> {
	const version = "3.5.1";
	const url = `https://github.com/ryanoasis/nerd-fonts/releases/download/v${version}/JetBrainsMono.tar.xz`;
	const out = join(PACKAGE_ROOT, ".cache", "work", "fonts");
	rmSync(out, { recursive: true, force: true });
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, "fonts.tar.xz"), await fetchBytes(url));
	const extract = Bun.spawnSync(
		["tar", "-xJf", join(out, "fonts.tar.xz"), "-C", out],
		{ stdout: "inherit", stderr: "inherit" },
	);
	if (extract.exitCode !== 0) throw new Error("font extract failed");
	const rows: Record<string, Asset> = {};
	// The Nerd Font family, not the Mono/Propo variants of it.
	for (const file of readdirSync(out)
		.filter((f) => /^JetBrainsMonoNerdFont-[A-Za-z]+\.ttf$/.test(f))
		.sort()) {
		const { sha256: hash } = cache(readFileSync(join(out, file)), ".ttf");
		const name = `font-${file
			.replace(/^JetBrainsMonoNerdFont-/, "")
			.replace(/\.ttf$/, "")
			.toLowerCase()}`;
		rows[name] = {
			sha256: hash,
			suffix: ".ttf",
			dest: `/usr/share/fonts/truetype/jetbrains-mono-nerd/${file}`,
			mode: "0644",
			source: url,
			version,
		};
	}
	rewriteRows(rows);
}

// --- Themes ---------------------------------------------------------------
const THEME_SOURCES = [
	{
		name: "whitesur-gtk",
		repo: "https://github.com/vinceliuice/WhiteSur-gtk-theme",
		commit: "99247ecd219bdc1c7409baff062b4aafcf1102a7",
		install:
			"./install.sh -d /usr/share/themes -c Light -c Dark -t default --silent-mode",
		paths: "/usr/share/themes/WhiteSur-Light /usr/share/themes/WhiteSur-Dark",
	},
	{
		name: "whitesur-icons",
		repo: "https://github.com/vinceliuice/WhiteSur-icon-theme",
		commit: "73d8040da51a9ed74e47c7366e7e9ff437601a5c",
		install: "./install.sh -d /usr/share/icons -t default",
		paths:
			"/usr/share/icons/WhiteSur /usr/share/icons/WhiteSur-dark /usr/share/icons/WhiteSur-light",
	},
	{
		name: "whitesur-cursors",
		repo: "https://github.com/vinceliuice/WhiteSur-cursors",
		commit: "e190baf618ed95ee217d2fd45589bd309b37672b",
		install: "./install.sh",
		paths: "/usr/share/icons/WhiteSur-cursors",
	},
];

function themes(): void {
	const out = join(PACKAGE_ROOT, ".cache", "work", "themes");
	rmSync(out, { recursive: true, force: true });
	const script = THEME_SOURCES.map(
		(t) =>
			`mkdir -p /tmp/${t.name} && cd /tmp/${t.name} && git init -q && git fetch -q --depth 1 ${t.repo} ${t.commit} && git checkout -q FETCH_HEAD && USER=root HOME=/root ${t.install} >/dev/null && cd / && tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -czf /out/${t.name}.tar.gz $(for p in ${t.paths}; do [ -e "$p" ] && echo "$p"; done | sed 's|^/||') && echo built ${t.name}`,
	).join(" && ");
	inContainer(
		"debian:bookworm-slim",
		`apt-get update -qq && apt-get install -y -qq --no-install-recommends sudo git ca-certificates sassc libglib2.0-dev-bin libglib2.0-bin libgtk-3-bin libxml2-utils gnome-themes-extra librsvg2-common imagemagick >/dev/null && ${script}`,
		out,
	);
	const rows: Record<string, Asset> = {};
	for (const t of THEME_SOURCES) {
		const { sha256: hash } = cache(
			readFileSync(join(out, `${t.name}.tar.gz`)),
			".tar.gz",
		);
		rows[t.name] = {
			sha256: hash,
			suffix: ".tar.gz",
			dest: `${SANDBOX_PATHS.media}/${t.name}.tar.gz`,
			mode: "0644",
			source: `${t.repo}/commit/${t.commit}`,
			version: t.commit.slice(0, 12),
		};
	}
	rewriteRows(rows);
}

// --- Wallpapers -----------------------------------------------------------
const WALLPAPER_SOURCE =
	"https://raw.githubusercontent.com/elementary/wallpapers/b198df190adeffe8562e67d28370c91442f7dd77/backgrounds";
const WALLPAPERS = [
	"Tj Holowaychuk.jpg",
	"Martin Adams.jpg",
	"Morskie Oko.jpg",
	"Canazei Granite Ridges.jpg",
	"Photo by SpaceX.jpg",
	"Ashim DSilva.jpg",
	"Viktor Forgacs.jpg",
	"Snow-Capped Mountain.jpg",
];

async function wallpapers(): Promise<void> {
	const out = join(PACKAGE_ROOT, ".cache", "work", "wallpapers");
	rmSync(out, { recursive: true, force: true });
	mkdirSync(join(out, "src"), { recursive: true });
	for (const [index, file] of WALLPAPERS.entries()) {
		writeFileSync(
			join(out, "src", `${index}.jpg`),
			await fetchBytes(`${WALLPAPER_SOURCE}/${encodeURIComponent(file)}`),
		);
	}
	inContainer(
		"debian:bookworm-slim",
		`apt-get update -qq && apt-get install -y -qq --no-install-recommends imagemagick >/dev/null && for f in /out/src/*.jpg; do n=$(basename "$f"); convert "$f" -strip -resize 1920x1200^ -gravity center -extent 1920x1200 -quality 85 "/out/$n"; done`,
		out,
	);
	const rows: Record<string, Asset> = {};
	for (const index of WALLPAPERS.keys()) {
		const { sha256: hash } = cache(
			readFileSync(join(out, `${index}.jpg`)),
			".jpg",
		);
		rows[`wallpaper-${index}`] = {
			sha256: hash,
			suffix: ".jpg",
			dest: `${SANDBOX_PATHS.backgrounds}/${index}.jpg`,
			mode: "0644",
			source: `${WALLPAPER_SOURCE}/${encodeURIComponent(WALLPAPERS[index] as string)}`,
		};
	}
	rewriteRows(rows);
}

// --- host-service runtime -------------------------------------------------
/**
 * The runtime tarball: host-service's bundle, its migrations, the agent
 * templates, pty-daemon, the native modules installed for linux/amd64 against
 * the image's Node, and a pre-migrated host.db template so first boot copies
 * a file instead of running migrations. Built in the image's own Node so the
 * natives match.
 */
function hostService(): void {
	const pkg = JSON.parse(
		readFileSync(
			join(REPO_ROOT, "packages", "host-service", "package.json"),
			"utf8",
		),
	) as { version: string; dependencies: Record<string, string> };
	const natives = ["better-sqlite3", "node-pty"].map((dep) => {
		const version = pkg.dependencies[dep];
		if (!version) throw new Error(`${dep} is not a host-service dependency`);
		return `${dep}@${version}`;
	});
	for (const [dir, script] of [
		["packages/host-service", "build:host"],
		["packages/pty-daemon", "build:daemon"],
	] as const) {
		const build = Bun.spawnSync(["bun", "run", "--cwd", dir, script], {
			cwd: REPO_ROOT,
			stdout: "ignore",
			stderr: "inherit",
		});
		if (build.exitCode !== 0) throw new Error(`${dir} ${script} failed`);
	}
	const commit = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], {
		cwd: REPO_ROOT,
		stdout: "pipe",
	})
		.stdout.toString()
		.trim();
	const version = `${pkg.version}+${commit}`;
	const out = join(PACKAGE_ROOT, ".cache", "work", "host-service");
	rmSync(out, { recursive: true, force: true });
	const stage = join(out, "stage");
	mkdirSync(stage, { recursive: true });
	const copy = (from: string, to: string) =>
		Bun.spawnSync(["cp", "-R", join(REPO_ROOT, from), join(stage, to)]);
	copy("packages/host-service/dist", "dist");
	copy("packages/host-service/drizzle", "drizzle");
	copy("packages/agent-setup/templates", "agent-templates");
	copy("packages/pty-daemon/dist", "pty-daemon");
	writeFileSync(join(stage, "RUNTIME"), `version=${version}\nnode=24\n`);
	inContainer(
		NODE_IMAGE,
		[
			"apt-get update -qq && apt-get install -y -qq --no-install-recommends python3 make g++ >/dev/null",
			"mkdir -p /rt && cd /rt && cp -R /out/stage/dist/. /rt/ && cp -R /out/stage/drizzle /rt/drizzle && cp -R /out/stage/agent-templates /rt/agent-templates && cp /out/stage/RUNTIME /rt/RUNTIME",
			// host-service resolves the daemon side by side with itself, the way the desktop ships it.
			"cp /out/stage/pty-daemon/pty-daemon.js /rt/pty-daemon.js",
			"cd /rt && npm init -y >/dev/null && npm pkg set type=module >/dev/null",
			`npm install ${natives.join(" ")} @parcel/watcher @xterm/headless --no-audit --no-fund >/dev/null`,
			"test -d node_modules/node-pty/prebuilds/linux-x64 || (echo 'node-pty prebuild missing' && exit 1)",
			// The schema, baked: run host-service once against a throwaway path so the template carries every migration.
			"cd /rt && ORGANIZATION_ID=00000000-0000-0000-0000-000000000000 HOST_DB_PATH=/rt/host.db.template HOST_MIGRATIONS_FOLDER=/rt/drizzle AUTH_TOKEN=build SUPERSET_API_URL=https://example.invalid SUPERSET_HOST_RUN_MODE=sandbox SUPERSET_SANDBOX_WORKSPACE_ID=00000000-0000-0000-0000-000000000000 SUPERSET_SANDBOX_WORKSPACE_PATH=/workspace PORT=4879 node -e '" +
				'const {spawn}=require("node:child_process");const p=spawn("node",["host-service.js"],{stdio:["ignore","pipe","pipe"]});let out="";const done=c=>{try{p.kill("SIGTERM")}catch{}process.exit(c)};const w=ch=>{out+=ch;if(out.includes("Initialized at"))setTimeout(()=>done(0),2000)};p.stdout.on("data",w);p.stderr.on("data",w);setTimeout(()=>{console.error(out.slice(-800));done(1)},60000)\'',
			'cd /rt && node -e \'const D=require("better-sqlite3");const d=new D("/rt/host.db.template");d.pragma("journal_mode = DELETE");d.close()\' && test "$(stat -c %s /rt/host.db.template)" -gt 100000 && rm -f /rt/host.db.template-wal /rt/host.db.template-shm',
			"cd /rt && tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -czf /out/host-service.tar.gz . && echo built host-service",
		].join(" && "),
		out,
	);
	const { sha256: hash } = cache(
		readFileSync(join(out, "host-service.tar.gz")),
		".tar.gz",
	);
	rewriteRows({
		"host-service": {
			sha256: hash,
			suffix: ".tar.gz",
			dest: `${SANDBOX_PATHS.media}/host-service-${version}.tar.gz`,
			mode: "0644",
			version,
			node: 24,
		},
	});
}

// --- Go (verified at image build, not a bundle asset) ---------------------
async function go(): Promise<void> {
	const version = "1.27.1";
	const bytes = await fetchBytes(
		`https://go.dev/dl/go${version}.linux-amd64.tar.gz`,
	);
	const hash = sha256(bytes);
	console.log(`go ${version} sha256 ${hash}`);
	const file = join(PACKAGE_ROOT, "src", "image.ts");
	const src = readFileSync(file, "utf8").replace(
		/const GO_SHA256 = "[^"]*";/,
		`const GO_SHA256 = "${hash}";`,
	);
	writeFileSync(file, src);
}

// --- the CLI ---------------------------------------------------------------
/**
 * `superset` for the box. Its own asset rather than part of the host-service
 * tarball: that tarball is one hash, so a CLI patch would invalidate the
 * runtime and every box would re-download it on the next boot.
 */
function cli(): void {
	const pkg = JSON.parse(
		readFileSync(join(REPO_ROOT, "packages", "cli", "package.json"), "utf8"),
	) as { version: string };
	const build = Bun.spawnSync(
		["bun", "run", "--cwd", "packages/cli", "build:linux-x64"],
		{ cwd: REPO_ROOT, stdout: "ignore", stderr: "inherit" },
	);
	if (build.exitCode !== 0)
		throw new Error("packages/cli build:linux-x64 failed");
	const binary = readFileSync(
		join(REPO_ROOT, "packages", "cli", "dist", "superset-linux-x64"),
	);
	const { sha256: hash } = cache(binary, "");
	rewriteRows({
		cli: {
			sha256: hash,
			suffix: "",
			dest: `${SANDBOX_PATHS.media}/superset-${pkg.version}`,
			mode: "0755",
			version: pkg.version,
		},
	});
	console.log(`cli ${pkg.version} sha256 ${hash}`);
}

export const producers: Record<string, () => Promise<void> | void> = {
	chrome,
	fonts,
	themes,
	wallpapers,
	"host-service": hostService,
	go,
	cli,
};

if (import.meta.main) {
	const which = process.argv[2];
	const names = which === "all" ? Object.keys(producers) : which ? [which] : [];
	if (!names.length || names.some((n) => !producers[n])) {
		console.error(
			`usage: bun run assets <${Object.keys(producers).join("|")}|all>`,
		);
		process.exit(64);
	}
	for (const name of names) {
		console.log(`--- ${name}`);
		await producers[name]?.();
	}
}
