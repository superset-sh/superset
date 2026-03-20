import { cn } from "@superset/ui/utils";

interface SupersetLogoProps {
	className?: string;
}

export function SupersetLogo({ className }: SupersetLogoProps) {
	return (
		<span
			className={cn(
				"text-4xl font-bold tracking-widest text-foreground",
				className,
			)}
			aria-label="K2SO"
		>
			K2SO
		</span>
	);
}
