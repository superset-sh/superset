/**
 * Renderer-local pub/sub between one plugin's mounted surfaces (pane,
 * sidebar tab) in the same workspace. Backing for `ctx.postMessage` /
 * `ctx.onMessage` — the sender's own mount never receives its message.
 */

interface BusEntry {
	mountId: number;
	handler: (payload: unknown) => void;
}

const buses = new Map<string, Set<BusEntry>>();
let nextMountId = 1;

function busKey(pluginId: string, workspaceId: string): string {
	return `${pluginId}\0${workspaceId}`;
}

export function allocPluginMountId(): number {
	return nextMountId++;
}

export function subscribePluginLocal(
	pluginId: string,
	workspaceId: string,
	mountId: number,
	handler: (payload: unknown) => void,
): () => void {
	const key = busKey(pluginId, workspaceId);
	let entries = buses.get(key);
	if (!entries) {
		entries = new Set();
		buses.set(key, entries);
	}
	const entry: BusEntry = { mountId, handler };
	entries.add(entry);
	return () => {
		entries.delete(entry);
		if (entries.size === 0) buses.delete(key);
	};
}

export function publishPluginLocal(
	pluginId: string,
	workspaceId: string,
	senderMountId: number,
	payload: unknown,
): void {
	const entries = buses.get(busKey(pluginId, workspaceId));
	if (!entries) return;
	for (const entry of entries) {
		if (entry.mountId === senderMountId) continue;
		try {
			entry.handler(payload);
		} catch (error) {
			console.error(`[plugins] ${pluginId} onMessage handler failed:`, error);
		}
	}
}
