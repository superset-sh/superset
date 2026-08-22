"use client";

import { LazyMotion } from "framer-motion";

// Components use `m.*` (not `motion.*`) so the framer-motion feature bundle
// loads in this async chunk instead of the critical-path JS
const loadMotionFeatures = () =>
	import("./motion-features").then((mod) => mod.default);

export function Providers({ children }: { children: React.ReactNode }) {
	return <LazyMotion features={loadMotionFeatures}>{children}</LazyMotion>;
}
