/**
 * The contract between the control plane, host-service and the box.
 *
 * Three readers share one vocabulary: the API writes `sandbox.conf` at claim
 * and wake and pushes the managed env; host-service reads its env and the
 * push; `superset-boot` is shell, runs before any Node process, and sources
 * `contract.sh`, which `build.ts` renders from the constants here. A change
 * to a path, port or key is one edit in this file and the bundle hash moves.
 */
import { z } from "zod";

/** Bumped when a box booted on the previous contract can no longer be driven. */
export const SANDBOX_CONTRACT_VERSION = 1;

export const SANDBOX_USER = "ubuntu";

/** Absolute paths on the box. `rootfs/` in the bundle mirrors these. */
export const SANDBOX_PATHS = {
	workspace: "/workspace",
	home: "/home/ubuntu",
	/** `<bundleRoot>/<sha256>/` per bundle, `current` symlink, `current.bundle-hash`. */
	bundleRoot: "/opt/superset/bundle",
	/** `<hostRoot>/<sha256>/` per runtime, `current` symlink, `current.version`. */
	hostRoot: "/opt/superset/host",
	conf: "/etc/superset/sandbox.conf",
	contract: "/etc/superset/contract.sh",
	state: "/var/lib/superset",
	hostDb: "/var/lib/superset/host.db",
	/** One marker per repository path once its checkout is in place. */
	checkouts: "/var/lib/superset/checkouts",
	logs: "/var/log/superset",
	bootLog: "/var/log/superset/boot.log",
	run: "/run/superset",
	steps: "/usr/local/share/superset/steps",
	media: "/usr/local/share/superset/media",
	desktopTemplates: "/usr/local/share/superset/desktop",
	backgrounds: "/usr/share/backgrounds/superset",
} as const;

/** Every port a workspace publishes, and the loopback ones behind them. */
export const SANDBOX_PORTS = {
	hostService: 4879,
	/** websockify, bridging the desktop's VNC server to the pane. */
	desktop: 6080,
	vnc: 5900,
	chromeDebug: 9222,
} as const;

/** Ports the platform publishes for every workspace; a repo's `ports` add to these. */
export const SANDBOX_PUBLISHED_PORTS: readonly number[] = [
	SANDBOX_PORTS.hostService,
	SANDBOX_PORTS.desktop,
];

export const SANDBOX_DISPLAY = {
	number: ":1",
	width: 1920,
	height: 1200,
	depth: 24,
	dpi: 96,
	uiFont: "Inter 10",
	titleFont: "Inter Bold 10",
	monospaceFont: "JetBrainsMono Nerd Font 10",
	terminalFont: "JetBrainsMono Nerd Font 11",
	dockIconSize: 48,
	cursorSize: 24,
	panelHeight: 28,
} as const;

/** Where `sync-assets` fetches by hash: `<base>/<sha256><suffix>`. */
export const SANDBOX_ASSET_BASE_URL = "https://cdn.superset.sh/sandbox";

/**
 * What the control plane writes into `sandbox.conf` when a workspace claims
 * a box, and rewrites on every wake. Identity and non-secret configuration
 * only; readable by everyone on the box. The host secret never lands here:
 * it rides in the env of the `runCommand` that starts boot.
 */
export const sandboxIdentitySchema = z.object({
	SUPERSET_SANDBOX_CONTRACT: z.literal(String(SANDBOX_CONTRACT_VERSION)),
	/** The bundle the environment pins; absent means the image's own stays. */
	SUPERSET_BUNDLE_SHA: z
		.string()
		.regex(/^[0-9a-f]{64}$/)
		.optional(),
	SUPERSET_API_URL: z.string().url(),
	SUPERSET_SANDBOX_WORKSPACE_ID: z.string().uuid(),
	SUPERSET_SANDBOX_ORGANIZATION_ID: z.string().uuid(),
	/**
	 * The repositories this workspace checks out, as JSON
	 * (`sandboxRepositoriesSchema`): each at `<workspace>/<path>` on its
	 * branch. The first is the primary: the one the workspace opens on and
	 * whose hooks run unless the environment names another.
	 */
	SUPERSET_SANDBOX_REPOSITORIES: z.string().min(2),
	/** The environment row's source (image name or golden), for telemetry. */
	SUPERSET_SANDBOX_IMAGE_TAG: z.string().min(1),
	SUPERSET_SANDBOX_PROVIDER: z.string().min(1),
	/**
	 * The environment's overrides for the repository's `.superset/config.json`
	 * hooks the box acts on, as JSON: `{ start?: string[], ports?: number[] }`.
	 * `setup` never travels here; the release runs it. host-service runs
	 * `start` once the managed environment has arrived.
	 */
	SUPERSET_SANDBOX_HOOKS: z.string().optional(),
	HOST_SERVICE_SENTRY_DSN: z.string().optional(),
	HOST_SERVICE_SENTRY_ENVIRONMENT: z.string().optional(),
	/** A built-in agent to run once on first boot; see cloud-agent-launch. */
	SUPERSET_SANDBOX_AGENT: z.string().optional(),
	SUPERSET_SANDBOX_AGENT_PROMPT: z.string().optional(),
	SUPERSET_SANDBOX_AGENT_MODEL: z.string().optional(),
	SUPERSET_SANDBOX_AGENT_EFFORT: z.string().optional(),
	SUPERSET_SANDBOX_AGENT_MODE: z.string().optional(),
});

