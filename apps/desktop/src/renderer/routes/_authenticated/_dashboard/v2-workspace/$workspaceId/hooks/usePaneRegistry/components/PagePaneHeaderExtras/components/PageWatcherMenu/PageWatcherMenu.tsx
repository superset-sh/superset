import { useNavigate } from "@tanstack/react-router";
import {
	type PageWatcherRow,
	usePageWatchersForPage,
} from "renderer/hooks/host-service/usePageWatchersForPage";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { AgentSessionPicker } from "renderer/routes/_authenticated/_dashboard/components/AgentSessionPicker";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { CreateNewAgentSession } from "../../../../../useAgentSessionLauncher";
import { PageWatcherPopover } from "./components/PageWatcherPopover";

interface PageWatcherMenuProps {
	workspaceId: string;
	pageId: string | undefined;
	canManage: boolean;
	onCreateNewAgentSession: CreateNewAgentSession;
}

export function PageWatcherMenu({
	workspaceId,
	pageId,
	canManage,
	onCreateNewAgentSession,
}: PageWatcherMenuProps) {
	const navigate = useNavigate();
	const watchers = usePageWatchersForPage({ pageId, workspaceId });
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const bindings = useTerminalAgentBindings(workspaceId);

	const openWatcher = (watcher: PageWatcherRow) => {
		void navigateToV2Workspace(watcher.workspaceId, navigate, {
			search: {
				terminalId: watcher.terminalId,
				focusRequestId: crypto.randomUUID(),
			},
		});
	};

	return (
		<PageWatcherPopover
			workspaceId={workspaceId}
			pageId={pageId}
			canManage={canManage}
			onCreateNewAgentSession={onCreateNewAgentSession}
			watchers={watchers}
			hostUrl={hostUrl}
			configs={configs}
			bindings={bindings}
			getHostClient={getHostServiceClientByUrl}
			onOpenWatcher={openWatcher}
			renderAgentPicker={(picker) => (
				<AgentSessionPicker workspaceId={workspaceId} {...picker} />
			)}
		/>
	);
}
