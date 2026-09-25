import { EventEmitter } from "node:events";
import net from "node:net";
import type { DetectedPort } from "@superset/port-scanner";
import type {
	ForwardTarget,
	LocalPortOwner,
	PortForward,
	PortForwardStatus,
} from "shared/types";
import { portForwardId } from "shared/types";
import type { ForwardTransport } from "./types";

interface ForwardEntry {
	forward: PortForward;
	server: net.Server | null;
	sockets: Set<net.Socket>;
}

export interface PortForwardManagerOptions {
	transport: ForwardTransport;
	/** Local ports the desktop's own port scanner attributes to a workspace. */
	getLocalPorts: () => DetectedPort[];
	killLocalPort: (owner: LocalPortOwner & { port: number }) => Promise<{
		success: boolean;
		error?: string;
	}>;
	canBindPort: (port: number) => Promise<boolean>;
}

const MAX_PENDING_FRAMES = 64;
const MAX_PENDING_BYTES = 4 * 1024 * 1024;
const KILL_WAIT_MS = 3_000;
const KILL_POLL_MS = 250;

/**
 * Owns every local listener that forwards to a remote workspace port. Each
 * window is a client with its own wanted set (its selected workspace's remote
 * ports); the manager keeps exactly the union running, so two windows on
 * different workspaces don't tear each other's forwards down. A client's set
 * is dropped when its window's subscription goes away.
 */
