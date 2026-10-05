import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiOutlinePlus, HiOutlineUserPlus } from "react-icons/hi2";
import { useInviteMember } from "renderer/routes/_authenticated/hooks/useInviteMember";

export interface CandidateRow {
	userId: string;
	name: string;
	email: string;
}

interface AddMemberDropdownProps {
	candidates: CandidateRow[];
	onPick: (candidate: CandidateRow) => void;
}

export function AddMemberDropdown({
	candidates,
	onPick,
}: AddMemberDropdownProps) {
	const inviteMember = useInviteMember();

	if (candidates.length === 0 && !inviteMember) {
		return (
			<Button size="sm" variant="outline" disabled>
				<HiOutlinePlus className="h-4 w-4 mr-1" />
				<Trans>Add member</Trans>
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="sm" variant="outline">
					<HiOutlinePlus className="h-4 w-4 mr-1" />
					<Trans>Add member</Trans>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				{candidates.map((candidate) => (
					<DropdownMenuItem
						key={candidate.userId}
						onSelect={() => onPick(candidate)}
					>
						<div className="flex flex-col">
							<span className="text-sm">{candidate.name}</span>
							<span className="text-xs text-muted-foreground">
								{candidate.email}
							</span>
						</div>
					</DropdownMenuItem>
				))}
				{inviteMember && (
					<>
						{candidates.length > 0 && <DropdownMenuSeparator />}
						<DropdownMenuItem onSelect={inviteMember}>
							<HiOutlineUserPlus className="size-4 text-muted-foreground" />
							<Trans>Invite member</Trans>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
