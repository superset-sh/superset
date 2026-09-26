import type { ChatTransport } from "@superset/chat/client";
import type { ChatPinRow } from "@superset/chat-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";

export type UsePins = {
	pins: ChatPinRow[];
	pinnedItemIds: ReadonlySet<string>;
	refresh: () => void;
	addPin: (
		itemId: string,
		label: string,
		snapshotText: string,
	) => Promise<void>;
	removePin: (itemId: string) => Promise<void>;
	renamePin: (itemId: string, label: string) => Promise<void>;
};

export function usePins(
	transport: ChatTransport,
	sessionId: string | null,
): UsePins {
	const [pins, setPins] = useState<ChatPinRow[]>([]);

	const refresh = useCallback(async () => {
		if (!sessionId) {
			setPins([]);
			return;
		}
		try {
			setPins(await transport.listPins({ sessionId }));
		} catch {
			setPins([]);
		}
	}, [transport, sessionId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const addPin = useCallback(
		async (itemId: string, label: string, snapshotText: string) => {
			if (!sessionId) return;
			try {
				await transport.addPin({
					commandId: crypto.randomUUID(),
					sessionId,
					itemId,
					label,
					snapshotText,
				});
			} catch (error) {
				console.error("[pins] addPin failed:", error);
				throw error;
			} finally {
				await refresh();
			}
		},
		[transport, sessionId, refresh],
	);

	const removePin = useCallback(
		async (itemId: string) => {
			if (!sessionId) return;
			try {
				await transport.removePin({
					commandId: crypto.randomUUID(),
					sessionId,
					itemId,
				});
			} catch (error) {
				console.error("[pins] removePin failed:", error);
				throw error;
			} finally {
				await refresh();
			}
		},
		[transport, sessionId, refresh],
	);

	const renamePin = useCallback(
		async (itemId: string, label: string) => {
			if (!sessionId) return;
			try {
				await transport.renamePin({
					commandId: crypto.randomUUID(),
					sessionId,
					itemId,
					label,
				});
			} catch (error) {
				console.error("[pins] renamePin failed:", error);
				throw error;
			} finally {
				await refresh();
			}
		},
		[transport, sessionId, refresh],
	);

	const pinnedItemIds = useMemo(
		() => new Set(pins.map((pin) => pin.itemId)),
		[pins],
	);

	return { pins, pinnedItemIds, refresh, addPin, removePin, renamePin };
}
