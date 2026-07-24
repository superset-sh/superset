import { Heading } from "@react-email/components";
import type { ReactNode } from "react";
import { lifecycle } from "../../../lib/lifecycle-theme";

interface DisplayHeadingProps {
	children: ReactNode;
	size?: "lg" | "md" | "sm";
	align?: "center" | "left";
}

const sizes = {
	lg: { fontSize: "30px", lineHeight: "38px", tag: "h1" },
	md: { fontSize: "36px", lineHeight: "44px", tag: "h2" },
	sm: { fontSize: "26px", lineHeight: "34px", tag: "h3" },
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
				fontFamily: lifecycle.fonts.serif,
				fontWeight: 400,
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
