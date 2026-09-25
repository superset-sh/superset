import type { Sink } from "../../stream";

export type WsSinkSocket = {
	send(data: string): void;
	close(): void;
	onclose: ((...args: never[]) => unknown) | null;
};

export function createWsSink(socket: WsSinkSocket): Sink {
	let open = true;
	const previous = socket.onclose;

	function handleClose(...args: never[]): unknown {
		open = false;
		if (socket.onclose === handleClose) socket.onclose = previous;
		return previous?.(...args);
	}
	socket.onclose = handleClose;

	const close = (): void => {
		if (!open) return;
		open = false;
		if (socket.onclose === handleClose) socket.onclose = previous;
		try {
			socket.close();
		} catch {}
	};

	return {
		send(envelope) {
			if (!open) return;
			try {
				socket.send(JSON.stringify(envelope));
			} catch {
				close();
			}
		},
		close,
	};
}
