import { Button as ReactEmailButton } from "@react-email/components";
import type { ReactNode } from "react";

interface ButtonProps {
	href: string;
	children: ReactNode;
	variant?: "primary" | "secondary";
}

export function Button({ href, children, variant = "primary" }: ButtonProps) {
	const buttonStyle =
		variant === "primary" ? primaryButtonStyle : secondaryButtonStyle;

	return (
		<ReactEmailButton href={href} style={buttonStyle}>
			{children}
		</ReactEmailButton>
	);
}

const baseButtonStyle = {
	borderRadius: "8px",
	display: "inline-block",
	fontSize: "16px",
	fontWeight: "600" as const,
	lineHeight: "1",
	padding: "12px 24px",
	textAlign: "center" as const,
	textDecoration: "none",
	cursor: "pointer",
};

const primaryButtonStyle = {
	...baseButtonStyle,
	backgroundColor: "#966dd5",
	color: "#ffffff",
};

const secondaryButtonStyle = {
	...baseButtonStyle,
	backgroundColor: "#ffffff",
	border: "1px solid #e8e8ea",
	color: "#000000",
};
