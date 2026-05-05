import { cn } from "@superset/ui/utils";

interface SupersetIconProps {
	className?: string;
}

export function SupersetIcon({ className }: SupersetIconProps) {
	return (
		<svg
			viewBox="0 0 64 60"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={cn("text-foreground", className)}
			aria-label="Superset"
		>
			<title>Superset</title>
			<path
				d="M20 0H30V10H20V20H10V30V40H20V50H30V60H20H10V50V40H0V30V20H10V10V0H20Z"
				fill="currentColor"
			/>
			<path
				d="M44 0H34V10H44V20H54V30V40H44V50H34V60H44H54V50V40H64V30V20H54V10V0H44Z"
				fill="currentColor"
			/>
		</svg>
	);
}
