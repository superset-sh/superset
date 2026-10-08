import {
	MAX_PAGE_GUESTS,
	type PagePresenceViewer,
	PRESENCE_COLOR_COUNT,
} from "@superset/shared/page-presence";
import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	type PageStorageKeySummary,
	type PageStorageOp,
	type PageStorageRecord,
	type PageStorageSocketMessage,
	pageStorageRefusal,
	pageStorageValueBytes,
} from "@superset/shared/page-storage";
import {
	guestReadable,
	readable,
	writableFor,
} from "@superset/shared/page-storage-access";
import type {
	PageStorageHubRequest,
	PageStorageHubResponse,
} from "@superset/shared/page-storage-hub";
import {
	type PageManifest,
	pageFrameOrigin,
	pageManifestKey,
	parsePageManifest,
} from "@superset/shared/usercontent";
import { type Connection, type ConnectionContext, Server } from "partyserver";
import type { RealtimeEnv } from "./types";

interface StoredRecord {
	userId: string;
	value: unknown;
	sizeBytes: number;
	updatedAt: number;
}

type RecordRow = {
	key: string;
	user_id: string;
	value: string;
	size_bytes: number;
	updated_at: number;
};

interface Pinned {
	userId: string;
	name: string;
	image: string | null;
	organizationIds: string[];
	author: boolean;
	writable: boolean;
	window: number;
	calls: number;
	presence?: boolean;
	guest?: boolean;
	guestNumber?: number | null;
	colorSlot?: number;
	viewerKey?: string;
	connectedAt?: number;
}

interface PresenceClaims {
	userId: string;
	name: string;
	image: string | null;
	organizationIds: string[];
	guest: boolean;
}

export const CLAIMS_HEADER = "x-superset-page-claims";

const CALLS_PER_WINDOW = 60;
const WINDOW_MS = 10_000;
const MANIFEST_TTL_MS = 60_000;
const SWEEP_MS = 30_000;
const SILENT_MS = 75_000;

