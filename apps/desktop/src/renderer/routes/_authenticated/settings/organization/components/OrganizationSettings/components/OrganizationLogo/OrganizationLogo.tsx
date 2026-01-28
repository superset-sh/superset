interface OrganizationLogoProps {
	logo: string | null | undefined;
	name: string | undefined;
	size?: "sm" | "md";
}

export function OrganizationLogo({
	logo,
	name,
	size = "md",
}: OrganizationLogoProps) {
	const sizeClasses = size === "sm" ? "w-6 h-6" : "w-8 h-8";
	const textSize = size === "sm" ? "text-xs" : "text-sm";

	if (logo) {
		return (
			<img
				src={logo}
				alt="Organization logo"
				className={`${sizeClasses} rounded object-cover`}
			/>
		);
	}

	return (
		<div
			className={`${sizeClasses} rounded bg-muted flex items-center justify-center`}
		>
			<span className={`${textSize} font-medium text-muted-foreground`}>
				{name?.charAt(0).toUpperCase() ?? "?"}
			</span>
		</div>
	);
}
