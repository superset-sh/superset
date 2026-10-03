import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	LuArrowLeft,
	LuArrowUp,
	LuEllipsis,
	LuExternalLink,
	LuPlus,
	LuPower,
	LuSparkles,
	LuTrash2,
} from "react-icons/lu";
import {
	ConnectConnectorDialog,
	ConnectorRow,
} from "renderer/components/ConnectorSection";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { PluginIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginIcon";
import { SkillIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/SkillIcon";
import type { CatalogPlugin } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginCatalog";
import { usePluginMutations } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginMutations";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { ConnectedAccounts } from "./components/ConnectedAccounts";
import { InfoRow } from "./components/InfoRow";
import { SectionHeader } from "./components/SectionHeader";

export function PluginDetail({ plugin }: { plugin: CatalogPlugin }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { install, uninstall, setEnabled, update, isBusy } =
		usePluginMutations();
	const openNewWorkspace = useOpenNewWorkspace();

	const [isConnectOpen, setIsConnectOpen] = useState(false);

	// Seeded before the navigation, not after: the draft store is only reset on
	// close, so the create surface mounts with this already in the composer.
	const tryNow = useCallback(() => {
		useNewWorkspaceDraftStore.getState().updateDraft({
			prompt: t({
				message: `Use the ${plugin.interface.displayName} plugin to `,
			}),
		});
		openNewWorkspace();
	}, [openNewWorkspace, plugin.interface.displayName, t]);

	const wasInstalled = useRef(plugin.installed);
	const needsConnection = Boolean(
		plugin.connector && plugin.connections.length === 0,
	);

	useEffect(() => {
		if (plugin.installed && !wasInstalled.current && needsConnection)
			setIsConnectOpen(true);
		wasInstalled.current = plugin.installed;
	}, [plugin.installed, needsConnection]);

	const skills = plugin.pluginSkills ?? [];

	return (
		<div className="mx-auto w-full max-w-3xl px-6 pt-4 pb-16">
			<Button
				variant="ghost"
				size="sm"
				className="mb-6 -ml-2 text-muted-foreground"
				onClick={() => navigate({ to: "/plugins" })}
			>
				<LuArrowLeft className="size-4" />
				<Trans>Plugins</Trans>
			</Button>

			<div className="flex flex-col gap-4">
				<div className="w-fit rounded-xl border border-border/60 p-2">
					<PluginIcon pluginName={plugin.name} className="size-12" />
				</div>

				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">
							{plugin.interface.displayName}
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							{plugin.description}
						</p>
					</div>

					<div className="flex shrink-0 items-center gap-2">
						{plugin.installed && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 text-muted-foreground"
										aria-label={t({
											message: `More ${plugin.interface.displayName} actions`,
										})}
									>
										<LuEllipsis className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										disabled={isBusy}
										onSelect={() => setEnabled(plugin.name, !plugin.enabled)}
									>
										<LuPower className="size-3.5 shrink-0 text-current" />
										{plugin.enabled ? (
											<Trans>Disable</Trans>
										) : (
											<Trans>Enable</Trans>
										)}
									</DropdownMenuItem>
									{plugin.updateAvailable && (
										<DropdownMenuItem
											disabled={isBusy}
											onSelect={() => void update(plugin.name)}
										>
											<LuArrowUp className="size-3.5 shrink-0 text-current" />
											<Trans>Update</Trans>
										</DropdownMenuItem>
									)}
									<DropdownMenuItem
										variant="destructive"
										disabled={isBusy}
										onSelect={() => uninstall(plugin.name)}
									>
										<LuTrash2 className="size-3.5 shrink-0 text-current" />
										<Trans>Remove</Trans>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}

						{!plugin.installed && (
							<Button
								size="sm"
								disabled={isBusy}
								onClick={() => void install(plugin.name)}
							>
								<LuPlus className="size-4" />
								<Trans>Install plugin</Trans>
							</Button>
						)}
						{plugin.installed && (
							<Button size="sm" onClick={tryNow}>
								<LuSparkles className="size-4" />
								<Trans>Try now</Trans>
							</Button>
						)}
					</div>
				</div>
			</div>

			{plugin.connector && (
				<>
					<section className="mt-10">
						<SectionHeader label={<Trans>Apps</Trans>} count={1} />
						<div className="divide-y divide-border/40">
							<ConnectorRow
								slug={plugin.connector}
								description={plugin.description}
								icon={
									<PluginIcon pluginName={plugin.name} className="size-7" />
								}
								canConnect={plugin.installed}
								onConnect={() => setIsConnectOpen(true)}
							/>
						</div>
					</section>

					<section className="mt-10">
						<SectionHeader label={<Trans>Connected accounts</Trans>} />
						<div className="pt-4">
							<ConnectedAccounts
								slug={plugin.connector}
								canConnect={plugin.installed}
								onConnect={() => setIsConnectOpen(true)}
							/>
						</div>
					</section>
				</>
			)}

			{skills.length > 0 && (
				<section className="mt-10">
					<SectionHeader label={<Trans>Skills</Trans>} count={skills.length} />
					<div className="divide-y divide-border/40">
						{skills.map((skill) => (
							<div key={skill.name} className="flex items-center gap-3 py-3.5">
								<SkillIcon skillName={skill.name} className="size-7" />
								<div className="min-w-0 flex-1">
									<div className="text-sm font-medium text-foreground">
										{skill.name}
									</div>
									<p className="truncate text-xs text-muted-foreground">
										{skill.description}
									</p>
								</div>
							</div>
						))}
					</div>
				</section>
			)}

			<section className="mt-10">
				<SectionHeader label={<Trans>Information</Trans>} />
				<div className="pt-1">
					{plugin.author && (
						<InfoRow label={<Trans>Developer</Trans>}>{plugin.author}</InfoRow>
					)}
					<InfoRow label={<Trans>Category</Trans>}>
						{plugin.interface.category}
					</InfoRow>
					{plugin.connector ? (
						<InfoRow label={<Trans>Connector</Trans>}>
							{plugin.connector}
						</InfoRow>
					) : null}
					<InfoRow label={<Trans>Version</Trans>}>
						{plugin.version}
						{plugin.updateAvailable && plugin.latestVersion
							? ` → ${plugin.latestVersion}`
							: ""}
					</InfoRow>
					<InfoRow label={<Trans>Marketplace</Trans>}>
						{plugin.marketplace}
					</InfoRow>
					{plugin.license && (
						<InfoRow label={<Trans>License</Trans>}>{plugin.license}</InfoRow>
					)}
					{plugin.homepage && (
						<InfoRow label={<Trans>Website</Trans>}>
							<a
								href={plugin.homepage}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
								aria-label={t({
									message: `Open ${plugin.interface.displayName} website`,
								})}
							>
								<LuExternalLink className="size-4" />
							</a>
						</InfoRow>
					)}
				</div>
			</section>

			<ConnectConnectorDialog
				slug={isConnectOpen ? plugin.connector : null}
				icon={<PluginIcon pluginName={plugin.name} className="size-12" />}
				author={plugin.author}
				onOpenChange={(open) => !open && setIsConnectOpen(false)}
			/>
		</div>
	);
}