export class PageHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	private ready = false;
	private manifest: PageManifest | null = null;
	private manifestReadAt = 0;
	private connectingGuests = 0;

	constructor(ctx: DurableObjectState, env: RealtimeEnv) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	private schema(): void {
		if (this.ready) return;
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS records (
				key TEXT NOT NULL,
				user_id TEXT NOT NULL,
				value TEXT NOT NULL,
				size_bytes INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				PRIMARY KEY (key, user_id)
			)`,
		);
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS visits (
				user_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				image TEXT,
				first_seen_at INTEGER NOT NULL,
				last_seen_at INTEGER NOT NULL
			)`,
		);
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS spent_nonces (
				nonce TEXT PRIMARY KEY,
				spent_at INTEGER NOT NULL
			)`,
		);
		this.ready = true;
	}

	async spendNonce(nonce: string, now: number): Promise<boolean> {
		this.schema();
		this.ctx.storage.sql.exec(
			"DELETE FROM spent_nonces WHERE spent_at < ?",
			now - 10 * 60_000,
		);
		const [existing] = this.ctx.storage.sql
			.exec<{ n: number }>(
				"SELECT count(*) AS n FROM spent_nonces WHERE nonce = ?",
				nonce,
			)
			.toArray();
		if ((existing?.n ?? 0) > 0) return false;
		this.ctx.storage.sql.exec(
			"INSERT INTO spent_nonces (nonce, spent_at) VALUES (?, ?)",
			nonce,
			now,
		);
		return true;
	}

	async readManifest(force = false): Promise<PageManifest | null> {
		const now = Date.now();
		if (!force && now - this.manifestReadAt < MANIFEST_TTL_MS) {
			return this.manifest;
		}
		const object = await this.env.PRIVATE.get(pageManifestKey(this.name));
		this.manifest = object ? parsePageManifest(await object.text()) : null;
		this.manifestReadAt = now;
		return this.manifest;
	}

	async manifestChanged(): Promise<void> {
		this.schema();
		const manifest = await this.readManifest(true);
		if (!manifest) {
			this.ctx.storage.sql.exec("DELETE FROM records");
			this.ctx.storage.sql.exec("DELETE FROM visits");
			for (const connection of this.getConnections<Pinned>()) {
				this.revoke(connection);
			}
			this.announce();
			return;
		}
		for (const connection of this.getConnections<Pinned>()) {
			const pinned = connection.state;
			if (!pinned) continue;
			const allowed = pinned.guest
				? guestReadable(manifest)
				: readable(manifest, {
						userId: pinned.userId,
						organizationIds: [...pinned.organizationIds],
					});
			if (!allowed) this.revoke(connection);
		}
		this.announce();
	}

	private revoke(connection: Connection<Pinned>): void {
		this.send(connection, { type: "revoked" });
		connection.close(4403, "revoked");
	}

	async onConnect(
		connection: Connection<Pinned>,
		ctx: ConnectionContext,
	): Promise<void> {
		this.schema();

		const raw = ctx.request.headers.get(CLAIMS_HEADER);
		if (!raw) {
			connection.close(4401, "unauthorized");
			return;
		}
		let claims: {
			userId: string;
			name: string;
			image: string | null;
			organizationIds: string[];
			nonce: string;
			presence?: boolean;
			guest?: boolean;
		};
		try {
			claims = JSON.parse(raw);
		} catch {
			connection.close(4401, "unauthorized");
			return;
		}

		if (claims.presence === true) {
			await this.joinPresence(connection, {
				userId: claims.userId,
				name: claims.name,
				image: claims.image,
				organizationIds: claims.organizationIds,
				guest: claims.guest === true,
			});
			return;
		}

		const origin = ctx.request.headers.get("origin");
		const expected = pageFrameOrigin(this.env.USERCONTENT_URL, this.name);
		if (origin !== expected) {
			connection.close(4403, "origin");
			return;
		}

		if (!(await this.spendNonce(claims.nonce, Date.now()))) {
			connection.close(4401, "ticket spent");
			return;
		}

		const manifest = await this.readManifest();
		const viewer = {
			userId: claims.userId,
			organizationIds: claims.organizationIds,
		};
		if (!manifest || !readable(manifest, viewer)) {
			connection.close(4403, "forbidden");
			return;
		}

		const pinned: Pinned = {
			userId: claims.userId,
			name: claims.name,
			image: claims.image,
			organizationIds: claims.organizationIds,
			author: manifest.createdByUserId === claims.userId,
			writable: writableFor(manifest, viewer),
			window: 0,
			calls: 0,
		};
		connection.setState(pinned);

		const now = Date.now();
		this.ctx.storage.sql.exec(
			`INSERT INTO visits (user_id, name, image, first_seen_at, last_seen_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (user_id) DO UPDATE SET
				name = excluded.name,
				image = excluded.image,
				last_seen_at = excluded.last_seen_at`,
			pinned.userId,
			pinned.name,
			pinned.image,
			now,
			now,
		);

		this.send(connection, {
			type: "hello",
			viewer: {
				userId: pinned.userId,
				name: pinned.name,
				image: pinned.image,
			},
			author: pinned.author,
			writable: pinned.writable,
		});
	}

	private async joinPresence(
		connection: Connection<Pinned>,
		claims: PresenceClaims,
	): Promise<void> {
		if (claims.guest) {
			let guests = this.connectingGuests;
			for (const other of this.getConnections<Pinned>()) {
				if (other.state?.presence && other.state.guest) guests++;
			}
			if (guests >= MAX_PAGE_GUESTS) {
				connection.close(4429, "full");
				return;
			}
			this.connectingGuests++;
		}
		try {
			const manifest = await this.readManifest();
			const allowed =
				manifest &&
				(claims.guest ? guestReadable(manifest) : readable(manifest, claims));
			if (!allowed) {
				connection.close(4403, "forbidden");
				return;
			}
			const viewerKey = await this.viewerKeyFor(claims.userId);
			connection.setState({
				userId: claims.userId,
				name: claims.name,
				image: claims.image,
				organizationIds: claims.organizationIds,
				author: false,
				writable: false,
				window: 0,
				calls: 0,
				presence: true,
				guest: claims.guest,
				guestNumber: claims.guest ? this.guestNumberFor(claims.userId) : null,
				colorSlot: this.colorSlotFor(claims.userId),
				viewerKey,
				connectedAt: Date.now(),
			});
		} finally {
			if (claims.guest) this.connectingGuests--;
		}
		this.announce();
		if ((await this.ctx.storage.getAlarm()) === null) {
			await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
		}
	}

	async onAlarm(): Promise<void> {
		const now = Date.now();
		let remaining = 0;
		let evicted = false;
		for (const connection of this.getConnections<Pinned>()) {
			const heardAt =
				this.ctx.getWebSocketAutoResponseTimestamp(connection)?.getTime() ??
				connection.state?.connectedAt;
			if (heardAt && now - heardAt > SILENT_MS) {
				try {
					connection.close(4408, "silent");
				} catch {}
				evicted = true;
				continue;
			}
			remaining++;
		}
		if (evicted) this.announce();
		if (remaining > 0) await this.ctx.storage.setAlarm(now + SWEEP_MS);
	}

	async onClose(connection: Connection<Pinned>): Promise<void> {
		const pinned = connection.state;
		if (!pinned) return;
		if (pinned.presence) {
			this.announce(connection.id);
			return;
		}
		this.schema();
		this.ctx.storage.sql.exec(
			"UPDATE visits SET last_seen_at = ? WHERE user_id = ?",
			Date.now(),
			pinned.userId,
		);
	}

	async onMessage(
		connection: Connection<Pinned>,
		message: string | ArrayBuffer,
	): Promise<void> {
		const pinned = connection.state;
		if (!pinned || pinned.presence || typeof message !== "string") return;

		let parsed: unknown;
		try {
			parsed = JSON.parse(message);
		} catch {
			return;
		}
		const call = parsed as { type?: unknown; id?: unknown; request?: unknown };
		if (call.type !== "call" || typeof call.id !== "string") return;

		if (!this.allow(connection, pinned)) {
			this.send(connection, {
				type: "result",
				id: call.id,
				ok: false,
				code: "rate_limited",
				message: "Too many storage calls; slow down",
			});
			return;
		}

		const request = call.request as PageStorageOp | undefined;
		if (!request || typeof request.key !== "string") {
			this.send(connection, {
				type: "result",
				id: call.id,
				ok: false,
				code: "invalid",
				message: "A storage call needs an op and a key",
			});
			return;
		}
		if (
			request.key.length === 0 ||
			request.key.length > MAX_PAGE_STORAGE_KEY_LENGTH
		) {
			this.send(connection, {
				type: "result",
				id: call.id,
				ok: false,
				code: "invalid",
				message: `A storage key is 1 to ${MAX_PAGE_STORAGE_KEY_LENGTH} characters`,
			});
			return;
		}

		this.schema();
		switch (request.op) {
			case "get":
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: true,
					result: {
						op: "get",
						value: this.one(request.key, pinned.userId)?.value ?? null,
					},
				});
				return;
			case "getAll":
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: true,
					result: { op: "getAll", records: this.named(request.key) },
				});
				return;
			case "set": {
				if (!pinned.writable) {
					this.send(connection, {
						type: "result",
						id: call.id,
						ok: false,
						code: "unauthenticated",
						message: "This viewer cannot write to this page",
					});
					return;
				}
				const refusal = this.write(pinned.userId, request.key, request.value);
				if (refusal) {
					this.send(connection, {
						type: "result",
						id: call.id,
						ok: false,
						...refusal,
					});
					return;
				}
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: true,
					result: { op: "set" },
				});
				this.push(request.key);
				return;
			}
			case "remove": {
				if (!pinned.writable) {
					this.send(connection, {
						type: "result",
						id: call.id,
						ok: false,
						code: "unauthenticated",
						message: "This viewer cannot write to this page",
					});
					return;
				}
				this.ctx.storage.sql.exec(
					"DELETE FROM records WHERE key = ? AND user_id = ?",
					request.key,
					pinned.userId,
				);
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: true,
					result: { op: "remove" },
				});
				this.push(request.key);
				return;
			}
			default:
				this.send(connection, {
					type: "result",
					id: call.id,
					ok: false,
					code: "invalid",
					message: "Unknown storage op",
				});
		}
	}

	private allow(
		connection: Connection<Pinned>,
		pinned: { window: number; calls: number },
	): boolean {
		const now = Date.now();
		const window = Math.floor(now / WINDOW_MS);
		const calls = pinned.window === window ? pinned.calls + 1 : 1;
		const current = connection.state;
		if (!current) return false;
		connection.setState({
			userId: current.userId,
			name: current.name,
			image: current.image,
			organizationIds: [...current.organizationIds],
			author: current.author,
			writable: current.writable,
			window,
			calls,
		});
		return calls <= CALLS_PER_WINDOW;
	}

	private send(
		connection: Connection<Pinned>,
		message: PageStorageSocketMessage,
	): void {
		try {
			connection.send(JSON.stringify(message));
		} catch {}
	}

	private push(key: string): void {
		const records = this.named(key);
		const payload = JSON.stringify({ type: "records", key, records });
		for (const connection of this.getConnections<Pinned>()) {
			if (!connection.state || connection.state.presence) continue;
			try {
				connection.send(payload);
			} catch {}
		}
	}

	private guestNumberFor(userId: string): number {
		const taken = new Set<number>();
		for (const connection of this.getConnections<Pinned>()) {
			const state = connection.state;
			if (!state?.presence || !state.guest || !state.guestNumber) continue;
			if (state.userId === userId) return state.guestNumber;
			taken.add(state.guestNumber);
		}
		let number = 1;
		while (taken.has(number)) number++;
		return number;
	}

	private colorSlotFor(userId: string): number {
		const taken = new Set<number>();
		const users = new Set<string>();
		for (const connection of this.getConnections<Pinned>()) {
			const state = connection.state;
			if (!state?.presence || state.colorSlot === undefined) continue;
			if (state.userId === userId) return state.colorSlot;
			taken.add(state.colorSlot);
			users.add(state.userId);
		}
		for (let slot = 0; slot < PRESENCE_COLOR_COUNT; slot++) {
			if (!taken.has(slot)) return slot;
		}
		return users.size % PRESENCE_COLOR_COUNT;
	}

	private async viewerKeyFor(userId: string): Promise<string> {
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(`${this.name}:${userId}`),
		);
		return [...new Uint8Array(digest).slice(0, 8)]
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
	}

	private announce(leaving?: string): void {
		const present: {
			connection: Connection<Pinned>;
			viewer: PagePresenceViewer;
		}[] = [];
		for (const connection of this.getConnections<Pinned>()) {
			const state = connection.state;
			if (!state?.presence || connection.id === leaving) continue;
			present.push({
				connection,
				viewer: {
					id: connection.id,
					key: state.viewerKey ?? connection.id,
					name: state.name,
					image: state.image,
					guest: state.guest === true,
					guestNumber: state.guestNumber ?? null,
					color: state.colorSlot ?? 0,
				},
			});
		}
		for (const { connection } of present) {
			const userId = connection.state?.userId;
			const viewers = present
				.filter((other) => other.connection.state?.userId !== userId)
				.map((other) => other.viewer);
			try {
				connection.send(JSON.stringify({ type: "presence", viewers }));
			} catch {}
		}
	}

	async apply(request: PageStorageHubRequest): Promise<PageStorageHubResponse> {
		this.schema();
		switch (request.op) {
			case "clear": {
				const before = this.count();
				if (request.key === undefined) {
					this.ctx.storage.sql.exec("DELETE FROM records");
				} else {
					this.ctx.storage.sql.exec(
						"DELETE FROM records WHERE key = ?",
						request.key,
					);
				}
				const cleared = before - this.count();
				if (cleared > 0) this.pushAll();
				return { ok: true, op: "clear", cleared };
			}
			case "clearUser": {
				const before = this.count();
				this.ctx.storage.sql.exec(
					"DELETE FROM records WHERE user_id = ?",
					request.userId,
				);
				this.ctx.storage.sql.exec(
					"DELETE FROM visits WHERE user_id = ?",
					request.userId,
				);
				const cleared = before - this.count();
				if (cleared > 0) this.pushAll();
				return { ok: true, op: "clearUser", cleared };
			}
			default:
				return { ok: false, code: "invalid", message: "Unknown admin op" };
		}
	}

	async storageKeys(): Promise<PageStorageKeySummary[]> {
		this.schema();
		return this.ctx.storage.sql
			.exec<{ key: string; records: number; updated_at: number }>(
				`SELECT key, count(*) AS records, max(updated_at) AS updated_at
				 FROM records
				 GROUP BY key
				 ORDER BY key`,
			)
			.toArray()
			.map((row) => ({
				key: row.key,
				records: row.records,
				updatedAt: new Date(row.updated_at).toISOString(),
			}));
	}

	async storageRecords(key: string): Promise<PageStorageRecord[]> {
		this.schema();
		return this.named(key);
	}

	async subscriberCount(): Promise<number> {
		let count = 0;
		for (const _ of this.getConnections()) count++;
		return count;
	}

	private pushAll(): void {
		const keys = this.ctx.storage.sql
			.exec<{ key: string }>("SELECT DISTINCT key FROM records")
			.toArray()
			.map((row) => row.key);
		for (const key of keys) this.push(key);
	}

	private one(key: string, userId: string): StoredRecord | null {
		const [row] = this.ctx.storage.sql
			.exec<RecordRow>(
				"SELECT key, user_id, value, size_bytes, updated_at FROM records WHERE key = ? AND user_id = ?",
				key,
				userId,
			)
			.toArray();
		return row ? toRecord(row) : null;
	}

	private named(key: string): PageStorageRecord[] {
		const rows = this.ctx.storage.sql
			.exec<RecordRow & { name: string | null; image: string | null }>(
				`SELECT r.key, r.user_id, r.value, r.size_bytes, r.updated_at,
				        v.name, v.image
				 FROM records r
				 LEFT JOIN visits v ON v.user_id = r.user_id
				 WHERE r.key = ?
				 ORDER BY r.updated_at`,
				key,
			)
			.toArray();
		return rows.map((row) => ({
			userId: row.user_id,
			name: row.name ?? "Someone",
			image: row.image ?? null,
			value: decode(row.value),
			updatedAt: new Date(row.updated_at).toISOString(),
		}));
	}

	private write(
		userId: string,
		key: string,
		value: unknown,
	): { code: "quota_exceeded"; message: string } | null {
		const encoded = JSON.stringify(value ?? null);
		const sizeBytes = pageStorageValueBytes(value ?? null);

		const [usage] = this.ctx.storage.sql
			.exec<{ total: number; mine: number; replacing: number }>(
				`SELECT
					coalesce(sum(size_bytes), 0) AS total,
					count(*) FILTER (WHERE user_id = ?) AS mine,
					coalesce(sum(size_bytes) FILTER (WHERE user_id = ? AND key = ?), 0) AS replacing
				FROM records`,
				userId,
				userId,
				key,
			)
			.toArray();

		const refusal = pageStorageRefusal(
			{
				totalBytes: usage?.total ?? 0,
				keysForUser: usage?.mine ?? 0,
				replacingBytes: usage?.replacing ?? 0,
				replacingExisting: this.one(key, userId) !== null,
			},
			sizeBytes,
		);
		if (refusal) return refusal;

		this.ctx.storage.sql.exec(
			`INSERT INTO records (key, user_id, value, size_bytes, updated_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (key, user_id) DO UPDATE SET
				value = excluded.value,
				size_bytes = excluded.size_bytes,
				updated_at = excluded.updated_at`,
			key,
			userId,
			encoded,
			sizeBytes,
			Date.now(),
		);
		return null;
	}

	private count(): number {
		const [row] = this.ctx.storage.sql
			.exec<{ n: number }>("SELECT count(*) AS n FROM records")
			.toArray();
		return row?.n ?? 0;
	}
}

function decode(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function toRecord(row: RecordRow): StoredRecord {
	return {
		userId: row.user_id,
		value: decode(row.value),
		sizeBytes: row.size_bytes,
		updatedAt: row.updated_at,
	};
}
