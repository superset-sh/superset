"use client";

import { motion } from "framer-motion";
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
			className="block p-4 bg-card border border-border rounded-xl hover:border-muted-foreground/50 transition-colors"
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
					className="group mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<span className="group-hover:hidden">
						{showOriginal ? "Translated" : "Translated"}
					</span>
					<span className="hidden group-hover:inline">
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
				<motion.div
					className="text-center mb-12"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					<h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-foreground">
						What builders say about Superset
					</h2>
				</motion.div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					<div className="flex flex-col gap-4">
						{leftColumn.map((testimonial, index) => (
							<motion.div
								key={testimonial.id}
								initial={{ opacity: 0, y: 20 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: "-50px" }}
								transition={{ duration: 0.4, delay: index * 0.1 }}
							>
								<TestimonialCard testimonial={testimonial} />
							</motion.div>
						))}
					</div>

					<div className="flex flex-col gap-4">
						{middleColumn.map((testimonial, index) => (
							<motion.div
								key={testimonial.id}
								initial={{ opacity: 0, y: 20 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: "-50px" }}
								transition={{ duration: 0.4, delay: index * 0.1 + 0.05 }}
							>
								<TestimonialCard testimonial={testimonial} />
							</motion.div>
						))}
					</div>

					<div className="flex flex-col gap-4 md:col-span-2 lg:col-span-1">
						{rightColumn.map((testimonial, index) => (
							<motion.div
								key={testimonial.id}
								initial={{ opacity: 0, y: 20 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: "-50px" }}
								transition={{ duration: 0.4, delay: index * 0.1 + 0.1 }}
							>
								<TestimonialCard testimonial={testimonial} />
							</motion.div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
