import { Section } from "@react-email/components";
import type { ReactNode } from "react";
import { lifecycle } from "../../../lib/lifecycle-theme";

interface BandSectionProps {
	children: ReactNode;
	tone?: "band" | "paper";
}

export function BandSection({ children, tone = "band" }: BandSectionProps) {
	return (
		<Section
			style={{
				backgroundColor:
					tone === "band" ? lifecycle.colors.band : lifecycle.colors.paper,
				padding: "48px 48px 40px 48px",
			}}
		>
			{children}
		</Section>
	);
}
