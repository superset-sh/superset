"use client";

import { Trans } from "@lingui/react/macro";
import Image from "next/image";
import { useState } from "react";
import { TESTIMONIALS, type Testimonial } from "./constants";

function getInitials(name: string) {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function Avatar({ src, name }: { src?: string; name: string }) {
	if (src) {
		return (
			<Image
				src={src}
				alt={name}
				width={40}
				height={40}
				className="size-10 rounded-full object-cover"
			/>
		);
	}

	return (
		<div className="size-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
			{getInitials(name)}
		</div>
	);
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
	const [showOriginal, setShowOriginal] = useState(false);
	const hasTranslation = !!testimonial.originalContent;

	return (
		<a
			href={testimonial.url}
			target="_blank"
			rel="noopener noreferrer"
			className="block p-4 bg-card border border-border hover:border-muted-foreground/50 transition-colors"
		>
			<div className="flex items-start gap-3">
				<Avatar src={testimonial.avatar} name={testimonial.author} />
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="font-semibold text-foreground text-sm">
							{testimonial.author}
						</span>
					</div>
					<span className="text-muted-foreground text-sm">
						{testimonial.role ?? testimonial.handle}
					</span>
				</div>
			</div>
			<p className="mt-3 text-foreground/90 text-[15px] leading-relaxed whitespace-pre-line">
				{showOriginal ? testimonial.originalContent : testimonial.content}
			</p>
			{hasTranslation && (
				<button
					type="button"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setShowOriginal(!showOriginal);
					}}
					className="group mt-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<span className="group-hover:hidden">
						<Trans>Translated</Trans>
					</span>
					<span className="hidden group-hover:inline">
						{showOriginal ? (
							<Trans>Show translation</Trans>
						) : (
							<Trans>Show original</Trans>
						)}
					</span>
				</button>
			)}
		</a>
	);
}

export function WallOfLoveSection() {
	const [showAll, setShowAll] = useState(false);
	const count = TESTIMONIALS.length;

	return (
		<section className="relative py-24 sm:py-32">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				<div className="max-w-2xl mb-12 sm:mb-16">
					<h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight leading-[1.1] text-foreground">
						<Trans>What builders say about Superset</Trans>
					</h2>
				</div>

				<div className="columns-1 gap-4 md:columns-2 lg:columns-3">
					{TESTIMONIALS.map((testimonial, index) => (
						<div
							key={testimonial.id}
							className={`mb-4 break-inside-avoid ${!showAll && index >= 5 ? "hidden md:block" : ""}`}
						>
							<TestimonialCard testimonial={testimonial} />
						</div>
					))}
				</div>

				{!showAll && (
					<button
						type="button"
						onClick={() => setShowAll(true)}
						className="mt-2 w-full border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-muted-foreground/50 md:hidden"
					>
						<Trans>Show all {count}</Trans>
					</button>
				)}
			</div>
		</section>
	);
}
