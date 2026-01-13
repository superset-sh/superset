import {
	Body,
	Container,
	Head,
	Html,
	Preview,
	Section,
} from "@react-email/components";
import type { ReactNode } from "react";
import { Footer } from "../ui/Footer";
import { Logo } from "../ui/Logo";

interface StandardLayoutProps {
	preview: string;
	children: ReactNode;
}

export function StandardLayout({ preview, children }: StandardLayoutProps) {
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Body style={main}>
				<Container style={container}>
					{/* Header */}
					<Section style={header}>
						<Logo />
					</Section>

					{/* Divider */}
					<Section style={divider} />

					{/* Content */}
					<Section style={content}>{children}</Section>

					{/* Footer */}
					<Footer />
				</Container>
			</Body>
		</Html>
	);
}

const main = {
	backgroundColor: "#ffffff",
	fontFamily:
		'"SF Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
	border: "1px solid #e8e8ea",
	borderRadius: "12px",
	margin: "auto",
	maxWidth: "600px",
	overflow: "clip" as const,
};

const header = {
	backgroundColor: "#ffffff",
	padding: "24px 36px 0 36px",
};

const divider = {
	background: "radial-gradient(circle farthest-side, #dfe1e4, #edeff5)",
	borderTop: "1px solid transparent",
	height: "1px",
	margin: "28px 36px",
};

const content = {
	backgroundColor: "#ffffff",
	padding: "0 36px 36px 36px",
};
