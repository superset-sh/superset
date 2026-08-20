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
			? "inline-block rounded-md bg-primary text-white px-5 py-3 text-[14px] font-medium no-underline text-center"
			: "inline-block rounded-md bg-white border border-solid border-border text-foreground px-5 py-3 text-[14px] font-medium no-underline text-center";

	return (
		<ReactEmailButton href={href} className={className}>
			{children}
		</ReactEmailButton>
	);
}
