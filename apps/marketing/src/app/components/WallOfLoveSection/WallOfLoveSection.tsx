"use client";

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
				className="size-10 object-cover"
				style={{ imageRendering: "pixelated" }}
			/>
		);
	}

	return (
		<div
			className="size-10 bg-[#4A3525] flex items-center justify-center text-sm font-medium text-[#FCDC5F] border-2"
			style={{
				fontFamily: "var(--font-geist-pixel-square)",
				borderColor: "#6B4D30 #2C1A0E #2C1A0E #6B4D30",
			}}
		>
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
			className="block p-4 mc-slot hover:border-[#FCDC5F] group"
		>
			<div className="flex items-start gap-3">
				<Avatar src={testimonial.avatar} name={testimonial.author} />
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span
							className="font-semibold text-foreground text-sm"
							style={{ fontFamily: "var(--font-geist-pixel-square)" }}
						>
							{testimonial.author}
						</span>
					</div>
					<span className="text-muted-foreground text-sm">
						{testimonial.handle}
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
					className="group/btn mt-2 py-2 text-xs text-muted-foreground hover:text-[#FCDC5F]"
					style={{ fontFamily: "var(--font-geist-pixel-square)" }}
				>
					<span className="group-hover/btn:hidden">
						{showOriginal ? "Translated" : "Translated"}
					</span>
					<span className="hidden group-hover/btn:inline">
						{showOriginal ? "Show translation" : "Show original"}
					</span>
				</button>
			)}
		</a>
	);
}

export function WallOfLoveSection() {
	const leftColumn = TESTIMONIALS.filter((_, i) => i % 3 === 0);
	const middleColumn = TESTIMONIALS.filter((_, i) => i % 3 === 1);
	const rightColumn = TESTIMONIALS.filter((_, i) => i % 3 === 2);

	return (
		<section className="relative py-24 px-8 lg:px-[30px]">
			<div className="max-w-6xl mx-auto">
				<div className="text-center mb-12">
					<h2
						className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-foreground"
						style={{
							fontFamily: "var(--font-geist-pixel-square)",
							textShadow: "2px 2px 0 rgba(0,0,0,0.4)",
						}}
					>
						What builders say about Superset
					</h2>
					<p
						className="mt-2 text-sm text-[#FCDC5F]"
						style={{ fontFamily: "var(--font-geist-pixel-square)" }}
					>
						+{TESTIMONIALS.length} reviews collected
					</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					<div className="flex flex-col gap-4">
						{leftColumn.map((testimonial) => (
							<div key={testimonial.id}>
								<TestimonialCard testimonial={testimonial} />
							</div>
						))}
					</div>

					<div className="flex flex-col gap-4">
						{middleColumn.map((testimonial) => (
							<div key={testimonial.id}>
								<TestimonialCard testimonial={testimonial} />
							</div>
						))}
					</div>

					<div className="flex flex-col gap-4 md:col-span-2 lg:col-span-1">
						{rightColumn.map((testimonial) => (
							<div key={testimonial.id}>
								<TestimonialCard testimonial={testimonial} />
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
