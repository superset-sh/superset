import { cn } from "@superset/ui/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "link";

interface SetupButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	children: ReactNode;
}

const VARIANT_STYLES: Record<Variant, string> = {
	primary:
		"relative h-[28px] w-full rounded-[4px] border border-[rgba(255,136,70,0.8)] bg-[rgba(255,91,0,0.8)] px-2 text-[12px] font-medium text-[#eae8e6] shadow-[inset_0_1px_6.9px_0_rgba(255,255,255,0.14)] transition-colors hover:bg-[rgba(255,91,0,0.95)] disabled:opacity-60",
	secondary:
		"relative h-[28px] w-full rounded-[4px] border border-[#2a2827] bg-[#201e1c] px-2 text-[12px] font-medium text-[#eae8e6] shadow-[inset_0_1px_6.9px_0_rgba(255,255,255,0.1)] transition-colors hover:bg-[#2a2827] disabled:opacity-60",
	link: "text-[12px] font-medium text-[#a8a5a3] underline-offset-4 transition-colors hover:text-[#eae8e6] hover:underline",
};

export function SetupButton({
	variant = "primary",
	className,
	children,
	type = "button",
	...rest
}: SetupButtonProps) {
	return (
		<button
			type={type}
			className={cn(VARIANT_STYLES[variant], className)}
			{...rest}
		>
			{children}
		</button>
	);
}
