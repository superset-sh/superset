import { Trans } from "@lingui/react/macro";
import { FAQDisclosure } from "../../../components/FAQDisclosure";

export function CareersFAQ({ className = "" }: { className?: string }) {
	return (
		<section
			className={`grid gap-8 lg:grid-cols-[2fr_3fr] lg:gap-24 xl:gap-32 ${className}`}
		>
			<h2 className="m-0 text-[22px] leading-7 font-[450] tracking-[-0.025em] text-foreground sm:text-2xl sm:leading-8">
				<Trans>Questions</Trans>
			</h2>
			<div className="border-border border-t">
				<FAQDisclosure
					name="careers-faq"
					compact
					question={<Trans>Do you sponsor visas?</Trans>}
				>
					<p>
						<Trans>
							Yes. You don't need US work authorization to apply. But you should
							be willing to relocate to San Francisco.
						</Trans>
					</p>
				</FAQDisclosure>
				<FAQDisclosure
					name="careers-faq"
					compact
					question={<Trans>What are the benefits?</Trans>}
				>
					<p>
						<Trans>
							Medical and dental at no cost to you, a 401(k), unlimited time
							off, a $5K desk stipend, and free meals in the office.
						</Trans>
					</p>
				</FAQDisclosure>
				<FAQDisclosure
					name="careers-faq"
					compact
					question={<Trans>No role fits me. Should I still reach out?</Trans>}
				>
					<p>
						<Trans>
							Yes. Apply to the role that fits best and tell us what you would
							build. Include a repo, PR or demo.
						</Trans>
					</p>
				</FAQDisclosure>
			</div>
		</section>
	);
}
