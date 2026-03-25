import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getSshHostServiceKey,
	useHostService,
} from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { getSshHostIdFromDeviceClientId } from "shared/ssh-hosts";
import { SessionSelector } from "./components/SessionSelector";
import { ChatPaneInterface as WorkspaceChatInterface } from "./components/WorkspaceChatInterface";
import { useWorkspaceChatController } from "./hooks/useWorkspaceChatController";

export function WorkspaceChat({
	onSessionIdChange,
	sessionId,
	workspaceId,
}: {
	onSessionIdChange: (sessionId: string | null) => void;
	sessionId: string | null;
	workspaceId: string;
}) {
	const collections = useCollections();
	const { sshHosts, sshStatuses } = useHostService();
	const {
		organizationId,
		workspacePath,
		sessionItems,
		handleSelectSession,
		handleNewChat,
		handleDeleteSession,
		getOrCreateSession,
	} = useWorkspaceChatController({
		onSessionIdChange,
		sessionId,
		workspaceId,
	});

	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.leftJoin(
					{ devices: collections.v2Devices },
					({ workspaces, devices }) => eq(workspaces.deviceId, devices.id),
				)
				.where(({ workspaces }) => eq(workspaces.id, workspaceId))
				.select(({ devices, workspaces }) => ({
					organizationId: workspaces.organizationId,
					deviceClientId: devices?.clientId ?? null,
				})),
		[collections, workspaceId],
	);
	const workspace = workspaces[0] ?? null;
	const sshHostId = getSshHostIdFromDeviceClientId(workspace?.deviceClientId);
	const sshStatus =
		workspace && sshHostId
			? (sshStatuses.get(getSshHostServiceKey(sshHostId)) ?? null)
			: null;
	const sshHost =
		sshHostId === null
			? null
			: (sshHosts.find((host) => host.id === sshHostId) ?? null);
	const chatUnavailableMessage = useMemo(() => {
		if (!sshHostId) {
			return null;
		}

		if (sshStatus?.health?.hasModelProviderCredentials === false) {
			return `Chat is disabled for ${sshHost?.name ?? "this SSH host"} because the remote machine does not have model provider credentials configured.`;
		}

		return null;
	}, [sshHost, sshHostId, sshStatus?.health?.hasModelProviderCredentials]);

	if (chatUnavailableMessage) {
		return (
			<div className="flex h-full w-full min-h-0 flex-col">
				<div className="border-b border-border px-4 py-3">
					<SessionSelector
						currentSessionId={sessionId}
						sessions={sessionItems}
						fallbackTitle="New Chat"
						onSelectSession={handleSelectSession}
						onNewChat={handleNewChat}
						onDeleteSession={handleDeleteSession}
					/>
				</div>
				<div className="flex min-h-0 flex-1 items-center justify-center p-6">
					<div className="max-w-md rounded-lg border border-border bg-card p-6">
						<h2 className="text-base font-semibold">Chat unavailable</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							{chatUnavailableMessage}
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full min-h-0 flex-col">
			<div className="border-b border-border px-4 py-3">
				<SessionSelector
					currentSessionId={sessionId}
					sessions={sessionItems}
					fallbackTitle="New Chat"
					onSelectSession={handleSelectSession}
					onNewChat={handleNewChat}
					onDeleteSession={handleDeleteSession}
				/>
			</div>

			<div className="min-h-0 flex-1">
				<WorkspaceChatInterface
					getOrCreateSession={getOrCreateSession}
					initialLaunchConfig={null}
					isFocused
					onResetSession={handleNewChat}
					sessionId={sessionId}
					workspaceId={workspaceId}
					organizationId={organizationId}
					cwd={workspacePath}
				/>
			</div>
		</div>
	);
}