export type SandboxIdentity = z.infer<typeof sandboxIdentitySchema>;

/** One checkout on the box; `path` is relative to the workspace root. */
export const sandboxRepositorySchema = z.object({
	url: z.string().url(),
	branch: z.string().min(1),
	path: z.string().regex(/^[A-Za-z0-9._-]+$/),
	/** True for the repository whose `.superset/config.json` the box acts on. */
	hooks: z.boolean().optional(),
});
export const sandboxRepositoriesSchema = z
	.array(sandboxRepositorySchema)
	.min(1);
export type SandboxRepository = z.infer<typeof sandboxRepositorySchema>;

/**
 * Where a repository lands under the workspace root. Its name, unless two
 * repositories share one, in which case the owner disambiguates.
 */
export function sandboxRepositoryPath(
	repo: { owner: string; name: string },
	all: ReadonlyArray<{ owner: string; name: string }>,
): string {
	const clash = all.some(
		(other) => other.name === repo.name && other.owner !== repo.owner,
	);
	return clash ? `${repo.owner}-${repo.name}` : repo.name;
}

/**
 * The managed environment the control plane pushes into host-service after
 * boot: the environment's variables and the credential placeholders, replaced
 * as a whole on every push. New terminals and agent launches inherit it;
 * nothing writes it to disk.
 */
export const sandboxManagedEnvSchema = z.object({
	variables: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string()),
});

export type SandboxManagedEnv = z.infer<typeof sandboxManagedEnvSchema>;

/** `KEY='value'` lines a POSIX shell sources; a quote inside becomes `'\''`. */
export function renderShellAssignments(
	entries: Record<string, string | number | undefined>,
): string {
	return Object.entries(entries)
		.filter(
			(entry): entry is [string, string | number] => entry[1] !== undefined,
		)
		.map(([key, value]) => `${key}='${String(value).replaceAll("'", "'\\''")}'`)
		.join("\n")
		.concat("\n");
}

/** The `sandbox.conf` body for one workspace. */
export function renderSandboxConf(identity: SandboxIdentity): string {
	return renderShellAssignments(sandboxIdentitySchema.parse(identity));
}

/**
 * The shell-visible half of this module. Rendered into
 * `rootfs/etc/superset/contract.sh` at build so `superset-boot` and the steps
 * read the same names the API and host-service use.
 */
export function renderContractShell(): string {
	return renderShellAssignments({
		SUPERSET_CONTRACT_VERSION: SANDBOX_CONTRACT_VERSION,
		SUPERSET_USER: SANDBOX_USER,
		SUPERSET_WORKSPACE_DIR: SANDBOX_PATHS.workspace,
		SUPERSET_HOME_DIR: SANDBOX_PATHS.home,
		SUPERSET_BUNDLE_ROOT: SANDBOX_PATHS.bundleRoot,
		SUPERSET_HOST_ROOT: SANDBOX_PATHS.hostRoot,
		SUPERSET_CONF: SANDBOX_PATHS.conf,
		SUPERSET_STATE_DIR: SANDBOX_PATHS.state,
		SUPERSET_HOST_DB: SANDBOX_PATHS.hostDb,
		SUPERSET_CHECKOUTS_DIR: SANDBOX_PATHS.checkouts,
		SUPERSET_LOG_DIR: SANDBOX_PATHS.logs,
		SUPERSET_BOOT_LOG: SANDBOX_PATHS.bootLog,
		SUPERSET_RUN_DIR: SANDBOX_PATHS.run,
		SUPERSET_STEPS_DIR: SANDBOX_PATHS.steps,
		SUPERSET_MEDIA_DIR: SANDBOX_PATHS.media,
		SUPERSET_DESKTOP_TEMPLATES: SANDBOX_PATHS.desktopTemplates,
		SUPERSET_BACKGROUNDS_DIR: SANDBOX_PATHS.backgrounds,
		SUPERSET_HOST_SERVICE_PORT: SANDBOX_PORTS.hostService,
		SUPERSET_DESKTOP_PORT: SANDBOX_PORTS.desktop,
		SUPERSET_VNC_PORT: SANDBOX_PORTS.vnc,
		SUPERSET_CHROME_DEBUG_PORT: SANDBOX_PORTS.chromeDebug,
		SUPERSET_DISPLAY: SANDBOX_DISPLAY.number,
		SUPERSET_DISPLAY_WIDTH: SANDBOX_DISPLAY.width,
		SUPERSET_DISPLAY_HEIGHT: SANDBOX_DISPLAY.height,
		SUPERSET_DISPLAY_DEPTH: SANDBOX_DISPLAY.depth,
		SUPERSET_DISPLAY_DPI: SANDBOX_DISPLAY.dpi,
		SUPERSET_ASSET_BASE_URL: SANDBOX_ASSET_BASE_URL,
	});
}
