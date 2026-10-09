import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { workspaceTrpc } from "@superset/workspace-client";
import { useState } from "react";
import { TbChevronDown } from "react-icons/tb";
import { FloatingBar } from "../FloatingBar";
import { PaneMessage } from "../PaneMessage";
import { RemoteSimulator } from "./components/RemoteSimulator";

const SESSION_POLL_MS = 10_000;

/** Shows the hosted simulators an agent started for this workspace. The pane
 * only watches: whoever starts a session also stops it. */
export function CloudSimulator() {
	const { t } = useLingui();
	const sessionsQuery = workspaceTrpc.mobile.easSessions.useQuery(undefined, {
		refetchInterval: SESSION_POLL_MS,
	});
	const [selectedId, setSelectedId] = useState<string | null>(null);

	if (sessionsQuery.isPending) {
		return (
			<PaneMessage>
				<Trans>Looking for a mobile simulator…</Trans>
			</PaneMessage>
		);
	}
	if (sessionsQuery.isError) {
		return (
			<PaneMessage>
				<Trans>Could not reach a mobile simulator.</Trans>
				<div className="mt-2 text-xs opacity-70">
					{errorMessage(sessionsQuery.error)}
				</div>
			</PaneMessage>
		);
	}

	const sessions = sessionsQuery.data;
	const session =
		sessions.find((candidate) => candidate.sessionId === selectedId) ??
		sessions[0];
	if (!session) {
		return (
			<PaneMessage>
				<Trans>No simulator is running.</Trans>
			</PaneMessage>
		);
	}

	const fallbackName = t({ message: "iOS Simulator" });
	const deviceName = session.name ?? fallbackName;
	return (
		<RemoteSimulator
			key={session.sessionId}
			session={session}
			deviceName={deviceName}
			picker={
				<FloatingBar className="top-3 left-3 max-w-[calc(100%-7.5rem)]">
					{sessions.length > 1 ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="xs"
									className="min-w-0 gap-1.5 font-normal"
								>
									<span className="truncate">{deviceName}</span>
									<TbChevronDown className="size-3 shrink-0 text-muted-foreground" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								{sessions.map((candidate) => (
									<DropdownMenuItem
										key={candidate.sessionId}
										onSelect={() => setSelectedId(candidate.sessionId)}
									>
										{candidate.name ?? fallbackName}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						<span className="truncate px-2 py-1 text-xs">{deviceName}</span>
					)}
				</FloatingBar>
			}
		/>
	);
}
