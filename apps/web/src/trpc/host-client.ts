import SuperJSON from "superjson";
import { getAuthToken } from "./auth-token";
import { getRelayUrl } from "./relay-url";

// Direct browser → relay → host-service tRPC calls, the same path the
// desktop uses. Inputs/outputs are typed at the boundary rather than via
// the host AppRouter: importing `@superset/host-service` drags host-only
// modules into the web's type-check, which is the reason the cloud's
// `relay-client.ts` also hand-types its host calls.

export interface HostTerminalSession {
	terminalId: string;
	workspaceId: string;
	exited: boolean;
	title: string | null;
}

export interface HostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	env: Record<string, string>;
	order: number;
}

interface CreateHostTerminalOptions {
	initialCommand?: string;
}

async function hostCall<TOutput>(
	routingKey: string,
	procedure: string,
	input: unknown,
	method: "GET" | "POST",
): Promise<TOutput> {
	const token = await getAuthToken();
	const base = `${getRelayUrl()}/hosts/${routingKey}/trpc/${procedure}`;
	const encoded = input === undefined ? undefined : SuperJSON.serialize(input);
	const url =
		method === "GET" && encoded !== undefined
			? `${base}?input=${encodeURIComponent(JSON.stringify(encoded))}`
			: base;

	const response = await fetch(url, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			...(method === "POST" ? { "content-type": "application/json" } : {}),
		},
		body:
			method === "POST" && encoded !== undefined
				? JSON.stringify(encoded)
				: undefined,
	});
	if (!response.ok) {
		throw new Error(`host ${procedure} failed (${response.status})`);
	}

	const parsed = (await response.json()) as { result?: { data?: unknown } };
	if (!parsed.result || parsed.result.data === undefined) {
		throw new Error(`host ${procedure}: malformed relay response`);
	}
	return SuperJSON.deserialize(parsed.result.data as never) as TOutput;
}

export function listHostTerminals(routingKey: string, workspaceId: string) {
	return hostCall<{ sessions: HostTerminalSession[] }>(
		routingKey,
		"terminal.listSessions",
		{ workspaceId },
		"GET",
	);
}

export function createHostTerminal(
	routingKey: string,
	workspaceId: string,
	options: CreateHostTerminalOptions = {},
) {
	const input =
		options.initialCommand === undefined
			? { workspaceId }
			: { workspaceId, initialCommand: options.initialCommand };
	return hostCall<{ terminalId: string; status: string }>(
		routingKey,
		"terminal.createSession",
		input,
		"POST",
	);
}

export function listHostAgentConfigs(routingKey: string) {
	return hostCall<HostAgentConfig[]>(
		routingKey,
		"settings.agentConfigs.list",
		undefined,
		"GET",
	);
}

function quoteSingleShell(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildArgvCommand(argv: string[]): string {
	return argv.map(quoteSingleShell).join(" ");
}

function envOverlayPrefix(env: Record<string, string>): string {
	const assignments = Object.entries(env).map(
		([key, value]) => `${key}=${quoteSingleShell(value)}`,
	);
	return assignments.length > 0 ? `${assignments.join(" ")} ` : "";
}

export function buildHostAgentLaunchCommand(config: {
	command: string;
	args: string[];
	env: Record<string, string>;
}) {
	return `${envOverlayPrefix(config.env)}${buildArgvCommand([
		config.command,
		...config.args,
	])}`;
}
