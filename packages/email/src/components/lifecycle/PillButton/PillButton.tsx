import { Button, Section } from "@react-email/components";
import type { ReactNode } from "react";
import { lifecycle } from "../../../lib/lifecycle-theme";

interface PillButtonProps {
	href: string;
	children: ReactNode;
}

export function PillButton({ href, children }: PillButtonProps) {
	return (
		<Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
			<Button
				href={href}
				style={{
					display: "block",
					width: "100%",
					boxSizing: "border-box",
					backgroundColor: lifecycle.colors.ink,
					color: "#FFFFFF",
					fontFamily: lifecycle.fonts.sans,
					fontSize: "17px",
					lineHeight: "24px",
					padding: "15px 0",
					borderRadius: "12px",
					textAlign: "center",
					textDecoration: "none",
				}}
			>
				{children}
			</Button>
		</Section>
	);
}
