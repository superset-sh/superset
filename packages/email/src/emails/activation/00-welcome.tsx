import { Heading, Img, Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../../components";
import { env } from "../../lib/env";

const utm = (content: string) =>
	`?utm_source=email&utm_medium=lifecycle&utm_campaign=welcome&utm_content=${content}`;

const DOWNLOAD = "https://superset.sh/download";

interface WelcomeEmailProps {
	userName?: string;
	userEmail?: string;
}

export function WelcomeEmail({ userEmail }: WelcomeEmailProps = {}) {
	const assets = `${env.NEXT_PUBLIC_MARKETING_URL}/assets/emails`;

	return (
		<EmailLayout
			preview="They do the work. You review the diffs."
			recipientEmail={userEmail}
		>
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-3">
				Welcome to Superset
			</Heading>
			<Text className="text-[15px] leading-6 text-muted m-0 mb-6">
				Run Claude Code, Codex, or any CLI agent in parallel, each in an
				isolated copy of your repo. They do the work. You review the diffs.
			</Text>

			<a href={`${DOWNLOAD}${utm("hero-image")}`}>
				<Img
					src={`${assets}/welcome-hero.png`}
					alt="Superset running coding agents across parallel workspaces"
					width="512"
					className="w-full rounded-lg mb-6"
				/>
			</a>

			<Text className="text-[15px] leading-6 text-foreground font-medium m-0 mb-2">
				Two minutes to your first agent:
			</Text>
			<Text className="text-[15px] leading-7 text-foreground m-0 mb-6">
				1. Get the desktop app
				<br />
				2. Open a repo you&apos;re working on
				<br />
				3. Type the thing you were going to do anyway
			</Text>

			<Section className="mb-8">
				<Button href={`${DOWNLOAD}${utm("hero-cta")}`}>
					Download Superset
				</Button>
			</Section>

			<Text className="text-[13px] leading-5 text-muted m-0">
				Questions? Just reply. A founder reads every message.
			</Text>
		</EmailLayout>
	);
}

export default WelcomeEmail;
