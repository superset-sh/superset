import { Trans } from "@lingui/react/macro";
import type { ChatTransport } from "@superset/chat/client";
import type { ChatSessionRow } from "@superset/chat-runtime";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ChevronDown, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function sessionLabel(session: ChatSessionRow): string {
	return session.title ?? session.sessionId.slice(0, 8);
}

export function SessionPicker({
	activeSessionId,
	onNewSession,
	onSelect,
	transport,
	workspaceId,
}: {
	workspaceId: string;
	transport: ChatTransport;
	activeSessionId: string | null;
	onSelect: (sessionId: string) => void;
	onNewSession: () => void;
}) {
	const [sessions, setSessions] = useState<ChatSessionRow[]>([]);

	const refresh = useCallback(async () => {
		try {
			setSessions(await transport.listSessions({ workspaceId }));
		} catch {
			setSessions([]);
		}
	}, [transport, workspaceId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const active = sessions.find(
		(session) => session.sessionId === activeSessionId,
	);

	return (
		<DropdownMenu
			onOpenChange={(open) => {
				if (open) void refresh();
			}}
		>
			<DropdownMenuTrigger asChild>
				<Button size="sm" variant="ghost">
					{active ? sessionLabel(active) : <Trans>Sessions</Trans>}
					<ChevronDown className="ml-1 size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{sessions.map((session) => (
					<DropdownMenuItem
						key={session.sessionId}
						onSelect={() => onSelect(session.sessionId)}
					>
						<span className="truncate">{sessionLabel(session)}</span>
						<span className="ml-2 font-mono text-xs text-muted-foreground">
							{session.harness}
						</span>
					</DropdownMenuItem>
				))}
				{sessions.length > 0 && <DropdownMenuSeparator />}
				<DropdownMenuItem onSelect={onNewSession}>
					<Plus className="mr-1 size-3.5" />
					<Trans>New session</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
