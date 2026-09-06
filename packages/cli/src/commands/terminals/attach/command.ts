import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";
import {
	type AttachSocket,
	type AttachTty,
	buildAttachHandshake,
	type DetachReason,
	TerminalAttachBridge,
} from "../../../lib/terminal-attach";

function describeDetach(reason: DetachReason): string {
	switch (reason.kind) {
		case "user":
			return "Detached.";
		case "server-exit":
			return reason.exitCode === 0 && reason.signal === 0
				? "Session ended (shell exited)."
				: `Session ended (exit code ${reason.exitCode}, signal ${reason.signal}).`;
		case "server-error":
			return `Session error: ${reason.message}`;
		case "socket-closed":
			return `Connection closed (${reason.code}${reason.reason ? `: ${reason.reason}` : ""}).`;
	}
}

export default command({
	description:
		"Attach your local terminal directly to a live terminal session — tmux/herdr-style. Works across hosts via --host, same as every other terminals command",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		terminal: string().required().desc("Terminal ID to attach to"),
	},
	run: async ({ ctx, options }) => {
		const stdin = process.stdin;
		const stdout = process.stdout;
		if (!stdin.isTTY || !stdout.isTTY) {
			throw new CLIError(
				"terminals attach needs an interactive terminal",
				"Run it directly in a real shell, not piped or redirected. For non-interactive reads, use: superset terminals read",
			);
		}

		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = options.host ?? getHostId();
		const { workspace } = await findWorkspaceOnHost(
			{ organizationId, userJwt: ctx.bearer, api: ctx.api, hostId },
			options.workspace,
		);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${options.workspace}`,
				"Pass --host <id> if it lives on another machine",
			);
		}

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const url = new URL(
			`${target.ws.baseWsUrl}/terminal/${encodeURIComponent(options.terminal)}`,
		);
		url.searchParams.set("workspaceId", options.workspace);
		url.searchParams.set("token", target.ws.token);

		const reason = await new Promise<DetachReason>((resolve, reject) => {
			const ws = new WebSocket(url.toString());
			ws.binaryType = "arraybuffer";

			let restored = false;
			const restoreTty = () => {
				if (restored) return;
				restored = true;
				stdin.setRawMode(false);
				stdin.pause();
				stdin.removeListener("data", onData);
				stdout.removeListener("resize", onResize);
			};

			const socket: AttachSocket = {
				send: (data) => ws.send(data),
				close: () => ws.close(),
			};
			const tty: AttachTty = {
				writeOutput: (bytes) => {
					stdout.write(Buffer.from(bytes));
				},
			};
			const bridge = new TerminalAttachBridge(socket, tty, {
				onDetach: (r) => {
					restoreTty();
					resolve(r);
				},
			});

			const onData = (chunk: string) => bridge.handleTtyInput(chunk);
			const onResize = () =>
				bridge.handleTtyResize(stdout.columns, stdout.rows);

			ws.onopen = () => {
				for (const frame of buildAttachHandshake(stdout.columns, stdout.rows)) {
					ws.send(frame);
				}
				process.stderr.write(
					`Attached to terminal ${options.terminal}. Press Ctrl+] to detach.\n`,
				);
				stdin.setEncoding("utf8");
				stdin.setRawMode(true);
				stdin.resume();
				stdin.on("data", onData);
				stdout.on("resize", onResize);
			};
			ws.onmessage = (event) => bridge.handleSocketMessage(event.data);
			ws.onclose = (event) =>
				bridge.handleSocketClose(event.code, event.reason);
			ws.onerror = () => {
				restoreTty();
				reject(
					new CLIError(`Failed to connect to terminal ${options.terminal}`),
				);
			};
		});

		return {
			data: { terminalId: options.terminal, reason },
			message: describeDetach(reason),
		};
	},
});
