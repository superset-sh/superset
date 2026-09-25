import { Trans } from "@lingui/react/macro";
import { HiArrowDown } from "react-icons/hi2";
import { PhoneShowcase } from "../PhoneShowcase";

export function MobileSection() {
	return (
		<section
			id="mobile"
			aria-labelledby="mobile-heading"
			className="scroll-mt-24 overflow-hidden pb-16 sm:pb-24"
		>
			<div className="mx-auto max-w-6xl px-6 text-center sm:px-8">
				<HiArrowDown
					aria-hidden="true"
					className="mx-auto mb-5 size-6 text-muted-foreground/40"
				/>
				<h2
					id="mobile-heading"
					className="text-2xl font-normal tracking-tight text-foreground sm:text-3xl"
				>
					<Trans>Start work from anywhere</Trans>
				</h2>
				<p className="mt-3 text-base text-muted-foreground sm:text-lg">
					<Trans>Run your agents from your phone.</Trans>
				</p>
				<div className="mt-12 sm:mt-20">
					<PhoneShowcase layout="spread" />
				</div>
			</div>
		</section>
	);
}
