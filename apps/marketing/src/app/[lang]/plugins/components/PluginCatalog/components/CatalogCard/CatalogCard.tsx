import { Trans, useLingui } from "@lingui/react/macro";
import { Check } from "lucide-react";
import type { CatalogPlugin } from "../../../../constants";
import { PluginIcon } from "../../../PluginIcon";

export function CatalogCard({ plugin }: { plugin: CatalogPlugin }) {
	const { t } = useLingui();

	return (
		<li className="flex min-w-0 items-center gap-3 rounded-lg p-2.5">
			<PluginIcon name={plugin.name} />
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-1.5 font-medium text-foreground text-sm">
					<span className="truncate">{plugin.displayName}</span>
					{plugin.installed && (
						<Check
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
					)}
				</p>
				<p className="truncate text-muted-foreground text-xs">
					{t(plugin.description)}
				</p>
			</div>
			{!plugin.installed && (
				<span className="shrink-0 rounded-md border border-border px-2.5 py-1 text-foreground text-xs">
					<Trans>Install</Trans>
				</span>
			)}
		</li>
	);
}
