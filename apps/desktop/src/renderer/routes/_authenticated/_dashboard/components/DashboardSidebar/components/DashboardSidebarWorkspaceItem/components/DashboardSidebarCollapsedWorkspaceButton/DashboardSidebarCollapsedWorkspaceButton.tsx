import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { GoGitBranch } from "react-icons/go";

interface DashboardSidebarCollapsedWorkspaceButtonProps
	extends ComponentPropsWithoutRef<"button"> {
	isActive: boolean;
	isDragging: boolean;
	setDragHandle: (node: HTMLButtonElement | null) => void;
}

export const DashboardSidebarCollapsedWorkspaceButton = forwardRef<
	HTMLButtonElement,
	DashboardSidebarCollapsedWorkspaceButtonProps
>(({ isActive, isDragging, setDragHandle, className, ...props }, ref) => {
	return (
		<button
			type="button"
			ref={(node) => {
				setDragHandle(node);
				if (typeof ref === "function") {
					ref(node);
				} else if (ref) {
					ref.current = node;
				}
			}}
			className={cn(
				"relative flex items-center justify-center size-8 rounded-md",
				"hover:bg-muted/50 transition-colors cursor-pointer",
				isActive && "bg-muted",
				isDragging && "opacity-30",
				className,
			)}
			{...props}
		>
			<GoGitBranch
				className={cn(
					"size-4",
					isActive ? "text-foreground" : "text-muted-foreground",
				)}
			/>
		</button>
	);
});
