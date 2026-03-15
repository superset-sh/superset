import type { Socket } from "node:net";

export type SupervisorClientRole = "control" | "stream";

interface ClientSockets {
	control?: Socket;
	stream?: Socket;
}

export class SupervisorClientRegistry {
	private readonly clientsById = new Map<string, ClientSockets>();

	registerSocket({
		clientId,
		role,
		socket,
	}: {
		clientId: string;
		role: SupervisorClientRole;
		socket: Socket;
	}): Socket | undefined {
		const existing = this.clientsById.get(clientId) ?? {};
		const previousSocket =
			role === "control" ? existing.control : existing.stream;
		const next =
			role === "control"
				? { ...existing, control: socket }
				: { ...existing, stream: socket };

		this.clientsById.set(clientId, next);
		return previousSocket;
	}

	getStreamSocket(clientId: string): Socket | undefined {
		return this.clientsById.get(clientId)?.stream;
	}

	hasClient(clientId: string): boolean {
		return this.clientsById.has(clientId);
	}

	removeSocket({
		clientId,
		role,
		socket,
	}: {
		clientId: string;
		role: SupervisorClientRole;
		socket: Socket;
	}): void {
		const existing = this.clientsById.get(clientId);
		if (!existing) return;

		const matches =
			role === "control"
				? existing.control === socket
				: existing.stream === socket;
		if (!matches) return;

		const next: ClientSockets = { ...existing };
		if (role === "control") {
			delete next.control;
		} else {
			delete next.stream;
		}

		if (!next.control && !next.stream) {
			this.clientsById.delete(clientId);
			return;
		}

		this.clientsById.set(clientId, next);
	}

	destroyAll(): void {
		for (const { control, stream } of this.clientsById.values()) {
			try {
				control?.destroy();
			} catch {
				// Best-effort cleanup.
			}

			try {
				stream?.destroy();
			} catch {
				// Best-effort cleanup.
			}
		}

		this.clientsById.clear();
	}
}
