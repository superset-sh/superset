import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Link,
	Preview,
	Text,
} from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";
import type { ReactNode } from "react";
import { emailTheme } from "../EmailLayout";

interface PersonalLayoutProps {
	preview: string;
	children: ReactNode;
	unsubscribeUrl?: string;
}

export function PersonalLayout({
	preview,
	children,
	unsubscribeUrl,
}: PersonalLayoutProps) {
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Tailwind
				config={{
					theme: {
						extend: {
							colors: {
								background: emailTheme.colors.background,
								foreground: emailTheme.colors.foreground,
								primary: emailTheme.colors.primary,
								muted: emailTheme.colors.muted,
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
					<Container
						style={{
							margin: "0 auto",
							maxWidth: "600px",
							padding: "32px 24px",
						}}
					>
						{children}

						<Hr
							style={{
								borderTop: `1px solid ${emailTheme.colors.border}`,
								borderBottom: "none",
								margin: "40px 0 16px 0",
							}}
						/>
						<Text
							style={{
								margin: 0,
								fontSize: "12px",
								lineHeight: "18px",
								color: "#8E8E8E",
							}}
						>
							Superset, Inc., San Francisco, CA
							{unsubscribeUrl ? (
								<>
									{" "}
									&middot;{" "}
									<Link
										href={unsubscribeUrl}
										style={{ color: "#8E8E8E", textDecoration: "underline" }}
									>
										Unsubscribe
									</Link>
								</>
							) : null}
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}
