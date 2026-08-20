import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";
import type { ReactNode } from "react";
import { env } from "../../../lib/env";

export const emailTheme = {
	colors: {
		background: "#FFFFFF",
		foreground: "#242424",
		muted: "#51575A",
		faint: "#A3A39E",
		border: "#EBEBEB",
		surface: "#F7F7F7",
		primary: "#242424",
	},
	fonts: {
		sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
		mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace",
	},
	width: 560,
} as const;

interface EmailLayoutProps {
	preview: string;
	children: ReactNode;
	recipientEmail?: string;
	unsubscribeUrl?: string;
}

const footerText = {
	margin: 0,
	fontSize: "12px",
	lineHeight: "20px",
	color: emailTheme.colors.faint,
} as const;

export function EmailLayout({
	preview,
	children,
	recipientEmail,
	unsubscribeUrl,
}: EmailLayoutProps) {
	const assets = `${env.NEXT_PUBLIC_MARKETING_URL}/assets/emails`;

	return (
		<Html>
			<Head />
			<Tailwind
				config={{
					theme: {
						extend: {
							colors: {
								background: emailTheme.colors.background,
								foreground: emailTheme.colors.foreground,
								primary: emailTheme.colors.primary,
								muted: emailTheme.colors.muted,
								faint: emailTheme.colors.faint,
								border: emailTheme.colors.border,
								surface: emailTheme.colors.surface,
							},
						},
					},
				}}
			>
				<Body
					style={{
						margin: 0,
						backgroundColor: emailTheme.colors.background,
						fontFamily: emailTheme.fonts.sans,
					}}
				>
					<Preview>{preview}</Preview>
					<Container
						style={{
							margin: "0 auto",
							maxWidth: `${emailTheme.width}px`,
							padding: "40px 24px 48px",
						}}
					>
						<Img src={`${assets}/logo-full.png`} alt="Superset" width="116" />

						<Section style={{ paddingTop: "32px" }}>{children}</Section>

						<Hr
							style={{
								borderTop: `1px solid ${emailTheme.colors.border}`,
								borderBottom: "none",
								margin: "40px 0 20px",
							}}
						/>
						<Text style={footerText}>
							<Link
								href="https://superset.sh"
								style={{
									color: emailTheme.colors.faint,
									textDecoration: "none",
								}}
							>
								Superset
							</Link>
							, Inc., San Francisco, CA
						</Text>
						{recipientEmail || unsubscribeUrl ? (
							<Text style={footerText}>
								{recipientEmail ? (
									<>This email was sent to {recipientEmail}. </>
								) : null}
								{unsubscribeUrl ? (
									<Link
										href={unsubscribeUrl}
										style={{
											color: emailTheme.colors.faint,
											textDecoration: "underline",
										}}
									>
										Unsubscribe
									</Link>
								) : null}
							</Text>
						) : null}
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}
