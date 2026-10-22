import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useIsOrganizationAdmin } from "renderer/hooks/useIsOrganizationAdmin";
import type { CatalogPlugin } from "renderer/hooks/usePluginCatalog";
import { AddPluginSourceDialog } from "renderer/routes/_authenticated/components/AddPluginSourceDialog";

interface OrganizationPluginsSectionProps {
	plugins: CatalogPlugin[];
	renderCard: (plugin: CatalogPlugin) => ReactNode;
	showEmpty: boolean;
}

export function OrganizationPluginsSection({
	plugins,
	renderCard,
	showEmpty,
}: OrganizationPluginsSectionProps) {
	const isAdmin = useIsOrganizationAdmin();
	const [isAddOpen, setIsAddOpen] = useState(false);

	if (plugins.length === 0 && !(showEmpty && isAdmin)) return null;

	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-foreground">
					<Trans>Your organization</Trans>
				</h2>
				{isAdmin && (
					<Link
						to="/settings/plugins"
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						<Trans>Manage</Trans>
					</Link>
				)}
			</div>
			{plugins.length > 0 ? (
				<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
					{plugins.map(renderCard)}
				</div>
			) : (
				<div className="flex items-center justify-between gap-4 rounded-lg border border-dashed p-4">
					<p className="text-sm text-muted-foreground">
						<Trans>
							Give your organization its own plugins from a GitHub repository.
							You choose who gets each one.
						</Trans>
					</p>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setIsAddOpen(true)}
					>
						<Trans>Add repository</Trans>
					</Button>
				</div>
			)}
			<AddPluginSourceDialog open={isAddOpen} onOpenChange={setIsAddOpen} />
		</section>
	);
}
