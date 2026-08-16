import type { PluginSnapshot } from "@superset/host-service";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { Input } from "@superset/ui/input";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	LuEllipsis,
	LuFolderGit2,
	LuGitBranch,
	LuLoaderCircle,
	LuPlus,
	LuPuzzle,
	LuRotateCw,
	LuTrash2,
} from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const QUERY_KEY = ["host-plugins"] as const;

type InstallMode = "git" | "path";

function usePluginsQuery(hostUrl: string | null) {
	return useQuery({
		queryKey: [...QUERY_KEY, hostUrl] as const,
		enabled: Boolean(hostUrl),
		staleTime: 5_000,
		refetchOnWindowFocus: true,
		queryFn: () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).plugins.list.query();
		},
	});
}

function contributionSummary(plugin: PluginSnapshot): string {
	const contributes = plugin.manifest.contributes;
	const parts: string[] = [];
	const push = (count: number | undefined, noun: string) => {
		if (count) parts.push(`${count} ${noun}${count === 1 ? "" : "s"}`);
	};
	push(contributes?.commands?.length, "command");
	push(contributes?.panes?.length, "pane");
	push(contributes?.sidebarTabs?.length, "sidebar tab");
	push(contributes?.events?.length, "event hook");
	return parts.join(" · ");
}

function StatusBadge({ plugin }: { plugin: PluginSnapshot }) {
	const status = plugin.status;
	const styles =
		status === "running"
			? "bg-green-500/10 text-green-600 dark:text-green-400"
			: status === "error"
				? "bg-red-500/10 text-red-600 dark:text-red-400"
				: "bg-muted text-muted-foreground";
	return (
		<span
			data-testid="plugin-status"
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
				styles,
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					status === "running"
						? "bg-green-500"
						: status === "error"
							? "bg-red-500"
							: "bg-muted-foreground/50",
				)}
			/>
			{status === "running"
				? "Running"
				: status === "error"
					? "Error"
					: "Disabled"}
		</span>
	);
}

