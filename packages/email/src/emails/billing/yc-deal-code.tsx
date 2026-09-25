import { Heading, Link, Section, Text } from "@react-email/components";
import { EmailLayout } from "../../components";

interface YcDealCodeEmailProps {
	firstName?: string | null;
	code: string;
}

export function YcDealCodeEmail({
	firstName = "there",
	code = "YC-XXXXXXXX",
}: YcDealCodeEmailProps) {
	return (
		<EmailLayout preview="Your code for 6 months of Superset Pro free">
			<Heading className="text-[22px] font-medium leading-8 text-foreground m-0 mb-4">
				Your Superset YC deal
			</Heading>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {firstName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Thanks for redeeming our deal on Bookface. Here is your code for 6
				months of Superset Pro free:
			</Text>

			<Section className="bg-surface border border-solid border-border rounded-md px-4 py-3 mb-4 text-center">
				<Text className="text-[18px] font-mono font-semibold tracking-wide text-foreground m-0">
					{code}
				</Text>
			</Section>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				In the app, go to Settings, then Billing, pick the monthly Pro plan, and
				enter the code at checkout. It covers your whole team.
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				If you don't have the app yet, download it at{" "}
				<Link href="https://superset.sh/download" className="text-foreground">
					superset.sh/download
				</Link>
				. Questions? Just reply to this email.
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				You're receiving this because you redeemed the Superset deal on
				Bookface.
			</Text>
		</EmailLayout>
	);
}

export default YcDealCodeEmail;
