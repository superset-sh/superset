import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { cn } from "@superset/ui/utils";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { CgLaptop } from "react-icons/cg";
import { LuLaptop, LuMonitor } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useFrameStackStore } from "../../core/frames";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";

const ROW_CLASS =
	"gap-2.5 !py-2.5 text-sm [&_svg]:!size-4 [&_svg]:stroke-[1.5]";

export function WorkspaceListFrame() {
	const rawQuery = useCommandPaletteQuery();
	const query = rawQuery.trim();
	return <V2WorkspaceList query={query} />;
}

function V2WorkspaceList({ query }: { query: string }) {
	const { all: workspaces } = useAccessibleV2Workspaces({
		searchQuery: query,
	});
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const navigate = useNavigate();
	const setOpen = useFrameStackStore((s) => s.setOpen);

	const projectGroups = useMemo(() => {
		const grouped = new Map<
			string,
			{ projectName: string; workspaces: typeof workspaces }
		>();

		for (const workspace of workspaces) {
			const group = grouped.get(workspace.projectId);
			if (group) {
				group.workspaces.push(workspace);
			} else {
				grouped.set(workspace.projectId, {
					projectName: workspace.projectName,
					workspaces: [workspace],
				});
			}
		}

		return Array.from(grouped.entries()).map(([projectId, group]) => ({
			projectId,
			...group,
		}));
	}, [workspaces]);

	const handleSelect = (workspaceId: string) => {
		void navigateToV2Workspace(workspaceId, navigate);
		setOpen(false);
	};

	return (
		<CommandList>
			<CommandEmpty>No workspaces found.</CommandEmpty>
			{projectGroups.map((group) => (
				<CommandGroup key={group.projectId} heading={group.projectName}>
					{group.workspaces.map((workspace) => {
						const HostIcon =
							workspace.hostType === "local-device" ? LuLaptop : LuMonitor;
						const displayName = workspace.name || workspace.branch;
						return (
							<CommandItem
								key={workspace.id}
								value={`workspace v2 ${workspace.id} ${workspace.projectName} ${displayName} ${workspace.branch} ${workspace.hostName}`}
								onSelect={() => handleSelect(workspace.id)}
								className={cn(
									ROW_CLASS,
									currentPath === `/v2-workspace/${workspace.id}` &&
										"bg-accent/50",
								)}
							>
								<span className="flex min-w-0 flex-1 items-center gap-1.5">
									<span className="min-w-0 truncate font-normal">
										{displayName}
									</span>
									<CgLaptop className="!size-3.5 shrink-0 text-muted-foreground" />
								</span>
								<span className="flex min-w-0 max-w-44 items-center gap-1 text-muted-foreground text-xs">
									<HostIcon className="!size-3 shrink-0" />
									<span className="truncate">{workspace.hostName}</span>
								</span>
							</CommandItem>
						);
					})}
				</CommandGroup>
			))}
		</CommandList>
	);
}
