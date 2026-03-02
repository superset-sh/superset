import { Heading, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface WelcomeEmailProps {
	userName?: string;
}

export function WelcomeEmail({ userName = "there" }: WelcomeEmailProps) {
	return (
		<StandardLayout preview="Welcome to Superset! Let's get you started.">
			<Heading style={heading}>Welcome to Superset, {userName}!</Heading>

			<Text style={paragraph}>
				Thanks for joining Superset. We're excited to help you automate your
				workflows and boost your productivity with AI-powered task management.
			</Text>

			<Text style={paragraph}>Here's what you can do next:</Text>

			<Text style={listItem}>
				✓ Create your first workspace and invite your team
			</Text>
			<Text style={listItem}>
				✓ Connect your favorite tools and integrations
			</Text>
			<Text style={listItem}>✓ Set up your first automated workflow</Text>

			<Button href="https://app.superset.sh/onboarding">Get Started</Button>

			<Text style={footer}>
				Need help getting started? Check out our{" "}
				<a href="https://superset.sh/docs" style={link}>
					documentation
				</a>{" "}
				or reach out to our{" "}
				<a href="https://superset.sh/support" style={link}>
					support team
				</a>
				.
			</Text>
		</StandardLayout>
	);
}

// Default export for React Email preview
export default WelcomeEmail;

const heading = {
	color: "#000000",
	fontSize: "28px",
	fontWeight: "600" as const,
	lineHeight: "1.3",
	margin: "0 0 24px 0",
};

const paragraph = {
	color: "#515759",
	fontSize: "16px",
	lineHeight: "22px",
	margin: "0 0 16px 0",
};

const listItem = {
	color: "#515759",
	fontSize: "16px",
	lineHeight: "28px",
	margin: "0 0 8px 0",
};

const footer = {
	color: "#77767e",
	fontSize: "14px",
	lineHeight: "22px",
	margin: "24px 0 0 0",
};

const link = {
	color: "#966dd5",
	textDecoration: "none",
};
