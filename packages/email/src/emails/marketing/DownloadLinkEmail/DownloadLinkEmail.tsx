import { Heading, Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../../../components";

const DOWNLOAD_URL =
	"https://superset.sh/download?utm_source=email&utm_medium=transactional&utm_campaign=mobile-download-link";

interface DownloadLinkEmailProps {
	recipientEmail?: string;
}

export function DownloadLinkEmail({
	recipientEmail,
}: DownloadLinkEmailProps = {}) {
	return (
		<EmailLayout
			preview="Your Superset desktop download link"
			recipientEmail={recipientEmail}
		>
			<Heading className="m-0 mb-3 text-[22px] font-medium leading-8 text-foreground">
				Get Superset on your Mac
			</Heading>
			<Text className="m-0 mb-6 text-[15px] leading-6 text-muted">
				Open this email on your Mac, then use the button below to download the
				Superset desktop app. The right version will be selected automatically.
			</Text>

			<Section className="mb-8">
				<Button href={DOWNLOAD_URL}>Download Superset</Button>
			</Section>

			<Text className="m-0 text-[13px] leading-5 text-muted">
				The desktop app runs on macOS and Linux today. Windows is not yet
				available.
			</Text>
		</EmailLayout>
	);
}

export default DownloadLinkEmail;
