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
import { readFileSync } from "node:fs";
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

export const sandboxImage = ImageInstance.fromRegistry("node:24-bookworm-slim")
	// git for the workspace checkout, openssh-client for SSH remotes, ca-certificates
	// for HTTPS clones. Deliberately no build-essential/python3 — see the header.
	.aptInstall("git", "ca-certificates", "openssh-client")
	.workdir("/app")
	.runCommands("npm init -y")
	.runCommands(`npm install ${natives.join(" ")} --no-audit --no-fund`)
	// Fail the build rather than ship an image whose natives only load because
	// something silently compiled them.
	.runCommands(
		"test -d node_modules/node-pty/prebuilds/linux-x64 || (echo 'node-pty prebuild missing — it would compile at runtime' && exit 1)",
	)
	.env({ NODE_ENV: "production", PORT: String(HOST_SERVICE_PORT) })
	.expose(HOST_SERVICE_PORT);

if (import.meta.main) {
	if (process.argv.includes("--dry")) {
		console.log(sandboxImage.dockerfile);
	} else {
		console.log(`building ${IMAGE_NAME} with ${natives.join(", ")}`);
		const built = await sandboxImage.build({
			name: IMAGE_NAME,
			memory: 4096,
			onStatusChange: (status: string) => console.log(`  ${status}`),
		} as never);
		console.log(`built: ${built.metadata?.name ?? IMAGE_NAME}`);
	}
}
