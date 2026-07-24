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
import type { ReactNode } from "react";
import { env } from "../../../lib/env";
import { lifecycle } from "../../../lib/lifecycle-theme";

interface LifecycleLayoutProps {
	preview: string;
	children: ReactNode;
	recipientEmail?: string;
	unsubscribeUrl?: string;
}

const footerText = {
	margin: 0,
	fontFamily: lifecycle.fonts.serif,
	fontSize: "12px",
	lineHeight: "16px",
	color: lifecycle.colors.footerMuted,
} as const;

export function LifecycleLayout({
	preview,
	children,
	recipientEmail,
	unsubscribeUrl,
}: LifecycleLayoutProps) {
	const assets = `${env.NEXT_PUBLIC_MARKETING_URL}/assets/emails`;

	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Body
				style={{
					margin: 0,
					backgroundColor: lifecycle.colors.paper,
					fontFamily: lifecycle.fonts.serif,
				}}
			>
				<Container
					style={{
						margin: "0 auto",
						maxWidth: `${lifecycle.width}px`,
						backgroundColor: lifecycle.colors.paper,
					}}
				>
					<Section
						style={{
							backgroundColor: lifecycle.colors.clay,
							padding: "26px 0",
							textAlign: "center",
						}}
					>
						<Img
							src={`${assets}/logo-full.png`}
							alt="Superset"
							width="150"
							style={{ margin: "0 auto" }}
						/>
					</Section>

					{children}

					<Section
						style={{
							backgroundColor: lifecycle.colors.footer,
							padding: "48px 40px 56px 40px",
						}}
					>
						<Row>
							<Column style={{ width: "50%", verticalAlign: "top" }}>
								<Img
									src={`${assets}/logo-full-white.png`}
									alt="Superset"
									width="219"
								/>
								<Row style={{ marginTop: "40px", width: "236px" }}>
									<Column style={{ width: "112px" }}>
										<Link href="https://superset.sh/download">
											<Img
												src={`${assets}/badge-appstore.png`}
												alt="App Store"
												width="108"
												height="32"
											/>
										</Link>
									</Column>
									<Column style={{ width: "124px" }}>
										<Link href="https://superset.sh/download">
											<Img
												src={`${assets}/badge-googleplay.png`}
												alt="Google Play"
												width="108"
												height="32"
											/>
										</Link>
									</Column>
								</Row>
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
												color: lifecycle.colors.footerMuted,
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
		</Html>
	);
}
