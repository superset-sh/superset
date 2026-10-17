import { Trans, useLingui } from "@lingui/react/macro";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import type {
	McpServerAgent,
	McpServerEntry,
	McpServerScope,
} from "@superset/shared/mcp-servers";
import {
	Command,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { RefreshCwIcon, SettingsIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { PluginIcon } from "renderer/components/PluginIcon";
import { usePluginCatalog } from "renderer/hooks/usePluginCatalog";
import { mcpServerChip, mcpServerToken } from "../../utils/mcpServerChips";
import { mcpServerIconUrl } from "../../utils/mcpServerIconUrl";
import {
	type McpPickerActionRow,
	type McpPickerRow,
	type McpPluginAccount,
	mcpPickerRows,
} from "./utils/mcpPickerRows";

const NO_SERVERS: McpServerEntry[] = [];

const AGENT_LABELS: Record<McpServerAgent, string> = {
	claude: "Claude Code",
	codex: "Codex",
};

export type McpServerPickerProps = {
	workspaceId: string;
	agentId: string;
	/** Plugins installed from this picker before this machine's config caught up. */
	installedHere: ReadonlySet<string>;
	onPick: (chip: ComposerChip) => void;
	onAction: (row: McpPickerActionRow) => void;
	onManage: () => void;
	onClose: () => void;
};

export function McpServerPicker({
	workspaceId,
	agentId,
	installedHere,
	onPick,
	onAction,
	onManage,
	onClose,
}: McpServerPickerProps) {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	const [query, setQuery] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);
	// The command menu's own editor update runs after this mounts and keeps
	// focus in the editor, so focus the search a frame later.
	useEffect(() => {
		const frame = requestAnimationFrame(() => searchRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, []);
	const input = { workspaceId, agent: agentId };
	const utils = workspaceTrpc.useUtils();
	const list = workspaceTrpc.agentTooling.listMcpServers.useQuery(input, {
		staleTime: 30_000,
	});
	const [isRefreshing, setIsRefreshing] = useState(false);
	const refresh = async () => {
		setIsRefreshing(true);
		try {
			utils.agentTooling.listMcpServers.setData(
				input,
				await utils.agentTooling.listMcpServers.fetch({
					...input,
					refresh: true,
				}),
			);
		} catch {
		} finally {
			setIsRefreshing(false);
		}
	};
	const servers = useMemo(
		() =>
			(list.data?.servers ?? NO_SERVERS).map((server) =>
				server.plugin && installedHere.has(server.plugin.name)
					? { ...server, plugin: { ...server.plugin, installed: true } }
					: server,
			),
		[list.data, installedHere],
	);
	const { plugins: catalog } = usePluginCatalog();
	const plugins = useMemo(
		() =>
			new Map<string, McpPluginAccount>(
				catalog.map((plugin) => [
					plugin.name,
					{
						displayName: plugin.interface.displayName,
						connector: plugin.connector,
						connected: plugin.connections.length > 0,
					},
				]),
			),
		[catalog],
	);
	const rows = useMemo(
		() => mcpPickerRows(servers, plugins, query),
		[servers, plugins, query],
	);
	const scopeLabels: Record<McpServerScope, string> = {
		user: t({ message: "user", context: "MCP server scope" }),
		project: t({ message: "project", context: "MCP server scope" }),
		local: t({ message: "local", context: "MCP server scope" }),
	};

	const subtitle = (row: McpPickerRow) => {
		const { server } = row;
		if (server.state === "not-configured" && server.plugin) {
			const name =
				plugins.get(server.plugin.name)?.displayName ?? server.plugin.name;
			return t({ message: `${name} plugin` });
		}
		return `${AGENT_LABELS[server.agent]} · ${scopeLabels[server.scope]}`;
	};

	const status = (row: McpPickerRow) => {
		if (row.kind === "available") return <Trans>Available</Trans>;
		if (row.kind === "action") {
			return (
				<span className="rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground">
					{row.action === "install" ? (
						<Trans>Install</Trans>
					) : (
						<Trans>Connect</Trans>
					)}
				</span>
			);
		}
		if (row.reason === "disabled")
			return <Trans>Disabled in agent config</Trans>;
		if (row.reason === "next-session") return <Trans>In your next chat</Trans>;
		if (row.reason === "untrusted") {
			return <Trans>Project not trusted in Codex</Trans>;
		}
		const agent = AGENT_LABELS[row.server.agent];
		return t({ message: `Configured for ${agent}` });
	};

	return (
		<Command
			shouldFilter={false}
			loop
			label={t({ message: "Choose an MCP server" })}
			className="h-auto rounded-2xl bg-popover/95 shadow-xl ring-1 ring-border backdrop-blur-sm"
			onKeyDown={(event) => {
				if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
				event.preventDefault();
				event.stopPropagation();
				onClose();
			}}
		>
			<div className="flex items-center pr-1.5 [&>[data-slot=command-input-wrapper]]:flex-1 [&>[data-slot=command-input-wrapper]]:border-b-0">
				<CommandInput
					ref={searchRef}
					value={query}
					onValueChange={setQuery}
					placeholder={t({ message: "Search MCP servers…" })}
				/>
				<button
					type="button"
					aria-label={t({ message: "Read MCP servers again" })}
					onClick={() => void refresh()}
					disabled={isRefreshing}
					className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default"
				>
					<RefreshCwIcon
						className={cn(
							"size-3.5",
							isRefreshing && "animate-spin motion-reduce:animate-none",
						)}
					/>
				</button>
			</div>
			<CommandList
				aria-label={t({ message: "MCP servers" })}
				className="max-h-[min(264px,45vh)] border-border border-t p-1"
			>
				{list.isPending ? (
					<p className="px-2 py-2 text-muted-foreground text-xs">
						<Trans>Checking MCP servers…</Trans>
					</p>
				) : list.isError ? (
					<p role="alert" className="px-2 py-2 text-destructive text-xs">
						<Trans>Could not read MCP servers.</Trans>
					</p>
				) : rows.length === 0 ? (
					<p className="px-2 py-2 text-muted-foreground text-xs">
						{query ? (
							<Trans>No matching MCP servers</Trans>
						) : (
							<Trans>No MCP servers found</Trans>
						)}
					</p>
				) : (
					rows.map((row) => {
						const icon = row.server.plugin
							? null
							: getPresetIcon(row.server.agent, isDark);
						return (
							<CommandItem
								key={row.key}
								value={row.key}
								disabled={row.kind === "unavailable"}
								onSelect={() => {
									if (row.kind === "available") {
										onPick(
											mcpServerChip(
												row.server.name,
												mcpServerToken(row.server, servers),
												mcpServerIconUrl(row.server, isDark),
											),
										);
									} else if (row.kind === "action") onAction(row);
								}}
								className="h-11 cursor-pointer gap-2.5 rounded-[10px] px-2"
							>
								{row.server.plugin ? (
									<PluginIcon
										className="size-4 rounded"
										pluginName={row.server.plugin.name}
									/>
								) : icon ? (
									<img alt="" className="size-4 shrink-0" src={icon} />
								) : (
									<span className="size-4 shrink-0" />
								)}
								<span className="min-w-0 flex-1">
									<span className="block truncate text-[13px] text-foreground">
										{row.server.name}
									</span>
									<span className="block truncate text-[11px] text-muted-foreground">
										{subtitle(row)}
									</span>
								</span>
								<span className="max-w-[45%] shrink-0 truncate text-[11px] text-muted-foreground">
									{status(row)}
								</span>
							</CommandItem>
						);
					})
				)}
			</CommandList>
			<button
				type="button"
				onClick={onManage}
				className="flex w-full cursor-pointer items-center gap-2 border-border border-t px-3 py-2 text-left text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
			>
				<SettingsIcon className="size-3.5" />
				<Trans>Manage plugins…</Trans>
			</button>
		</Command>
	);
}
