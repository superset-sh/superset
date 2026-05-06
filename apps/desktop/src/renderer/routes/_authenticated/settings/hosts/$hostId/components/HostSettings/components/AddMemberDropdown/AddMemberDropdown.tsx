import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiOutlinePlus } from "react-icons/hi2";

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
	if (candidates.length === 0) {
		return (
			<Button size="sm" variant="outline" disabled>
				<HiOutlinePlus className="h-4 w-4 mr-1" />
				Add member
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="sm" variant="outline">
					<HiOutlinePlus className="h-4 w-4 mr-1" />
					Add member
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
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
