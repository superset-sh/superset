import { Trans } from "@lingui/react/macro";
import type { SelectUser } from "@superset/db/schema";
import { Avatar } from "@superset/ui/atoms/Avatar";
import type { ReactNode } from "react";
import { HiOutlineUserCircle, HiOutlineUserPlus } from "react-icons/hi2";
import { useInviteMember } from "renderer/routes/_authenticated/hooks/useInviteMember";

interface MenuItemProps {
	children: ReactNode;
	onSelect: () => void;
	className?: string;
}

type AssigneeOption = Pick<SelectUser, "id" | "name" | "email" | "image">;

interface AssigneeMenuItemsProps {
	users: AssigneeOption[];
	currentAssigneeId: string | null;
	onSelect: (userId: string | null) => void;
	MenuItem: React.ComponentType<MenuItemProps>;
	MenuSeparator: React.ComponentType;
}

export function AssigneeMenuItems({
	users,
	currentAssigneeId,
	onSelect,
	MenuItem,
	MenuSeparator,
}: AssigneeMenuItemsProps) {
	const inviteMember = useInviteMember();

	return (
		<>
			<div className="max-h-64 overflow-y-auto">
				<MenuItem
					onSelect={() => onSelect(null)}
					className="flex items-center gap-2"
				>
					<HiOutlineUserCircle className="size-5 text-muted-foreground shrink-0" />
					<span className="text-sm">
						<Trans>No assignee</Trans>
					</span>
					{!currentAssigneeId && (
						<span className="ml-auto text-xs text-muted-foreground">✓</span>
					)}
				</MenuItem>

				{users.map((user) => {
					const isSelected = user.id === currentAssigneeId;
					return (
						<MenuItem
							key={user.id}
							onSelect={() => onSelect(user.id)}
							className="flex items-center gap-2"
						>
							<Avatar size="xs" fullName={user.name} image={user.image} />
							<div className="flex flex-col">
								<span className="text-sm">{user.name}</span>
								<span className="text-xs text-muted-foreground">
									{user.email}
								</span>
							</div>
							{isSelected && (
								<span className="ml-auto text-xs text-muted-foreground">✓</span>
							)}
						</MenuItem>
					);
				})}
			</div>

			{inviteMember && (
				<>
					<MenuSeparator />
					<MenuItem onSelect={inviteMember} className="flex items-center gap-2">
						<HiOutlineUserPlus className="size-5 text-muted-foreground shrink-0" />
						<span className="text-sm">
							<Trans>Invite member</Trans>
						</span>
					</MenuItem>
				</>
			)}
		</>
	);
}
