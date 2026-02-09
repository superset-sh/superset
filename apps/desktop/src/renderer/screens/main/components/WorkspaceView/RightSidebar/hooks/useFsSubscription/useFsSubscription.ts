import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function useFsSubscription({
	workspaceId,
	onData,
	debounceMs,
}: {
	workspaceId: string | undefined;
	onData: () => void;
	debounceMs?: number;
}): void {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const onDataRef = useRef(onData);
	onDataRef.current = onData;

	const handler = useCallback(() => {
		if (!debounceMs) {
			onDataRef.current();
			return;
		}
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			onDataRef.current();
		}, debounceMs);
	}, [debounceMs]);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	electronTrpc.filesystem.subscribe.useSubscription(
		{ workspaceId: workspaceId ?? "" },
		{
			enabled: !!workspaceId,
			onData: handler,
		},
	);
}
