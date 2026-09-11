import { useRealtimeNudges } from "renderer/hooks/useRealtimeNudges";

/** Mounted inside the providers: the subscription needs the active organization. */
export function RealtimeNudges() {
	useRealtimeNudges();
	return null;
}
