import { Heading } from "@react-email/components";
import type { ReactNode } from "react";
import { lifecycle } from "../../../lib/lifecycle-theme";

interface DisplayHeadingProps {
	children: ReactNode;
	size?: "lg" | "md" | "sm";
	align?: "center" | "left";
}

const sizes = {
	lg: { fontSize: "32px", lineHeight: "40px", tag: "h1" },
	md: { fontSize: "28px", lineHeight: "36px", tag: "h2" },
	sm: { fontSize: "20px", lineHeight: "28px", tag: "h3" },
} as const;

export function DisplayHeading({
	children,
	size = "lg",
	align = "center",
}: DisplayHeadingProps) {
	const s = sizes[size];
	return (
		<Heading
			as={s.tag}
			style={{
				margin: "0 0 24px 0",
				fontFamily: lifecycle.fonts.sans,
				fontWeight: 600,
				fontSize: s.fontSize,
				lineHeight: s.lineHeight,
				color: lifecycle.colors.ink,
				textAlign: align,
			}}
		>
			{children}
		</Heading>
	);
}
