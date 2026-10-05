"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { FAQDisclosure } from "../FAQDisclosure";
import { FAQ_ITEMS } from "./constants";

export function FAQSection() {
	const { t } = useLingui();

	return (
		<section className="relative py-24 sm:py-32">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				<div className="grid grid-cols-1 xl:grid-cols-[1fr_1.5fr] gap-12 xl:gap-20">
					<div className="xl:sticky xl:top-24 xl:self-start">
						<h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-foreground leading-[1.1]">
							<Trans>
								Frequently
								<br />
								asked questions
							</Trans>
						</h2>
					</div>

					<div>
						<div className="w-full">
							{FAQ_ITEMS.map((item) => (
								<FAQDisclosure
									key={item.id}
									name="home-faq"
									question={t(item.question)}
								>
									<p>{t(item.answer)}</p>
									{item.link && (
										<Link
											href={item.link.href}
											className="inline-block text-brand hover:text-brand-light transition-colors"
										>
											{t(item.link.label)} →
										</Link>
									)}
								</FAQDisclosure>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
