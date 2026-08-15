/**
 * Builds the Blaxel sandbox image that hosts host-service.
 *
 *   BL_API_KEY=... BL_WORKSPACE=superset bun run scripts/sandbox/image.ts
 *   bun run scripts/sandbox/image.ts --dry   # print the Dockerfile only
 *
 * Two constraints discovered by probing a live sandbox, both load-bearing:
 *
 *  - **Debian, not Alpine.** node-pty's prebuilt binary links glibc
 *    (GLIBC_2.28 / GLIBCXX_3.4.22), so on Alpine's musl it falls back to
 *    compiling, which drags in build-essential + python3 (~315 MiB).
 *  - **The pinned node-pty version.** The stable release ships no prebuilds
 *    at all and compiles on any libc; only the beta this repo pins carries
 *    `prebuilds/linux-x64`. Installing plain `node-pty` reintroduces the
 *    toolchain requirement even on Debian.
 *
 * Versions are read from host-service's package.json rather than hardcoded:
 * a sandbox running a different better-sqlite3 than host-service was built
 * against is a native-ABI mismatch that surfaces as a runtime crash.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageInstance } from "@blaxel/core";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const HOST_SERVICE_PKG = join(
	REPO_ROOT,
	"packages",
	"host-service",
	"package.json",
);

/** Blaxel reserves 80, 443 and 8080; host-service's default is 4879. */
const HOST_SERVICE_PORT = 4879;
const IMAGE_NAME = process.env.SANDBOX_IMAGE_NAME ?? "superset-hostsvc";

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

const natives = [
	`better-sqlite3@${pinnedVersion("better-sqlite3")}`,
	`node-pty@${pinnedVersion("node-pty")}`,
];

/**
 * Packages the bundle marks external and then imports at module load, so they
 * must merely *resolve* even where the code path never runs. Established by
 * booting the bundle in a sandbox and installing whatever it asked for until
 * it reached env validation.
 *
 * Most of this is mastra's storage/embedding stack reached through
 * provider-auth's credential store — onnxruntime and duckdb are not small,
 * and trimming that dependency would shrink this list to nearly nothing.
 */
const runtimeResolutionOnly = [
	"@mastra/duckdb",
	"@anush008/tokenizers",
	"onnxruntime-node",
	"libsql",
	"@parcel/watcher",
	"@xterm/headless",
];

const HOST_SERVICE_DIR = join(REPO_ROOT, "packages", "host-service");
const BUNDLE = join(HOST_SERVICE_DIR, "dist", "host-service.js");

/**
 * The bundle marks native addons external, so they resolve from
 * /app/node_modules at runtime — which is why the bundle lands in /app
 * alongside the npm install above rather than in its own directory.
 */
function assertBuilt(): void {
	if (!existsSync(BUNDLE)) {
		throw new Error(
			"packages/host-service/dist/host-service.js is missing — run `bun run --cwd packages/host-service build:host` first",
		);
	}
}

export const sandboxImage = ImageInstance.fromRegistry("node:24-bookworm-slim")
	// git for the workspace checkout, openssh-client for SSH remotes, ca-certificates
	// for HTTPS clones. Deliberately no build-essential/python3 — see the header.
	.aptInstall("git", "ca-certificates", "openssh-client")
	.workdir("/app")
	.runCommands("npm init -y")
	// The bundle is ESM; without this Node parses /app/*.js as CommonJS and
	// dies on the first `import`.
	.runCommands("npm pkg set type=module")
	.runCommands(`npm install ${natives.join(" ")} --no-audit --no-fund`)
	.runCommands(
		`npm install ${runtimeResolutionOnly.join(" ")} --no-audit --no-fund`,
	)
	// Fail the build rather than ship an image whose natives only load because
	// something silently compiled them.
	.runCommands(
		"test -d node_modules/node-pty/prebuilds/linux-x64 || (echo 'node-pty prebuild missing — it would compile at runtime' && exit 1)",
	)
	// host-service itself: the bundle, its worker sibling (the pool resolves it
	// by path next to host-service.js), and the host.db migrations createDb
	// applies on first boot.
	// The third argument is the build-context name, which defaults to the
	// source's basename — both `dist` directories would otherwise collide and
	// silently ship host-service's bundle as the pty daemon.
	.addLocalDir("packages/host-service/dist", "/app", "hostsvc-dist")
	.addLocalDir(
		"packages/host-service/drizzle",
		"/app/drizzle",
		"hostsvc-drizzle",
	)
	// The supervisor resolves the daemon as ../../../pty-daemon/dist relative
	// to its own source path, which from /app/host-service.js lands at /.
	.addLocalDir("packages/pty-daemon/dist", "/pty-daemon/dist", "ptyd-dist")
	// The daemon is spawned as its own process and imports node-pty, but Node
	// resolves node_modules upward from /pty-daemon/dist and the install lives
	// in /app. Link rather than install twice: one copy of the native addon,
	// so the daemon and host-service can never diverge on its version.
	.runCommands("ln -s /app/node_modules /pty-daemon/node_modules")
	.env({ NODE_ENV: "production", PORT: String(HOST_SERVICE_PORT) })
	.expose(HOST_SERVICE_PORT);

if (import.meta.main) {
	if (process.argv.includes("--dry")) {
		console.log(sandboxImage.dockerfile);
	} else {
		assertBuilt();
		console.log(`building ${IMAGE_NAME} with ${natives.join(", ")}`);
		const built = await sandboxImage.build({
			name: IMAGE_NAME,
			memory: 4096,
			onStatusChange: (status: string) => console.log(`  ${status}`),
		} as never);
		console.log(`built: ${built.metadata?.name ?? IMAGE_NAME}`);
	}
}
