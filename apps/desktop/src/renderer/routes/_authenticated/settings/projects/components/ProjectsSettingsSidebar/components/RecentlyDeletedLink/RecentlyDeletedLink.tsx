import { Trans } from "@lingui/react/macro";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { HiOutlineTrash } from "react-icons/hi2";
import { settingsListItemClass } from "../../../../../components/SettingsListSidebar";
import { useDeletedProjects } from "../../../../hooks/useDeletedProjects";

export function RecentlyDeletedLink() {
	const { deleted } = useDeletedProjects();
	const matchRoute = useMatchRoute();
	if (deleted.length === 0) return null;
	const isActive = !!matchRoute({ to: "/settings/projects/deleted" });
	return (
		<div className="pt-4">
			<Link
				to="/settings/projects/deleted"
				className={settingsListItemClass(
					isActive,
					"gap-2 text-muted-foreground",
				)}
			>
				<HiOutlineTrash className="size-4 shrink-0" />
				<span className="flex-1 truncate">
					<Trans>Recently deleted</Trans>
				</span>
				<span className="text-xs tabular-nums">{deleted.length}</span>
			</Link>
		</div>
	);
}
