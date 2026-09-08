import {
	Body,
	Container,
	Head,
	Html,
	Link,
	Preview,
	Text,
} from "@react-email/components";

interface ChurnWinbackEmailProps {
	ownerName?: string;
	organizationName?: string;
	planName?: string;
}

export function ChurnWinbackEmail({
	ownerName = "{{{ownerName|there}}}",
	organizationName = "{{{organizationName|your team}}}",
	planName = "{{{plan|paid}}}",
}: ChurnWinbackEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>One question before you go</Preview>
			<Body style={body}>
				<Container style={container}>
					<Text style={paragraph}>Hi {ownerName},</Text>

					<Text style={paragraph}>
						Satya here, one of the founders of Superset. I saw that the{" "}
						{planName} subscription for {organizationName} ended last week, and
						I wanted to reach out myself.
					</Text>

					<Text style={paragraph}>
						No hard feelings — but I'd genuinely like to know what didn't work.
						A missing feature, the price, a bug that got in the way? Just hit
						reply and tell me. I read and answer every one of these.
					</Text>

					<Text style={paragraph}>
						And if it was just timing, you can{" "}
						<Link href="https://app.superset.sh/settings/billing" style={link}>
							restart your plan
						</Link>{" "}
						in about a minute — your workspaces and team are right where you
						left them.
					</Text>

					<Text style={paragraph}>
						Either way, thanks for giving Superset a real shot.
					</Text>

					<Text style={paragraph}>
						— Satya
						<br />
						Co-founder, Superset
					</Text>

					<Text style={footer}>
						Don't want emails like this?{" "}
						<Link href="{{{RESEND_UNSUBSCRIBE_URL}}}" style={footerLink}>
							Unsubscribe
						</Link>
						.
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

export default ChurnWinbackEmail;

const body = {
	backgroundColor: "#FFFFFF",
	fontFamily:
		"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
	margin: "0",
};

const container = {
	margin: "0 auto",
	maxWidth: "560px",
	padding: "32px 20px",
};

const paragraph = {
	color: "#242424",
	fontSize: "15px",
	lineHeight: "24px",
	margin: "0 0 16px 0",
};

const link = {
	color: "#242424",
	textDecoration: "underline",
};

const footer = {
	color: "#8E8E8E",
	fontSize: "12px",
	lineHeight: "18px",
	margin: "32px 0 0 0",
};

const footerLink = {
	color: "#8E8E8E",
	textDecoration: "underline",
};
