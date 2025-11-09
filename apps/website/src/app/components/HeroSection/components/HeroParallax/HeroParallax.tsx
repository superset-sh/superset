"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

interface HeroParallaxProps {
	children: ReactNode;
	speed?: number;
	className?: string;
}

// Context to share visibility state with Three.js canvas
const HeroVisibilityContext = createContext<boolean>(true);

export function useHeroVisibility() {
	return useContext(HeroVisibilityContext);
}

export function HeroParallax({ children, className }: HeroParallaxProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(true);

	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start start", "end start"],
	});

	const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 0.5, 0]);

	// Track visibility with Intersection Observer
	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry) {
					setIsVisible(entry.isIntersecting);
				}
			},
			{
				threshold: 0,
				rootMargin: "100px", // Start rendering slightly before entering viewport
			},
		);

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, []);

	return (
		<HeroVisibilityContext.Provider value={isVisible}>
			<div ref={ref} className={className}>
				<motion.div style={{ opacity }}>{children}</motion.div>
			</div>
		</HeroVisibilityContext.Provider>
	);
}
