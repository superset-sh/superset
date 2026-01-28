import { Button as ReactEmailButton } from "@react-email/components";
import type { ReactNode } from "react";

interface ButtonProps {
	href: string;
	children: ReactNode;
	variant?: "primary" | "secondary";
}

export function Button({ href, children, variant = "primary" }: ButtonProps) {
	const className =
		variant === "primary"
			? "inline-block rounded-lg bg-primary text-white px-6 py-3 text-base font-semibold no-underline text-center"
			: "inline-block rounded-lg bg-white border border-border text-foreground px-6 py-3 text-base font-semibold no-underline text-center";

	return (
		<ReactEmailButton href={href} className={className}>
			{children}
		</ReactEmailButton>
	);
}
