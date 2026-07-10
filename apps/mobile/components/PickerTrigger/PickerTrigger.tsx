import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PickerTrigger({ className, ...props }: ButtonProps) {
	return (
		<Button
			className={cn(
				"h-auto flex-row items-center gap-1 rounded-full px-2 py-1",
				className,
			)}
			size="sm"
			variant="ghost"
			{...props}
		/>
	);
}
