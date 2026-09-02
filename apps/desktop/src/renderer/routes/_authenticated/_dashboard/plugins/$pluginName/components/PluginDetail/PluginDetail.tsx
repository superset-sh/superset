import { Trans, useLingui } from "@lingui/react/macro";
import {
	getMatchingExternalServers,
	type PluginCatalogEntry,
	SUPERSET_MANAGED_SKILLS,
} from "@superset/shared/plugins";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Switch } from "@superset/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuArrowLeft, LuTrash2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PluginIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginIcon";
import { PluginKindBadges } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginKindBadges";
import { SkillIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/SkillIcon";
import { usePluginMutations } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginMutations";

const SKILL_DESCRIPTIONS = new Map<string, string>(
	SUPERSET_MANAGED_SKILLS.map((skill) => [skill.name, skill.description]),
);

export function PluginDetail({ plugin }: { plugin: PluginCatalogEntry }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { data: installed } = electronTrpc.plugins.listInstalled.useQuery();
	const { data: externalServers } =
		electronTrpc.plugins.listExternalServers.useQuery();
	const { install, uninstall, setEnabled, isBusy } = usePluginMutations();

	const record = useMemo(
		() => (installed ?? []).find((entry) => entry.name === plugin.name),
		[installed, plugin.name],
	);
	const detectedServers = useMemo(
		() => getMatchingExternalServers(plugin, externalServers ?? []),
		[plugin, externalServers],
	);
	// One state: an install record OR the user's own config both count as
	// installed (having it = installed).
	const isInstalled = record !== undefined || detectedServers.length > 0;
	const isPluginEnabled = record?.enabled !== false;

	return (
		<div className="mx-auto w-full max-w-3xl px-6 pb-16">
			<Button
				variant="ghost"
				size="sm"
				className="mb-6 -ml-2 text-muted-foreground"
				onClick={() => navigate({ to: "/plugins" })}
			>
				<LuArrowLeft className="size-4" />
				<Trans>Plugins</Trans>
			</Button>

			<div className="flex items-start gap-4">
				<PluginIcon pluginName={plugin.name} className="size-14" />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h1 className="text-xl font-semibold text-foreground">
							{plugin.interface.displayName}
						</h1>
						<PluginKindBadges plugin={plugin} />
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						{plugin.description}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						v{plugin.version} · {plugin.interface.category}
						{record ? (
							<>
								{" · "}
								<Trans>installed {record.installedAt.slice(0, 10)}</Trans>
							</>
						) : (
							""
						)}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{isInstalled ? (
						<>
							<Switch
								checked={isPluginEnabled}
								disabled={isBusy}
								aria-label={t({
									message: `${plugin.interface.displayName} enabled`,
								})}
								onCheckedChange={(checked) => setEnabled(plugin.name, checked)}
							/>
							<Button
								variant="outline"
								size="sm"
								className="text-destructive"
								disabled={isBusy}
								onClick={() => uninstall(plugin.name)}
							>
								<LuTrash2 className="size-4" />
								<Trans>Uninstall</Trans>
							</Button>
						</>
					) : (
						<Button
							size="sm"
							className="rounded-full"
							disabled={isBusy}
							onClick={() => install(plugin.name)}
						>
							<Trans>Install</Trans>
						</Button>
					)}
				</div>
			</div>

			{isInstalled && (
				<p className="mt-3 text-xs text-muted-foreground">
					{!isPluginEnabled ? (
						<Trans>
							Disabled — kept installed, but Superset writes nothing into your
							agent configs.
						</Trans>
					) : record ? (
						<Trans>
							Enabled — servers are written into your agent configs.
						</Trans>
					) : (
						<Trans>Provided by entries in your own agent config.</Trans>
					)}{" "}
					<Trans>Changes take effect in new agent sessions.</Trans>
				</p>
			)}
			{detectedServers.length > 0 && (
				<section className="mt-8 flex flex-col gap-3">
					<h2 className="text-sm font-semibold text-foreground">
						<Trans>Detected in your agent configs</Trans>
					</h2>
					<div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
						{detectedServers.map((server) => (
							<div key={server.name} className="flex items-center gap-3 p-3">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
										{server.name}
										{server.source && (
											<span className="shrink-0 text-[10px] font-medium text-muted-foreground">
												{server.source}
											</span>
										)}
									</div>
									<p className="truncate font-mono text-xs text-muted-foreground">
										{server.url ??
											[server.command, ...(server.args ?? [])].join(" ")}
									</p>
								</div>
							</div>
						))}
					</div>
					<p className="text-xs text-muted-foreground">
						<Trans>
							You added these yourself — Superset never touches them, and never
							writes duplicates of servers you already have.
						</Trans>
					</p>
				</section>
			)}

			<section className="mt-8 flex flex-col gap-3">
				<h2 className="text-sm font-semibold text-foreground">
					<Trans>MCP servers</Trans>
				</h2>
				<div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
					{Object.entries(plugin.mcpServers).map(([name, config]) => (
						<div key={name} className="flex items-center gap-3 p-3">
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
									{name}
									<Badge
										variant="outline"
										className="h-4 shrink-0 rounded px-1 text-[9px] font-medium tracking-wide text-muted-foreground uppercase"
									>
										{"url" in config ? <Trans>MCP</Trans> : <Trans>CLI</Trans>}
									</Badge>
								</div>
								<p className="truncate font-mono text-xs text-muted-foreground">
									{"url" in config
										? config.url
										: [config.command, ...(config.args ?? [])].join(" ")}
								</p>
							</div>
						</div>
					))}
				</div>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Remote servers sign you in the first time an agent uses them.
					</Trans>
				</p>
			</section>

			{plugin.skills && plugin.skills.length > 0 && (
				<section className="mt-8 flex flex-col gap-3">
					<h2 className="text-sm font-semibold text-foreground">
						<Trans>Skills</Trans>
					</h2>
					<div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
						{plugin.skills.map((name) => (
							<div key={name} className="flex items-center gap-3 p-3">
								<SkillIcon skillName={name} className="size-7" />
								<div className="min-w-0 flex-1">
									<div className="text-sm font-medium text-foreground">
										{name}
									</div>
									{SKILL_DESCRIPTIONS.has(name) && (
										<p className="truncate text-xs text-muted-foreground">
											{SKILL_DESCRIPTIONS.get(name)}
										</p>
									)}
								</div>
							</div>
						))}
					</div>
				</section>
			)}
		</div>
	);
}
