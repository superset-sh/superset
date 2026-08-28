import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";

function pillClass(isActive: boolean) {
	return cn(
		"rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
		isActive
			? "bg-accent text-accent-foreground"
			: "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
	);
}

/** Pill toggle between the Usage sections (workspaces-header style). */
export function UsageSectionToggle() {
	const { t } = useLingui();
	const matchRoute = useMatchRoute();
	const onResources = matchRoute({ to: "/settings/usage/resources" }) !== false;

	return (
		<nav
			aria-label={t({
				id: "settings.usage.sectionToggle.ariaLabel",
				message: "Usage sections",
			})}
			className="flex items-center gap-2"
		>
			<Link
				to="/settings/usage"
				className={pillClass(!onResources)}
				aria-current={onResources ? undefined : "page"}
			>
				<Trans id="settings.usage.sectionToggle.tokenUsage">Token usage</Trans>
			</Link>
			<Link
				to="/settings/usage/resources"
				className={pillClass(onResources)}
				aria-current={onResources ? "page" : undefined}
			>
				<Trans id="settings.usage.sectionToggle.machineResources">
					Machine resources
				</Trans>
			</Link>
		</nav>
	);
}
