import { use } from "react";
import { RemoteTerminalLoader } from "./components/RemoteTerminalLoader";

interface PageProps {
	params: Promise<{ sessionId: string }>;
}

export default function RemoteControlPage({ params }: PageProps) {
	const { sessionId } = use(params);
	// The bearer token is in `location.hash`, not the query string — keeping
	// it out of server access logs, browser history's query, and `Referer`
	// headers. `RemoteTerminalLoader` reads it client-side after mount.
	return <RemoteTerminalLoader sessionId={sessionId} />;
}
