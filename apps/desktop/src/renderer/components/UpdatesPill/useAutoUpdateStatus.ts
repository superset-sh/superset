import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { AutoUpdateStatusEvent } from "shared/auto-update";

export function useAutoUpdateStatus(): AutoUpdateStatusEvent | null {
	const [event, setEvent] = useState<AutoUpdateStatusEvent | null>(null);

	electronTrpc.autoUpdate.subscribe.useSubscription(undefined, {
		onData: setEvent,
	});

	return event;
}
