import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiOutlinePlus } from "react-icons/hi2";

export function InviteMemberButton() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button disabled className="gap-2">
					<HiOutlinePlus className="h-4 w-4" />
					Invite Member
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				<p>Coming soon - invitation system in development</p>
			</TooltipContent>
		</Tooltip>
	);
}
