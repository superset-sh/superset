/**
 * Builds the Blaxel sandbox image that hosts host-service.
 *
 *   BL_API_KEY=... BL_WORKSPACE=superset bun run scripts/sandbox/image.ts
 *   bun run scripts/sandbox/image.ts --dry   # print the Dockerfile only
 *
 * Two constraints keep a compiler out of this image, and both must hold:
 * node-pty's prebuilt binary links glibc, so Alpine's musl would force a
 * source build; and only the node-pty version this repo pins ships prebuilds
 * at all, so installing plain `node-pty` compiles even on Debian. A compile
 * needs build-essential + python3, roughly 315 MiB.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageInstance } from "@blaxel/core";
import {
	SANDBOX_CREDENTIAL_PLACEHOLDER,
	SANDBOX_WORKSPACE_PATH,
} from "../../packages/shared/src/constants.ts";

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

const natives = [
	`better-sqlite3@${pinnedVersion("better-sqlite3")}`,
	`node-pty@${pinnedVersion("node-pty")}`,
];

/**
 * Imported at module load but never executed, so they only need to resolve.
 * Mostly mastra's storage stack reached via provider-auth's credential store;
 * trimming that dependency would shrink both this list and the image.
 */
const runtimeResolutionOnly = [
	"@mastra/duckdb",
	"@anush008/tokenizers",
	"onnxruntime-node",
	"libsql",
	"@parcel/watcher",
	"@xterm/headless",
];

const BUNDLE = join(
	REPO_ROOT,
	"packages",
	"host-service",
	"dist",
	"host-service.js",
);

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
	// The agents the sandbox can actually run. Without a CLI installed the
	// agent picker has nothing to offer, since a sandbox has none of the
	// user's locally-installed agents. Both read their key from the
	// environment, which is how the sandbox is handed credentials.
	.runCommands(
		"npm install -g @anthropic-ai/claude-code @openai/codex --no-audit --no-fund && claude --version && codex --version",
	)
	// Every first run of the Claude TUI otherwise opens with a theme picker, an
	// "approve this API key?" prompt and a workspace trust dialog — three
	// confirmations before a sandbox agent can do anything, on a machine whose
	// answers are the same every time. These are the keys the TUI writes when
	// you answer them; `-p` runs never write them, which is why the prompts
	// survive a headless smoke test. `customApiKeyResponses` matches on the
	// key's last 20 characters, so it stays valid as long as the placeholder does.
	.runCommands(
		`printf '%s' '${JSON.stringify({
			hasCompletedOnboarding: true,
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
		})}' > /root/.claude.json`,
	)
	// Lands in /app so the externalised natives resolve from its node_modules.
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
	// The daemon is a separate process importing node-pty, and Node resolves
	// upward from /pty-daemon. Linked rather than installed twice so the two
	// can never diverge on the native addon's version.
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
