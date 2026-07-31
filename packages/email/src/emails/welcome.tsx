import { Section, Text } from "@react-email/components";
import { LifecycleLayout } from "../components/lifecycle";
import { lifecycle } from "../lib/lifecycle-theme";

const body = {
	margin: "0 0 20px 0",
	fontFamily: lifecycle.fonts.sans,
	fontSize: "16px",
	lineHeight: "24px",
	color: lifecycle.colors.ink,
} as const;

interface WelcomeEmailProps {
	userName?: string;
	userEmail?: string;
}

export function WelcomeEmail({ userEmail }: WelcomeEmailProps = {}) {
	return (
		<LifecycleLayout preview="Welcome to Superset." recipientEmail={userEmail}>
			<Section style={{ padding: "48px 48px 40px 48px" }}>
				<Text style={body}>Welcome to Superset.</Text>
				<Text style={{ ...body, margin: 0 }}>
					Questions? Just reply — a founder reads every message.
				</Text>
			</Section>
		</LifecycleLayout>
	);
}

export default WelcomeEmail;
