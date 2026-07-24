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
	fontSize: "14px",
	lineHeight: "21px",
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
							<Column style={{ width: "45%", verticalAlign: "top" }}>
								<Img
									src={`${assets}/logo-full-white.png`}
									alt="Superset"
									width="180"
									style={{ marginTop: "14px" }}
								/>
							</Column>
							<Column style={{ width: "55%", verticalAlign: "top" }}>
								<Row>
									<Column style={{ width: "33%", textAlign: "center" }}>
										<Link href="https://instagram.com/superset">
											<Img
												src={`${assets}/instagram-white.png`}
												alt="Instagram"
												width="28"
												height="28"
												style={{ display: "inline-block" }}
											/>
										</Link>
									</Column>
									<Column style={{ width: "33%", textAlign: "center" }}>
										<Link href="https://www.linkedin.com/company/superset-sh">
											<Img
												src={`${assets}/linkedin-white.png`}
												alt="LinkedIn"
												width="28"
												height="28"
												style={{ display: "inline-block" }}
											/>
										</Link>
									</Column>
									<Column style={{ width: "33%", textAlign: "center" }}>
										<Link href="https://x.com/superset_sh">
											<Img
												src={`${assets}/x-white.png`}
												alt="X"
												width="28"
												height="28"
												style={{ display: "inline-block" }}
											/>
										</Link>
									</Column>
								</Row>
								<Hr
									style={{
										borderColor: "#FFFFFF",
										borderWidth: "1px",
										margin: "26px 0 24px 0",
									}}
								/>
								<Text style={{ ...footerText, marginBottom: "14px" }}>
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
							</Column>
						</Row>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}
