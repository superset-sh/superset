import { useLingui } from "@lingui/react/macro";
import type {
	ComposerActionContext,
	ComposerChipMatch,
	PromptInputCommand,
} from "@superset/chat-ui/PromptInput";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { ServerIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { ConnectConnectorDialog } from "renderer/components/ConnectorSection";
import { PluginIcon } from "renderer/components/PluginIcon";
import { usePluginMutations } from "renderer/routes/_authenticated/_dashboard/hooks/usePluginMutations";
import { McpServerPicker } from "../../components/McpServerPicker";
import type { McpPickerActionRow } from "../../components/McpServerPicker/utils/mcpPickerRows";
import {
	findMcpServerTokens,
	mcpServerChip,
	mcpServerToken,
} from "../../utils/mcpServerChips";
import { mcpServerIconUrl } from "../../utils/mcpServerIconUrl";

export type McpServerPickerControls = {
	command: PromptInputCommand | null;
	findChips: (text: string) => ComposerChipMatch[];
	dialog: ReactNode;
};

export function useMcpServerPicker({
	workspaceId,
	agentId,
}: {
	workspaceId: string;
	agentId: string | undefined;
}): McpServerPickerControls {
	const { t } = useLingui();
	const pickerAgent =
		agentId === "claude" || agentId === "codex" ? agentId : undefined;
	const navigate = useNavigate();
	const isDark = useIsDarkTheme();
	const utils = workspaceTrpc.useUtils();
	const { install } = usePluginMutations({ announceInstall: false });
	const input = { workspaceId, agent: agentId ?? "" };
	const cached = workspaceTrpc.agentTooling.listMcpServers.useQuery(input, {
		enabled: false,
	}).data?.servers;
	const [connecting, setConnecting] = useState<{
		plugin: string;
		connector: string;
	} | null>(null);
	const contextRef = useRef<ComposerActionContext | null>(null);
	const installedHereRef = useRef<ReadonlySet<string>>(new Set());
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

	const runAction = async (row: McpPickerActionRow) => {
		if (!row.server.plugin?.installed) {
			try {
				await install(row.plugin);
			} catch {
				return;
			}
			installedHereRef.current = new Set([
				...installedHereRef.current,
				row.plugin,
			]);
		}
		await refresh();
		if (row.needsAccount && row.connector) {
			setConnecting({ plugin: row.plugin, connector: row.connector });
			return;
		}
		const name = row.displayName;
		toast.success(t({ message: `${name} is installed` }), {
			description: t({
				message: "Its tools reach the agent in your next chat.",
			}),
		});
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
					agentId={pickerAgent}
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

	const findChips = useCallback(
		(text: string): ComposerChipMatch[] =>
			findMcpServerTokens(text).map(({ start, end, token, name }) => {
				const server = cached?.find(
					(candidate) =>
						candidate.agent === agentId &&
						mcpServerToken(candidate, cached) === token,
				);
				return {
					start,
					end,
					chip: mcpServerChip(
						server?.name ?? name,
						token,
						server ? mcpServerIconUrl(server, isDark) : undefined,
					),
				};
			}),
		[agentId, cached, isDark],
	);

	const dialog = (
		<ConnectConnectorDialog
			slug={connecting?.connector ?? null}
			icon={
				connecting ? (
					<PluginIcon className="size-12" pluginName={connecting.plugin} />
				) : undefined
			}
			onOpenChange={(open) => {
				if (open) return;
				setConnecting(null);
				void refresh().then(reopen);
			}}
		/>
	);

	return { command, findChips, dialog };
}
