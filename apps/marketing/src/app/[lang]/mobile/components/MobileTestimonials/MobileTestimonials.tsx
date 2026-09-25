"use client";

import { Trans } from "@lingui/react/macro";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@superset/ui/carousel";
import { TestimonialCard } from "./components/TestimonialCard";
import { TESTIMONIALS } from "./constants";

export function MobileTestimonials() {
	return (
		<Carousel
			opts={{ align: "start" }}
			aria-labelledby="mobile-testimonials-heading"
			className="mt-10 sm:mt-12"
		>
			<div className="mb-3 flex items-center justify-between gap-4">
				<h2
					id="mobile-testimonials-heading"
					className="font-mono text-brand text-xs uppercase tracking-wider"
				>
					<Trans>What early users say</Trans>
				</h2>
				<div className="flex shrink-0 gap-2">
					<CarouselPrevious className="static size-9 translate-y-0 rounded-none" />
					<CarouselNext className="static size-9 translate-y-0 rounded-none" />
				</div>
			</div>
			<CarouselContent>
				{TESTIMONIALS.map((testimonial) => (
					<CarouselItem
						key={testimonial.name}
						className="md:basis-1/2 lg:basis-1/3"
					>
						<TestimonialCard testimonial={testimonial} />
					</CarouselItem>
				))}
			</CarouselContent>
		</Carousel>
	);
}
