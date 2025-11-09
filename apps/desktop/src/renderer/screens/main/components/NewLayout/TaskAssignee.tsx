import type React from "react";
import { Avatar } from "./Avatar";

interface TaskAssigneeProps {
	userName: string;
	userAvatarUrl: string | null;
	agentName?: string;
}

export const TaskAssignee: React.FC<TaskAssigneeProps> = ({
	userName,
	userAvatarUrl,
	agentName = "Claude",
}) => {
	return (
		<div className="flex flex-col items-start gap-0.5">
			{/* User row - left justified */}
			<div className="flex items-center gap-1.5">
				<Avatar imageUrl={userAvatarUrl} name={userName} size={14} />
				<span className="text-xs text-neutral-200">{userName}</span>
			</div>

			{/* Plus symbol - centered */}
			<div className="w-full flex justify-center">
				<span className="text-xs text-neutral-500">+</span>
			</div>

			{/* Agent row - left justified */}
			<div className="flex items-center gap-1.5">
				<img
					width="14"
					height="14"
					alt="Claude"
					src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Claude_AI_symbol.svg"
				/>
				<span className="text-xs text-neutral-300">{agentName}</span>
			</div>
		</div>
	);
};
