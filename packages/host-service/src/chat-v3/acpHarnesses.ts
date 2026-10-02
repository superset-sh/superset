import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { HarnessFactory } from "@superset/chat-runtime";
import { createAcpAdapter } from "@superset/chat-runtime";

/**
 * How an adapter reaches the machine, modelled on the `distribution` field of
 * the ACP registry (cdn.agentclientprotocol.com/registry/v1/latest/registry.json),
 * which is what Zed installs from.
 *
 * `bundled` is the only kind this resolver can serve: the package ships as a
 * desktop dependency and resolves locally, with no download and no network.
 * The registry's other kinds — an `npx` package fetched on demand, a
 * per-platform `binary` archive verified by sha256 — need provisioning
 * (fetch, verify, unpack, cache, and a path that survives a packaged build)
 * that does not exist yet. They are declared here so the catalogue is honest
 * about what exists, and `acpHarnessFactory` omits them until it does.
 */
type AcpDistribution =
	| { kind: "bundled"; package: string; args?: readonly string[] }
	| { kind: "npx"; package: string; args?: readonly string[] }
	| { kind: "binary"; releases: string };

type AcpAdapter = {
	/** The agent's id in the ACP registry, for tracing an entry back to it. */
	registryId: string;
	distribution: AcpDistribution;
};

/** Keyed by the harness id the chat runtime uses. */
const ACP_ADAPTERS: Record<string, AcpAdapter> = {
	"claude-acp": {
		registryId: "claude-acp",
		distribution: {
			kind: "bundled",
			package: "@agentclientprotocol/claude-agent-acp",
		},
	},
	"codex-acp": {
		registryId: "codex-acp",
		distribution: {
			kind: "bundled",
			package: "@agentclientprotocol/codex-acp",
		},
	},
	"pi-acp": {
		registryId: "pi-acp",
		distribution: { kind: "bundled", package: "pi-acp" },
	},
	// Bundling this would add ~98 MB to the desktop app — more than thirty times
	// every other adapter combined — which is the reason the registry fetches on
	// demand rather than shipping agents inside the editor.
	"gemini-acp": {
		registryId: "gemini",
		distribution: {
			kind: "npx",
			package: "@google/gemini-cli",
			args: ["--acp"],
		},
	},
	// Distributed as a per-platform archive rather than a package.
	"opencode-acp": {
		registryId: "opencode",
		distribution: {
			kind: "binary",
			releases: "https://github.com/anomalyco/opencode/releases",
		},
	},
};

function resolveAdapterEntry(packageName: string): string {
	const moduleRequire = createRequire(import.meta.url);
	const pkgJson = moduleRequire.resolve(`${packageName}/package.json`);
	return join(dirname(pkgJson), "dist/index.js");
}

function acpEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		// Packaged builds ship no `node` on PATH; Electron runs the script when
		// this is set, and plain-node hosts ignore it.
		ELECTRON_RUN_AS_NODE: "1",
	};
	// Ambient keys must never override the user's own agent login — the whole
	// point is to reuse the CLI's stored credentials, not bill an API key.
	delete env.ANTHROPIC_API_KEY;
	delete env.ANTHROPIC_AUTH_TOKEN;
	return env;
}

/**
 * A HarnessFactory that spawns an ACP adapter subprocess and bridges it into
 * the chat runtime. Returns null when the adapter cannot be served — not
 * installed, or a distribution kind that needs provisioning — so the registry
 * omits that harness rather than crashing the host.
 */
export function acpHarnessFactory(harness: string): HarnessFactory | null {
	const adapter = ACP_ADAPTERS[harness];
	if (adapter?.distribution.kind !== "bundled") return null;
	const { package: packageName, args = [] } = adapter.distribution;

	let entry: string;
	try {
		entry = resolveAdapterEntry(packageName);
	} catch {
		return null;
	}

	return (options) =>
		createAcpAdapter({
			command: process.execPath,
			args: [entry, ...args],
			cwd: options.cwd,
			env: acpEnv(),
		});
}

export function acpHarnessEntries(): [string, HarnessFactory][] {
	const entries: [string, HarnessFactory][] = [];
	for (const harness of Object.keys(ACP_ADAPTERS)) {
		const factory = acpHarnessFactory(harness);
		if (factory) entries.push([harness, factory]);
	}
	return entries;
}
