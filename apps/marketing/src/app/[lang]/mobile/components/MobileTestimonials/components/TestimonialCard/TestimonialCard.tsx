import { useLingui } from "@lingui/react/macro";
import Image from "next/image";
import type { TESTIMONIALS } from "../../constants";

export function TestimonialCard({
	testimonial,
}: {
	testimonial: (typeof TESTIMONIALS)[number];
}) {
	const { i18n } = useLingui();

	return (
		<figure className="flex h-full flex-col justify-between gap-3 border border-border bg-card p-4">
			<blockquote className="text-sm text-foreground leading-relaxed">
				{i18n._(testimonial.quote)}
			</blockquote>
			<figcaption className="flex items-center gap-2.5">
				<Image
					src={testimonial.avatar}
					alt=""
					width={32}
					height={32}
					className="size-8 shrink-0 rounded-full object-cover"
				/>
				<div className="min-w-0">
					<a
						href={testimonial.href}
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium text-foreground text-xs underline-offset-4 hover:underline"
					>
						{testimonial.name}
					</a>
					<p className="mt-0.5 text-muted-foreground text-[11px]">
						{i18n._(testimonial.role)}
					</p>
				</div>
			</figcaption>
		</figure>
	);
}
