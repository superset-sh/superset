import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Plus } from "lucide-react";
import type React from "react";

interface AddTaskButtonProps {
	onClick: (mode?: "list" | "new") => void;
}

export const AddTaskButton: React.FC<AddTaskButtonProps> = ({ onClick }) => {
	const handleClick = () => {
		onClick("new");
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="ghost" size="icon-sm" className="ml-1" onClick={handleClick}>
					<Plus size={18} />
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<p>New task</p>
			</TooltipContent>
		</Tooltip>
	);
};
