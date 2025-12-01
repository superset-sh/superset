interface JoinWaitlistButtonProps {
	onClick: () => void;
	size?: "sm" | "md";
	className?: string;
}

export function JoinWaitlistButton({
	onClick,
	size = "md",
	className = "",
}: JoinWaitlistButtonProps) {
	const sizeClasses =
		size === "sm" ? "px-4 py-2 text-sm" : "px-6 py-3 text-base";

	return (
		<button
			type="button"
			onClick={onClick}
			className={`bg-stone-50 text-neutral-800 ${sizeClasses} rounded-[5px] font-medium hover:bg-stone-100 transition-colors duration-150 ${className}`}
		>
			Join waitlist
		</button>
	);
}
