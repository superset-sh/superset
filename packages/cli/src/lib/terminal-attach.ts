import type { HostWsEndpoint } from "./host-target";

export const DETACH_KEY = "\x1d";
export const DETACH_KEY_LABEL = "Ctrl+]";

const ENTER_SCREEN = "\x1b[?1049h\x1b[H";
// Modes the attached program may have turned on; left set, they break the
// user's own shell after detach.
const RESTORE_SCREEN =
	"\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?2004l\x1b[?1004l" +
	"\x1b[<u\x1b[>4;0m\x1b[?25h\x1b[0 q\x1b[?1049l";

type ServerMessage =
	| { type: "attached" }
	| { type: "ping" }
	| { type: "exit"; exitCode: number }
	| { type: "error"; message: string }
	| { type: string };

export type AttachEnd =
	| { reason: "detached" }
	| { reason: "exited"; exitCode: number }
	| { reason: "error"; message: string }
	| { reason: "closed" };

/** Splits a stdin chunk at the detach key: the bytes before it still go to the terminal. */
export function splitAtDetach(chunk: string): {
	input: string;
	detach: boolean;
} {
	const index = chunk.indexOf(DETACH_KEY);
	return index === -1
		? { input: chunk, detach: false }
		: { input: chunk.slice(0, index), detach: true };
}

export function terminalAttachUrl(
	ws: HostWsEndpoint,
	workspaceId: string,
	terminalId: string,
): string {
	const params = new URLSearchParams({ workspaceId, token: ws.token });
	return `${ws.baseWsUrl}/terminal/${encodeURIComponent(terminalId)}?${params}`;
}

/**
 * The interrupt typed in a stdin chunk, if any. Ctrl+C counts anywhere in the
 * chunk; Esc only on its own, since arrow keys start with it.
 */
export function interruptIn(chunk: string): string | null {
	if (chunk.includes("\x03")) return "\x03";
	return chunk === "\x1b" ? "\x1b" : null;
}

export function attachTerminal({
	url,
	onInput,
	signal,
}: {
	url: string;
	onInput?: (chunk: string) => void;
	signal?: AbortSignal;
}): Promise<AttachEnd> {
	// An abort that landed before this call never fires the listener below.
	if (signal?.aborted) return Promise.resolve({ reason: "detached" });
	const stdin = process.stdin;
	const stdout = process.stdout;
	const socket = new WebSocket(url);
	socket.binaryType = "arraybuffer";
	const decoder = new TextDecoder();

	return new Promise<AttachEnd>((resolve) => {
		let ended = false;
		let attached = false;
		const send = (message: object) => {
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify(message));
			}
		};
		const sendSize = () => {
			if (stdout.columns > 0 && stdout.rows > 0) {
				send({ type: "resize", cols: stdout.columns, rows: stdout.rows });
			}
		};

		const onAbort = () => finish({ reason: "detached" });
		const finish = (end: AttachEnd) => {
			if (ended) return;
			ended = true;
			signal?.removeEventListener("abort", onAbort);
			if (attached) {
				stdin.off("data", onData);
				process.off("SIGWINCH", sendSize);
				stdin.setRawMode(false);
				stdin.pause();
				stdout.write(RESTORE_SCREEN);
			}
			socket.close();
			resolve(end);
		};

		const onData = (data: Buffer) => {
			const { input, detach } = splitAtDetach(
				decoder.decode(data, { stream: true }),
			);
			if (input) {
				send({ type: "input", data: input });
				onInput?.(input);
			}
			if (detach) finish({ reason: "detached" });
		};

		const onAttached = () => {
			attached = true;
			stdout.write(ENTER_SCREEN);
			stdin.setRawMode(true);
			stdin.resume();
			stdin.on("data", onData);
			process.on("SIGWINCH", sendSize);
			sendSize();
			send({ type: "focus", focused: true });
		};
		socket.onmessage = (event) => {
			if (event.data instanceof ArrayBuffer) {
				stdout.write(new Uint8Array(event.data));
				return;
			}
			const message = JSON.parse(String(event.data)) as ServerMessage;
			if (message.type === "attached" && !attached) onAttached();
			else if (message.type === "ping") send({ type: "pong" });
			else if (message.type === "exit" && "exitCode" in message) {
				finish({ reason: "exited", exitCode: message.exitCode });
			} else if (message.type === "error" && "message" in message) {
				finish({ reason: "error", message: message.message });
			}
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		socket.onerror = () =>
			finish({ reason: "error", message: "Connection to the host failed" });
		socket.onclose = () => finish({ reason: "closed" });
	});
}
