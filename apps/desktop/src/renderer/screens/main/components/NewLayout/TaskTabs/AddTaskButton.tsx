import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Plus } from "lucide-react";
import type React from "react";

interface AddTaskButtonProps {
	onClick: () => void;
}

export const AddTaskButton: React.FC<AddTaskButtonProps> = ({ onClick }) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<Button variant="ghost" size="icon-sm" className="ml-1" onClick={onClick}>
				<Plus size={18} />
			</Button>
		</TooltipTrigger>
		<TooltipContent side="bottom">
			<p>New task</p>
		</TooltipContent>
	</Tooltip>
);
