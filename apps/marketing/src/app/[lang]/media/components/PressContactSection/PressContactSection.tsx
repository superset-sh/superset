import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { SectionHeading } from "../SectionHeading";

const PRESS_EMAIL = `founders${COMPANY.EMAIL_DOMAIN}`;

export function PressContactSection() {
	return (
		<section aria-labelledby="press-contact">
			<SectionHeading id="press-contact">
				<Trans>Press contact</Trans>
			</SectionHeading>
			<p className="mt-6 text-muted-foreground leading-relaxed">
				<Trans>For press inquiries and interview requests, email us.</Trans>
			</p>
			<a
				href={`mailto:${PRESS_EMAIL}`}
				className="mt-3 inline-block font-medium text-foreground text-xl underline-offset-4 hover:underline"
			>
				{PRESS_EMAIL}
			</a>
		</section>
	);
}
