import {
	Body,
	Container,
	Head,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { env } from "../../../lib/env";
import { lifecycle } from "../../../lib/lifecycle-theme";

interface LifecycleLayoutProps {
	preview: string;
	children: ReactNode;
	unsubscribeUrl?: string;
}

export function LifecycleLayout({
	preview,
	children,
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
							padding: "40px 48px",
						}}
					>
						<Img
							src={`${assets}/logo-full-white.png`}
							alt="Superset"
							width="140"
							style={{ marginBottom: "24px" }}
						/>
						<Text style={{ margin: "0 0 28px 0" }}>
							<Link
								href="https://x.com/superset_sh"
								style={{ display: "inline-block", marginRight: "18px" }}
							>
								<Img
									src={`${assets}/x-white.png`}
									alt="X"
									width="22"
									height="22"
								/>
							</Link>
							<Link
								href="https://instagram.com/superset"
								style={{ display: "inline-block", marginRight: "18px" }}
							>
								<Img
									src={`${assets}/instagram-white.png`}
									alt="Instagram"
									width="22"
									height="22"
								/>
							</Link>
							<Link
								href="https://www.linkedin.com/company/superset-sh"
								style={{ display: "inline-block" }}
							>
								<Img
									src={`${assets}/linkedin-white.png`}
									alt="LinkedIn"
									width="22"
									height="22"
								/>
							</Link>
						</Text>
						<Text
							style={{
								margin: "0 0 6px 0",
								fontFamily: lifecycle.fonts.serif,
								fontSize: "13px",
								lineHeight: "20px",
								color: lifecycle.colors.footerMuted,
							}}
						>
							Superset, Inc. — San Francisco, CA
						</Text>
						<Text
							style={{
								margin: 0,
								fontFamily: lifecycle.fonts.serif,
								fontSize: "13px",
								lineHeight: "20px",
								color: lifecycle.colors.footerMuted,
							}}
						>
							{unsubscribeUrl ? (
								<>
									To opt out of future emails,{" "}
									<Link
										href={unsubscribeUrl}
										style={{
											color: lifecycle.colors.footerText,
											textDecoration: "underline",
										}}
									>
										unsubscribe
									</Link>
									.
								</>
							) : (
								<Link
									href="https://superset.sh/contact"
									style={{
										color: lifecycle.colors.footerText,
										textDecoration: "underline",
									}}
								>
									Contact us
								</Link>
							)}
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}
