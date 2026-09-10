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
	"xvfb",
	"xauth",
	"x11vnc",
	"openbox",
	"iproute2",
];

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
RUN apt-get update && apt-get install -y --no-install-recommends ${APT_PACKAGES.join(" ")} && rm -rf /var/lib/apt/lists/*
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
