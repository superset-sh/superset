import { Trans, useLingui } from "@lingui/react/macro";
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
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useAccessibleWorkspaces } from "renderer/routes/_authenticated/_dashboard/workspaces/hooks/useAccessibleWorkspaces";
import { getWorkspaceDisplayName } from "renderer/utils/getWorkspaceDisplayName";
import { useFrameStackStore } from "../../core/frames";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";

const ROW_CLASS =
	"gap-2.5 !py-2.5 text-sm [&_svg]:!size-4 [&_svg]:stroke-[1.5]";

export function WorkspaceListFrame() {
	const { t } = useLingui();
	const query = useCommandPaletteQuery().trim();
	const { all: workspaces } = useAccessibleWorkspaces({
		searchQuery: query,
	});
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const navigate = useNavigate();
	const setOpen = useFrameStackStore((s) => s.setOpen);

	const projectGroups = useMemo(() => {
		const grouped = new Map<
			string | null,
			{ projectName: string; workspaces: typeof workspaces }
		>();

		for (const workspace of workspaces) {
			const group = grouped.get(workspace.projectId);
			if (group) {
				group.workspaces.push(workspace);
			} else {
				grouped.set(workspace.projectId, {
					projectName:
						workspace.projectName ??
						t({
							message: "Sessions",
						}),
					workspaces: [workspace],
				});
			}
		}

		return Array.from(grouped.entries()).map(([projectId, group]) => ({
			projectId,
			...group,
		}));
	}, [workspaces, t]);

	const handleSelect = (workspaceId: string) => {
		void navigateToWorkspace(workspaceId, navigate);
		setOpen(false);
	};

	return (
		<CommandList>
			<CommandEmpty>
				<Trans>No workspaces found.</Trans>
			</CommandEmpty>
			{projectGroups.map((group) => (
				<CommandGroup key={group.projectId} heading={group.projectName}>
					{group.workspaces.map((workspace) => {
						const HostIcon =
							workspace.hostType === "local-device" ? LuLaptop : LuMonitor;
						const displayName = getWorkspaceDisplayName(workspace);
						return (
							<CommandItem
								key={workspace.id}
								value={`workspace v2 ${workspace.id} ${workspace.projectName} ${displayName} ${workspace.branch} ${workspace.hostName}`}
								onSelect={() => handleSelect(workspace.id)}
								className={cn(
									ROW_CLASS,
									currentPath === `/workspace/${workspace.id}` &&
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
