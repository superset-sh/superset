import { Heading, Link, Text } from "@react-email/components";
import { StandardLayout } from "../components/layout/StandardLayout";
import { Button } from "../components/ui/Button";

interface WelcomeEmailProps {
	userName?: string;
}

export function WelcomeEmail({ userName = "there" }: WelcomeEmailProps) {
	return (
		<StandardLayout preview="Welcome to Superset">
			<Heading className="text-foreground text-[28px] font-semibold leading-tight m-0 mb-6">
				Welcome to Superset{userName !== "there" ? `, ${userName}` : ""}
			</Heading>

			<Text className="text-[#515759] text-base leading-snug m-0 mb-4">
				Thanks for signing up. Superset helps you automate your workflows with
				AI-powered task management.
			</Text>

			<Text className="text-[#515759] text-base leading-snug m-0 mb-4">
				Get started:
			</Text>

			<Text className="text-[#515759] text-base leading-7 m-0 mb-2">
				• Create your first workspace
			</Text>
			<Text className="text-[#515759] text-base leading-7 m-0 mb-2">
				• Connect your tools and integrations
			</Text>
			<Text className="text-[#515759] text-base leading-7 m-0 mb-6">
				• Set up automated workflows
			</Text>

			<Button href="https://app.superset.sh/onboarding">Get Started</Button>

			<Text className="text-muted text-sm leading-snug m-0 mt-6">
				Questions? Check out our{" "}
				<Link
					href="https://superset.sh/docs"
					className="text-primary no-underline"
				>
					docs
				</Link>{" "}
				or{" "}
				<Link
					href="https://superset.sh/support"
					className="text-primary no-underline"
				>
					contact support
				</Link>
				.
			</Text>
		</StandardLayout>
	);
}

export default WelcomeEmail;
