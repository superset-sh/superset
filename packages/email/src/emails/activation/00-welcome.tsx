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
			<Heading className="text-[28px] font-semibold leading-9 text-foreground text-center mt-2 mb-2">
				Welcome to Superset
			</Heading>
			<Text className="text-base leading-6 text-muted text-center m-0 mb-8">
				Run coding agents in parallel, each in an isolated copy of your repo.
				<br />
				They do the work. You review the diffs.
			</Text>

			<Section className="bg-surface border border-solid border-border rounded-2xl p-4 mb-8">
				<a href={`${DOWNLOAD}${utm("hero-image")}`}>
					<Img
						src={`${assets}/welcome-hero.png`}
						alt="Superset running coding agents across parallel workspaces"
						width="536"
						className="w-full rounded-lg"
					/>
				</a>
			</Section>

			<Text className="text-base leading-6 text-foreground m-0 mb-2 font-semibold">
				Two minutes to your first agent:
			</Text>
			<Text className="text-base leading-[26px] text-foreground m-0 mb-8">
				1. Get the desktop app
				<br />
				2. Open a repo you&apos;re working on
				<br />
				3. Type the thing you were going to do anyway
			</Text>

			<Section className="text-center mb-8">
				<Button href={`${DOWNLOAD}${utm("hero-cta")}`}>
					Download Superset
				</Button>
			</Section>

			<Text className="text-base leading-6 text-muted text-center m-0">
				Questions? Just reply — a founder reads every message.
			</Text>
		</EmailLayout>
	);
}

export default WelcomeEmail;
