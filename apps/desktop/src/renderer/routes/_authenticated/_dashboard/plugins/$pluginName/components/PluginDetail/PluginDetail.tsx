import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Switch } from "@superset/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import { LuArrowLeft, LuArrowUp, LuExternalLink } from "react-icons/lu";
import { PluginIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginIcon";
import { SkillIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/SkillIcon";
import type { CatalogPlugin } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginCatalog";
import { usePluginMutations } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginMutations";
import { InfoRow } from "./components/InfoRow";
import { PluginConnections } from "./components/PluginConnections";
import { SectionHeader } from "./components/SectionHeader";
import { useAuthMethodLabel } from "./hooks/useAuthMethodLabel";

export function PluginDetail({ plugin }: { plugin: CatalogPlugin }) {
	const { t } = useLingui();
	const authMethodLabel = useAuthMethodLabel();
	const navigate = useNavigate();
	const { add, uninstall, setEnabled, update, isBusy } = usePluginMutations();

	const skills = plugin.pluginSkills ?? [];

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

					<div className="flex shrink-0 items-center gap-3">
						{plugin.updateAvailable && (
							<Button
								size="sm"
								variant="outline"
								disabled={isBusy}
								onClick={() => void update(plugin.name)}
							>
								<LuArrowUp className="size-4" />
								<Trans>Update</Trans>
							</Button>
						)}
						{plugin.installed && (
							<Switch
								checked={plugin.enabled}
								disabled={isBusy}
								aria-label={t({
									message: `${plugin.interface.displayName} enabled`,
								})}
								onCheckedChange={(checked) => setEnabled(plugin.name, checked)}
							/>
						)}
					</div>
				</div>
			</div>

			<PluginConnections
				pluginName={plugin.name}
				displayName={plugin.interface.displayName}
				auth={plugin.auth}
				installed={plugin.installed}
				onAdd={() => add(plugin.name)}
				onRemove={() => uninstall(plugin.name)}
				isBusy={isBusy}
			/>

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
					{plugin.auth?.length ? (
						<InfoRow label={<Trans>Authentication</Trans>}>
							{plugin.auth
								.map((method) => authMethodLabel(method.type))
								.join(", ")}
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
		</div>
	);
}
