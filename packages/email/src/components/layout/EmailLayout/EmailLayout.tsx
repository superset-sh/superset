import {
	Body,
	Column,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Row,
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
		muted: "#515759",
		border: "#EBEBEB",
		surface: "#F7F7F7",
		primary: "#343434",
		footer: "#000000",
		footerText: "#FFFFFF",
		footerMuted: "#A3A3A3",
	},
	fonts: {
		sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
		mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace",
	},
	width: 640,
} as const;

interface EmailLayoutProps {
	preview: string;
	children: ReactNode;
	recipientEmail?: string;
	unsubscribeUrl?: string;
}

const footerText = {
	margin: 0,
	fontFamily: emailTheme.fonts.sans,
	fontSize: "12px",
	lineHeight: "16px",
	color: emailTheme.colors.footerMuted,
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
							backgroundColor: emailTheme.colors.background,
						}}
					>
						<Section
							style={{
								backgroundColor: emailTheme.colors.footer,
								padding: "26px 0",
								textAlign: "center",
							}}
						>
							<Img
								src={`${assets}/logo-full-white.png`}
								alt="Superset"
								width="150"
								style={{ margin: "0 auto" }}
							/>
						</Section>

						<Section className="px-9 py-8">{children}</Section>

						<Section
							style={{
								backgroundColor: emailTheme.colors.footer,
								padding: "48px 40px 56px 40px",
							}}
						>
							<Row>
								<Column style={{ width: "50%", verticalAlign: "top" }}>
									<Img
										src={`${assets}/logo-full-white.png`}
										alt="Superset"
										width="232"
									/>
									<Text style={{ margin: "40px 0 0 0" }}>
										<Img
											src={`${assets}/badge-appstore.png`}
											alt="App Store"
											width="108"
											height="32"
											style={{ display: "inline-block", marginRight: "16px" }}
										/>
										<Img
											src={`${assets}/badge-googleplay.png`}
											alt="Google Play"
											width="108"
											height="32"
											style={{ display: "inline-block" }}
										/>
									</Text>
								</Column>
								<Column style={{ width: "50%", verticalAlign: "top" }}>
									<Section style={{ width: "248px", margin: "0 auto" }}>
										<Row>
											<Column style={{ width: "25%", textAlign: "center" }}>
												<Link href="https://instagram.com/superset">
													<Img
														src={`${assets}/icon-instagram-white.png`}
														alt="Instagram"
														width="32"
														height="32"
														style={{ display: "inline-block" }}
													/>
												</Link>
											</Column>
											<Column style={{ width: "25%", textAlign: "center" }}>
												<Link href="https://www.linkedin.com/company/superset-sh">
													<Img
														src={`${assets}/icon-linkedin-white.png`}
														alt="LinkedIn"
														width="32"
														height="32"
														style={{ display: "inline-block" }}
													/>
												</Link>
											</Column>
											<Column style={{ width: "25%", textAlign: "center" }}>
												<Link href="https://x.com/superset_sh">
													<Img
														src={`${assets}/icon-x-white.png`}
														alt="X"
														width="32"
														height="32"
														style={{ display: "inline-block" }}
													/>
												</Link>
											</Column>
											<Column style={{ width: "25%", textAlign: "center" }}>
												<Link href="https://www.youtube.com/@superset-sh">
													<Img
														src={`${assets}/icon-youtube-white.png`}
														alt="YouTube"
														width="32"
														height="32"
														style={{ display: "inline-block" }}
													/>
												</Link>
											</Column>
										</Row>
										<Hr
											style={{
												borderTop: "solid 1px #C2C0B6",
												borderBottom: "none",
												width: "100%",
												margin: "34px 0 18px 0",
											}}
										/>
										<Text style={{ ...footerText, marginBottom: "8px" }}>
											Superset, Inc., San Francisco, CA
										</Text>
										<Text style={footerText}>
											{recipientEmail ? (
												<>
													This email was sent to{" "}
													<Link
														href={`mailto:${recipientEmail}`}
														style={{
															color: "#8CA6DE",
															textDecoration: "underline",
														}}
													>
														{recipientEmail}
													</Link>
													.{" "}
												</>
											) : null}
											To opt out of future emails, click{" "}
											<Link
												href={unsubscribeUrl ?? "https://superset.sh/contact"}
												style={{
													color: emailTheme.colors.footerMuted,
													textDecoration: "underline",
												}}
											>
												unsubscribe
											</Link>
											.
										</Text>
									</Section>
								</Column>
							</Row>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}
