import type { ReactNode } from "react";
import { useEffect } from "react";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export interface PaneCardProps {
	title: string;
	description?: string;
	/** 0-based index drives the staggered fade-in (Peak-End). */
	index?: number;
	children: ReactNode;
}

const STAGGER_MS = 60;
const DURATION_MS = 220; // Below the Doherty 400ms threshold.

/**
 * A single "pane" inside a workspace. The subtle staggered fade-in is the
 * Peak-End moment — opening a workspace feels alive without crossing the
 * Doherty threshold.
 */
export function PaneCard({
	title,
	description,
	index = 0,
	children,
}: PaneCardProps) {
	const opacity = useSharedValue(0);
	const translateY = useSharedValue(8);

	useEffect(() => {
		const delay = index * STAGGER_MS;
		opacity.value = withDelay(delay, withTiming(1, { duration: DURATION_MS }));
		translateY.value = withDelay(
			delay,
			withTiming(0, { duration: DURATION_MS }),
		);
	}, [index, opacity, translateY]);

	const style = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ translateY: translateY.value }],
	}));

	return (
		<Animated.View style={style}>
			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					{description ? (
						<CardDescription>{description}</CardDescription>
					) : null}
				</CardHeader>
				<CardContent>{children}</CardContent>
			</Card>
		</Animated.View>
	);
}
