import {
	Body,
	Container,
	Head,
	Html,
	Preview,
	Section,
} from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";
import type { ReactNode } from "react";
import { colors } from "../../../lib/colors";
import { Logo } from "../../ui/Logo";
import { Footer } from "./components/Footer";

interface StandardLayoutProps {
	preview: string;
	children: ReactNode;
}

export function StandardLayout({ preview, children }: StandardLayoutProps) {
	return (
		<Html>
			<Head />
			<Tailwind
				config={{
					theme: {
						extend: {
							colors: {
								background: colors.background,
								foreground: colors.foreground,
								primary: colors.primary,
								muted: colors.mutedForeground,
								border: colors.border,
							},
						},
					},
				}}
			>
				<Body className="bg-background font-sans">
					<Preview>{preview}</Preview>
					<Container className="mx-auto my-8 max-w-[600px] rounded-xl border border-border overflow-hidden">
						<Section className="bg-background px-9 pt-6">
							<Logo />
						</Section>

						<Section
							className="h-px mx-9 my-7 border-t border-transparent"
							style={{
								background:
									"radial-gradient(circle farthest-side, #dfe1e4, #edeff5)",
							}}
						/>

						<Section className="bg-background px-9 pb-9">{children}</Section>

						<Footer />
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}
