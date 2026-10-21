import { useLingui } from "@lingui/react/macro";
import type {
	ComposerActionContext,
	ComposerChip,
	PromptInputCommand,
} from "@superset/chat-ui/PromptInput";
import { workspaceTrpc } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { ServerIcon } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import { ConnectConnectorDialog } from "renderer/components/ConnectorSection";
import { PluginIcon } from "renderer/components/PluginIcon";
import { useInstallAfterConnect } from "renderer/routes/_authenticated/_dashboard/hooks/useInstallAfterConnect";
import { usePluginMutations } from "renderer/routes/_authenticated/_dashboard/hooks/usePluginMutations";
import { resolveMcpServerName } from "../../../../utils/mcpServerChips";
import { McpServerPicker } from "../../components/McpServerPicker";
import type { McpPickerActionRow } from "../../components/McpServerPicker/utils/mcpPickerRows";

type McpServerPickerControls = {
	command: PromptInputCommand | null;
	serverNameOf: (chip: ComposerChip) => string | null;
	dialog: ReactNode;
	open: RefObject<(ctx: ComposerActionContext) => void>;
};

export function useMcpServerPicker({
	workspaceId,
	presetId,
}: {
	workspaceId: string;
	presetId: string | undefined;
}): McpServerPickerControls {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = workspaceTrpc.useUtils();
	const { install } = usePluginMutations();
	const installAfterConnect = useInstallAfterConnect();
	const input = { workspaceId, agent: presetId ?? "" };
	const listed = workspaceTrpc.agentTooling.listMcpServers.useQuery(input, {
		enabled: presetId !== undefined,
	}).data;
	const pickerAgent = listed?.supported === true ? presetId : undefined;
	const cached = listed?.servers;
	const [connecting, setConnecting] = useState<{
		plugin: string;
		connector: string;
	} | null>(null);
	const contextRef = useRef<ComposerActionContext | null>(null);
	const installedHereRef = useRef<ReadonlySet<string>>(new Set());
	const pendingInstallRef = useRef<Promise<void>>(Promise.resolve());
	const openRef = useRef<(ctx: ComposerActionContext) => void>(() => {});

	const refresh = () =>
		utils.agentTooling.listMcpServers
			.fetch({ ...input, refresh: true })
			.then((data) => utils.agentTooling.listMcpServers.setData(input, data))
			.catch(() => {});

	const reopen = () => {
		const ctx = contextRef.current;
		if (ctx) openRef.current(ctx);
	};

	const markInstalled = (plugin: string) => {
		installedHereRef.current = new Set([...installedHereRef.current, plugin]);
	};

	const runAction = async (row: McpPickerActionRow) => {
		const plugin = row.plugin.name;
		if (row.action === "connect") {
			setConnecting({ plugin, connector: row.connector });
			return;
		}
		try {
			await install(plugin);
		} catch {
			return;
		}
		markInstalled(plugin);
		await refresh();
		reopen();
	};
	const runActionRef = useRef(runAction);
	runActionRef.current = runAction;

	openRef.current = (ctx) => {
		if (!pickerAgent) return;
		contextRef.current = ctx;
		ctx.openPanel({
			title: t({ message: "MCP servers" }),
			bare: true,
			render: ({ close }) => (
				<McpServerPicker
					presetId={pickerAgent}
					installedHere={installedHereRef.current}
					workspaceId={workspaceId}
					onPick={(chip) => {
						ctx.insertChip(chip);
						close();
					}}
					onAction={(row) => {
						close();
						void runActionRef.current(row);
					}}
					onManage={() => {
						close();
						void navigate({ to: "/plugins" });
					}}
					onClose={close}
				/>
			),
		});
	};

	const command = useMemo<PromptInputCommand | null>(
		() =>
			pickerAgent
				? {
						id: "superset:mcp",
						title: "/mcp",
						description: t({ message: "Choose MCP servers for this message" }),
						icon: <ServerIcon className="size-4" />,
						group: t({ message: "Commands" }),
						onSelect: (ctx) => openRef.current(ctx),
					}
				: null,
		[pickerAgent, t],
	);

	const dialog = (
		<ConnectConnectorDialog
			slug={connecting?.connector ?? null}
			connectOnly
			icon={
				connecting ? (
					<PluginIcon className="size-12" pluginName={connecting.plugin} />
				) : undefined
			}
			onConnected={() => {
				const plugin = connecting?.plugin;
				if (!plugin) return;
				pendingInstallRef.current = installAfterConnect(plugin).then(
					() => markInstalled(plugin),
					() => {},
				);
			}}
			onOpenChange={(open) => {
				if (open) return;
				setConnecting(null);
				void pendingInstallRef.current.then(refresh).then(reopen);
			}}
		/>
	);

	const serverNameOf = useCallback(
		(chip: ComposerChip) => resolveMcpServerName(chip, cached ?? [], presetId),
		[cached, presetId],
	);

	return { command, serverNameOf, dialog, open: openRef };
}