export class PortForwardManager extends EventEmitter<{
	change: [PortForward[]];
}> {
	private readonly entries = new Map<string, ForwardEntry>();
	private readonly wantedByClient = new Map<
		string,
		Map<string, ForwardTarget>
	>();

	constructor(private readonly options: PortForwardManagerOptions) {
		super();
	}

	list(): PortForward[] {
		return Array.from(this.entries.values(), (e) => ({ ...e.forward }));
	}

	async sync({
		clientId,
		hostUrl,
		workspaceId,
		ports,
	}: {
		clientId: string;
		hostUrl: string;
		workspaceId: string;
		ports: number[];
	}): Promise<PortForward[]> {
		const wanted = new Map<string, ForwardTarget>();
		for (const remotePort of new Set(ports)) {
			const target = { hostUrl, workspaceId, remotePort };
			wanted.set(portForwardId(target), target);
		}
		if (wanted.size > 0) {
			this.wantedByClient.set(clientId, wanted);
		} else {
			this.wantedByClient.delete(clientId);
		}
		return this.reconcile();
	}

	/** A window went away; whatever only it wanted stops. */
	async releaseClient(clientId: string): Promise<void> {
		if (!this.wantedByClient.delete(clientId)) return;
		await this.reconcile();
	}

	private async reconcile(): Promise<PortForward[]> {
		const union = new Map<string, ForwardTarget>();
		for (const wanted of this.wantedByClient.values()) {
			for (const [id, target] of wanted) union.set(id, target);
		}
		for (const id of Array.from(this.entries.keys())) {
			if (!union.has(id)) this.stop(id);
		}
		await Promise.all(
			Array.from(union.entries())
				.filter(([id]) => !this.entries.has(id))
				.map(([, target]) => this.start(target)),
		);
		return this.list();
	}

	async retryEphemeral(id: string): Promise<PortForward | null> {
		const entry = this.entries.get(id);
		if (!entry) return null;
		if (entry.forward.status.state !== "busy") return { ...entry.forward };
		await this.listen({ entry, localPort: 0 });
		if (this.entries.get(id) !== entry) {
			this.closeServer(entry);
			return null;
		}
		return { ...entry.forward };
	}

	async killLocalOwner(
		id: string,
	): Promise<{ success: boolean; error?: string }> {
		const entry = this.entries.get(id);
		if (!entry) return { success: false, error: "Forward not found" };
		const { status } = entry.forward;
		if (status.state !== "busy" || !status.localOwner) {
			return { success: false, error: "Local process is not known" };
		}
		const port = entry.forward.target.remotePort;
		const result = await this.options.killLocalPort({
			...status.localOwner,
			port,
		});
		if (!result.success) return result;
		const deadline = Date.now() + KILL_WAIT_MS;
		while (Date.now() < deadline) {
			if (this.entries.get(id) !== entry) {
				return { success: false, error: "Forward was stopped" };
			}
			if (await this.options.canBindPort(port)) {
				await this.listen({ entry, localPort: port });
				if (this.entries.get(id) !== entry) this.closeServer(entry);
				return { success: true };
			}
			await new Promise((r) => setTimeout(r, KILL_POLL_MS));
		}
		return { success: false, error: "Local port is still busy" };
	}

	stopAll(): void {
		for (const id of Array.from(this.entries.keys())) this.stop(id);
	}

	private async start(target: ForwardTarget): Promise<void> {
		const id = portForwardId(target);
		const entry: ForwardEntry = {
			forward: {
				id,
				target,
				status: { state: "error", message: "Starting" },
				transport: this.options.transport.kind,
				connections: 0,
			},
			server: null,
			sockets: new Set(),
		};
		this.entries.set(id, entry);
		try {
			await this.options.transport.probe(target);
		} catch (err) {
			this.setStatus({
				entry,
				status: { state: "error", message: messageOf(err) },
			});
			return;
		}
		// A sync during the probe may have stopped this forward; binding now
		// would orphan a listener nothing owns.
		if (this.entries.get(id) !== entry) return;
		await this.listen({ entry, localPort: target.remotePort });
	}

	private listen({
		entry,
		localPort,
	}: {
		entry: ForwardEntry;
		localPort: number;
	}): Promise<void> {
		this.closeServer(entry);
		return new Promise((resolve) => {
			const server = net.createServer((socket) =>
				this.accept({ entry, socket }),
			);
			entry.server = server;
			server.once("error", (err: NodeJS.ErrnoException) => {
				entry.server = null;
				if (err.code === "EADDRINUSE") {
					this.setStatus({
						entry,
						status: {
							state: "busy",
							localPort,
							localOwner: this.findLocalOwner(localPort),
						},
					});
				} else {
					this.setStatus({
						entry,
						status: { state: "error", message: messageOf(err) },
					});
				}
				resolve();
			});
			server.listen(localPort, "127.0.0.1", () => {
				const address = server.address();
				const bound =
					address && typeof address === "object" ? address.port : localPort;
				this.setStatus({
					entry,
					status: { state: "active", localPort: bound },
				});
				resolve();
			});
		});
	}

	private accept({
		entry,
		socket,
	}: {
		entry: ForwardEntry;
		socket: net.Socket;
	}): void {
		entry.sockets.add(socket);
		entry.forward.connections = entry.sockets.size;
		this.emitChange();
		socket.on("close", () => {
			entry.sockets.delete(socket);
			entry.forward.connections = entry.sockets.size;
			this.emitChange();
		});
		socket.on("error", () => socket.destroy());

		// Bytes the client sends while the relay stream is still opening. A
		// consumer must be attached from the first tick: an unread socket drops
		// data under Bun, and a browser sends its request right after connect.
		const pending: Buffer[] = [];
		let pendingBytes = 0;
		const buffer = (chunk: Buffer) => {
			pending.push(chunk);
			pendingBytes += chunk.byteLength;
			if (
				pending.length > MAX_PENDING_FRAMES ||
				pendingBytes > MAX_PENDING_BYTES
			) {
				socket.destroy();
			}
		};
		socket.on("data", buffer);

		this.options.transport
			.openStream(entry.forward.target)
			.then((stream) => {
				socket.off("data", buffer);
				if (socket.destroyed) {
					stream.destroy();
					return;
				}
				// A transient stream failure flips the forward to error; the
				// listener is still bound, so the next success restores it.
				if (
					entry.forward.status.state === "error" &&
					this.entries.get(entry.forward.id) === entry &&
					entry.server
				) {
					const address = entry.server.address();
					const bound =
						address && typeof address === "object"
							? address.port
							: entry.forward.target.remotePort;
					this.setStatus({
						entry,
						status: { state: "active", localPort: bound },
					});
				}
				stream.on("error", () => socket.destroy());
				stream.on("close", () => socket.destroy());
				socket.on("close", () => stream.destroy());
				for (const chunk of pending) stream.write(chunk);
				pending.length = 0;
				socket.pipe(stream);
				stream.pipe(socket);
			})
			.catch((err) => {
				socket.destroy();
				if (this.entries.get(entry.forward.id) === entry) {
					this.setStatus({
						entry,
						status: { state: "error", message: messageOf(err) },
					});
				}
			});
	}

	private findLocalOwner(port: number): LocalPortOwner | null {
		const match = this.options.getLocalPorts().find((p) => p.port === port);
		if (!match) return null;
		return {
			pid: match.pid,
			processName: match.processName,
			terminalId: match.terminalId,
			workspaceId: match.workspaceId,
		};
	}

	private stop(id: string): void {
		const entry = this.entries.get(id);
		if (!entry) return;
		this.entries.delete(id);
		this.closeServer(entry);
		this.emitChange();
	}

	private closeServer(entry: ForwardEntry): void {
		for (const socket of entry.sockets) socket.destroy();
		entry.sockets.clear();
		entry.forward.connections = 0;
		entry.server?.close();
		entry.server = null;
	}

	private setStatus({
		entry,
		status,
	}: {
		entry: ForwardEntry;
		status: PortForwardStatus;
	}): void {
		entry.forward.status = status;
		this.emitChange();
	}

	private emitChange(): void {
		this.emit("change", this.list());
	}
}

function messageOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
