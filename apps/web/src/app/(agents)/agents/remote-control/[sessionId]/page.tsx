import { REMOTE_CONTROL_TOKEN_PARAM } from "@superset/shared/remote-control-protocol";
import { RemoteTerminal } from "./components/RemoteTerminal";

interface PageProps {
	params: Promise<{ sessionId: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RemoteControlPage({
	params,
	searchParams,
}: PageProps) {
	const { sessionId } = await params;
	const search = await searchParams;
	const tokenRaw = search[REMOTE_CONTROL_TOKEN_PARAM];
	const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;

	if (!token) {
		return (
			<div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-12">
				<h1 className="text-xl font-semibold">Remote control unavailable</h1>
				<p className="select-text cursor-text text-sm text-muted-foreground">
					This link is missing its access token. Open the share link from the
					original message to view the terminal.
				</p>
			</div>
		);
	}

	return <RemoteTerminal sessionId={sessionId} token={token} />;
}
