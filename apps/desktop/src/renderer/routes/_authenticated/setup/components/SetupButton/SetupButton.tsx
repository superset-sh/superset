import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "link";

interface SetupButtonProps
	extends Omit<ComponentProps<typeof Button>, "variant" | "size"> {
	variant?: Variant;
}

const VARIANT_MAP = {
	primary: "default",
	secondary: "secondary",
	link: "link",
} as const satisfies Record<Variant, ComponentProps<typeof Button>["variant"]>;

export function SetupButton({
	variant = "primary",
	className,
	type = "button",
	children,
	...rest
}: SetupButtonProps) {
	return (
		<Button
			type={type}
			variant={VARIANT_MAP[variant]}
			size="xs"
			className={cn(variant !== "link" && "w-full", className)}
			{...rest}
		>
			{children}
		</Button>
	);
}