function PluginRow({
	plugin,
	hostUrl,
	onChanged,
}: {
	plugin: PluginSnapshot;
	hostUrl: string;
	onChanged: () => void;
}) {
	const client = getHostServiceClientByUrl(hostUrl);

	const setEnabled = useMutation({
		mutationFn: (enabled: boolean) =>
			client.plugins.setEnabled.mutate({ id: plugin.id, enabled }),
		onSettled: onChanged,
		onError: (error) => toast.error(error.message),
	});
	const reload = useMutation({
		mutationFn: () => client.plugins.reload.mutate({ id: plugin.id }),
		onSettled: onChanged,
		onSuccess: () => toast.success(`Reloaded ${plugin.name}`),
		onError: (error) => toast.error(error.message),
	});
	const uninstall = useMutation({
		mutationFn: () => client.plugins.uninstall.mutate({ id: plugin.id }),
		onSettled: onChanged,
		onSuccess: () => toast.success(`Uninstalled ${plugin.name}`),
		onError: (error) => toast.error(error.message),
	});

	const summary = contributionSummary(plugin);
	return (
		<div
			data-testid="plugin-row"
			className="flex flex-col gap-1.5 border-b border-border/60 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-fill-hover/30"
		>
			<div className="flex items-center gap-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-fill-hover">
					<LuPuzzle className="size-4 text-muted-foreground" />
				</div>
				<Link
					to="/plugins/$pluginId"
					params={{ pluginId: plugin.id }}
					className="min-w-0 flex-1"
				>
					<div className="flex items-baseline gap-2">
						<span className="truncate text-sm font-medium">{plugin.name}</span>
						<span className="text-xs text-muted-foreground">
							v{plugin.version}
						</span>
						<StatusBadge plugin={plugin} />
					</div>
					<div className="truncate text-xs text-muted-foreground">
						{plugin.description || plugin.id}
					</div>
					<div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground/60">
						{plugin.sourceType === "git" ? (
							<LuGitBranch className="size-3 shrink-0" />
						) : (
							<LuFolderGit2 className="size-3 shrink-0" />
						)}
						<span className="truncate">
							{plugin.sourceType === "link" ? "linked · " : ""}
							{plugin.source}
							{plugin.sourceCommit
								? ` @ ${plugin.sourceCommit.slice(0, 7)}`
								: ""}
							{summary ? ` · ${summary}` : ""}
						</span>
					</div>
				</Link>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						aria-label={`Reload ${plugin.name}`}
						disabled={reload.isPending || !plugin.enabled}
						onClick={() => reload.mutate()}
					>
						{reload.isPending ? (
							<LuLoaderCircle className="size-3.5 animate-spin" />
						) : (
							<LuRotateCw className="size-3.5" />
						)}
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`More actions for ${plugin.name}`}
							>
								<LuEllipsis className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onSelect={() => {
									void navigator.clipboard.writeText(plugin.source);
									toast.success("Source copied");
								}}
							>
								Copy source
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								disabled={uninstall.isPending}
								onSelect={() => uninstall.mutate()}
							>
								<LuTrash2 className="size-3.5" />
								Uninstall
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<Switch
						aria-label={`${plugin.enabled ? "Disable" : "Enable"} ${plugin.name}`}
						checked={plugin.enabled}
						disabled={setEnabled.isPending}
						onCheckedChange={(checked) => setEnabled.mutate(checked)}
					/>
				</div>
			</div>
			{plugin.status === "error" && plugin.error ? (
				<div className="ml-12 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
					{plugin.error}
				</div>
			) : null}
			{plugin.manifest.permissions?.length ? (
				<div className="ml-12 flex flex-wrap gap-1">
					{plugin.manifest.permissions.map((permission) => (
						<span
							key={permission}
							className="rounded bg-fill-hover px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
						>
							{permission}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

function InstallDialog({
	mode,
	hostUrl,
	onClose,
	onInstalled,
}: {
	mode: InstallMode;
	hostUrl: string;
	onClose: () => void;
	onInstalled: () => void;
}) {
	const [source, setSource] = useState("");

	const install = useMutation({
		mutationFn: async (input: string) => {
			const client = getHostServiceClientByUrl(hostUrl);
			const trimmed = input.trim();
			if (mode === "path") {
				return client.plugins.link.mutate({ path: trimmed });
			}
			const url = /^(https?:\/\/|git@)/.test(trimmed)
				? trimmed
				: `https://github.com/${trimmed}.git`;
			return client.plugins.install.mutate({ type: "git", url });
		},
		onSettled: onInstalled,
		onSuccess: (result) => {
			const name = result?.snapshot?.name ?? "plugin";
			toast.success(`Installed ${name}`);
			for (const warning of result?.warnings ?? []) toast.warning(warning);
			onClose();
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<Dialog modal={false} open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mode === "git" ? "Install from git" : "Link a local plugin"}
					</DialogTitle>
					<DialogDescription>
						{mode === "git"
							? "Clones the repository, validates its manifest, and loads it."
							: "Registers a plugin directory in place — edits apply on reload. This is the dev flow."}
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5 rounded-md bg-fill-hover/50 px-3 py-2.5 text-xs text-muted-foreground">
					<p>
						<span className="font-medium text-foreground">
							Plugins may introduce elevated risk.
						</span>{" "}
						They run with full access on this host, the same as your setup
						scripts — install from authors you trust.
					</p>
					<p>
						<span className="font-medium text-foreground">
							You stay in control.
						</span>{" "}
						Review the declared permissions after install, and disable or
						uninstall any plugin at any time.
					</p>
				</div>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						if (source.trim()) install.mutate(source);
					}}
				>
					<Input
						autoFocus
						data-testid="plugin-install-input"
						value={source}
						onChange={(event) => setSource(event.target.value)}
						placeholder={
							mode === "git"
								? "owner/repo or https://…"
								: "/path/to/plugin-directory"
						}
					/>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button
							type="submit"
							data-testid="plugin-install-button"
							disabled={install.isPending || !source.trim()}
						>
							{install.isPending ? (
								<LuLoaderCircle className="size-3.5 animate-spin" />
							) : null}
							{mode === "git" ? "Install" : "Link"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function PluginsPage() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const pluginsQuery = usePluginsQuery(activeHostUrl);
	const [installMode, setInstallMode] = useState<InstallMode | null>(null);

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
	};

	const plugins = pluginsQuery.data ?? [];

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
				<div className="flex items-start justify-between gap-4">
					<div className="flex flex-col gap-1">
						<h1 className="text-lg font-semibold">Plugins</h1>
						<p className="text-sm text-muted-foreground">
							Extend Superset with panes, sidebar tabs, commands, and agent
							automations.
						</p>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button data-testid="plugin-install-menu">
								<LuPlus className="size-3.5" />
								Install plugin
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={() => setInstallMode("git")}>
								<LuGitBranch className="size-3.5" />
								From git URL…
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setInstallMode("path")}>
								<LuFolderGit2 className="size-3.5" />
								From local path…
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{pluginsQuery.isPending ? (
					<div className="flex flex-col gap-3">
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-20 w-full" />
					</div>
				) : plugins.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<LuPuzzle />
							</EmptyMedia>
							<EmptyTitle>No plugins installed</EmptyTitle>
							<EmptyDescription>
								Plugins add panes, sidebar tabs, palette commands, and event
								hooks. Install one from a git repo, or scaffold your own with
								`superset plugin new` — agents can build them too.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div
						data-testid="plugins-list"
						className="flex flex-col rounded-lg border border-border/70 bg-card/40"
					>
						{plugins.map((plugin) =>
							activeHostUrl ? (
								<PluginRow
									key={plugin.id}
									plugin={plugin}
									hostUrl={activeHostUrl}
									onChanged={invalidate}
								/>
							) : null,
						)}
					</div>
				)}
			</div>
			{installMode && activeHostUrl ? (
				<InstallDialog
					mode={installMode}
					hostUrl={activeHostUrl}
					onClose={() => setInstallMode(null)}
					onInstalled={invalidate}
				/>
			) : null}
		</div>
	);
}
