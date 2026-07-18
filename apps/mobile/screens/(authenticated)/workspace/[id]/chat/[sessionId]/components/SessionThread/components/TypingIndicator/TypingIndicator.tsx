import { useMemo } from "react";
import { View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
	useFrameCallback,
	useSharedValue,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

// Caret boids — "6 boids · dots · speed-fade · tight · 1.7× speed".
// Faithful port of the web caret flock (canvas → Reanimated): six dots
// milling inside a caret-shaped containment ellipse, each dot's opacity
// tracking its current speed so the flock shimmers as individuals
// accelerate and coast. The simulation runs per-frame on the UI thread via
// useFrameCallback; nothing re-renders.

// World: height is always 100 units; width = 100 * aspect.
const ASPECT = 0.55; // caret proportions
const WORLD_W = 100 * ASPECT;
const CENTER_X = WORLD_W / 2;
const HOME = 0.9; // "tight" area multiplier
const RADIUS_X = Math.min(32, WORLD_W / 2 - 5) * HOME; // containment ellipse
const RADIUS_Y = 42 * HOME;

// Motion constants.
const MAX_SPEED = 62 * 1.7; // the 1.7×
const MIN_SPEED = MAX_SPEED * 0.45; // min speed floor — never stalls
const MAX_FORCE = 260;
const R_NEIGHBOR = 26;
const R_SEPARATION = 10;
const BOID_COUNT = 6;
const DOT_SIZE_MULTIPLIER = 1.2;

// On-screen caret box (~0.62em × 1.15em of the chat text size), in points.
const BOX_H = 18;
const BOX_W = Math.ceil(BOX_H * ASPECT);
const SCALE = BOX_H / 100;
const DOT_RADIUS = Math.max(0.85, BOX_H * 0.03) * DOT_SIZE_MULTIPLIER;

const SETTLE_STEPS = 90; // settle before first paint

interface Boid {
	x: number;
	y: number;
	vx: number;
	vy: number;
}

/** Scatter inside the ellipse with random headings. */
function makeBoids(): Boid[] {
	const boids: Boid[] = [];
	for (let index = 0; index < BOID_COUNT; index += 1) {
		const angle = Math.random() * Math.PI * 2;
		const radius = Math.random() * 0.7;
		const heading = Math.random() * Math.PI * 2;
		boids.push({
			x: CENTER_X + Math.cos(angle) * radius * RADIUS_X,
			y: 50 + Math.sin(angle) * radius * RADIUS_Y,
			vx: Math.cos(heading) * MAX_SPEED * 0.7,
			vy: Math.sin(heading) * MAX_SPEED * 0.7,
		});
	}
	return boids;
}

/**
 * One simulation tick, mutating `boids` in place. Textbook flocking
 * (separation 1.5 / alignment 0.55 / cohesion 0.45) + soft elliptical
 * containment (mills in place instead of flying off) + jitter and a
 * min-speed floor (the two things that keep it looping forever without
 * ever parking).
 */
function step(boids: Boid[], dt: number): void {
	"worklet";
	// steer(desired direction) = clamp(norm(dir)·MAX − vel, FORCE)
	function steer(
		boid: Boid,
		towardX: number,
		towardY: number,
		acc: [number, number],
		weight: number,
	) {
		const magnitude = Math.hypot(towardX, towardY);
		if (magnitude < 1e-6) return;
		let dx = (towardX / magnitude) * MAX_SPEED - boid.vx;
		let dy = (towardY / magnitude) * MAX_SPEED - boid.vy;
		const force = Math.hypot(dx, dy);
		if (force > MAX_FORCE) {
			dx = (dx / force) * MAX_FORCE;
			dy = (dy / force) * MAX_FORCE;
		}
		acc[0] += dx * weight;
		acc[1] += dy * weight;
	}

	const acc: [number, number] = [0, 0];
	for (const boid of boids) {
		let sepX = 0;
		let sepY = 0;
		let alignX = 0;
		let alignY = 0;
		let cohX = 0;
		let cohY = 0;
		let neighbors = 0;
		for (const other of boids) {
			if (other === boid) continue;
			const dx = boid.x - other.x;
			const dy = boid.y - other.y;
			const distance = Math.hypot(dx, dy);
			if (distance > R_NEIGHBOR || distance < 1e-6) continue;
			neighbors += 1;
			if (distance < R_SEPARATION) {
				sepX += dx / (distance * distance);
				sepY += dy / (distance * distance);
			}
			alignX += other.vx;
			alignY += other.vy;
			cohX += other.x;
			cohY += other.y;
		}
		acc[0] = 0;
		acc[1] = 0;
		if (neighbors > 0) {
			if (sepX !== 0 || sepY !== 0) steer(boid, sepX, sepY, acc, 1.5);
			steer(boid, alignX / neighbors, alignY / neighbors, acc, 0.55);
			steer(
				boid,
				cohX / neighbors - boid.x,
				cohY / neighbors - boid.y,
				acc,
				0.45,
			);
		}
		// Soft elliptical containment — mills in place instead of flying off.
		const homeX = CENTER_X - boid.x;
		const homeY = 50 - boid.y;
		const homeDistance = Math.hypot(homeX, homeY);
		const eccentric = Math.hypot(homeX / RADIUS_X, homeY / RADIUS_Y);
		if (eccentric > 1 && homeDistance > 1e-3) {
			const pull = (eccentric - 1) * homeDistance * 0.9;
			acc[0] += (homeX / homeDistance) * MAX_FORCE * 0.16 * pull;
			acc[1] += (homeY / homeDistance) * MAX_FORCE * 0.16 * pull;
		}
		// Jitter — keeps the flock from settling into equilibrium.
		acc[0] += (Math.random() - 0.5) * 170;
		acc[1] += (Math.random() - 0.5) * 170;

		// Integrate, clamp speed to [MIN, MAX], bounce off hard walls.
		boid.vx += acc[0] * dt;
		boid.vy += acc[1] * dt;
		const speed = Math.hypot(boid.vx, boid.vy) || 1e-6;
		const clamp =
			speed > MAX_SPEED
				? MAX_SPEED / speed
				: speed < MIN_SPEED
					? MIN_SPEED / speed
					: 1;
		boid.vx *= clamp;
		boid.vy *= clamp;
		boid.x += boid.vx * dt;
		boid.y += boid.vy * dt;
		if (boid.x < 2) {
			boid.x = 2;
			boid.vx = Math.abs(boid.vx);
		}
		if (boid.x > WORLD_W - 2) {
			boid.x = WORLD_W - 2;
			boid.vx = -Math.abs(boid.vx);
		}
		if (boid.y < 2) {
			boid.y = 2;
			boid.vy = Math.abs(boid.vy);
		}
		if (boid.y > 98) {
			boid.y = 98;
			boid.vy = -Math.abs(boid.vy);
		}
	}
}

function Dot({
	boids,
	index,
	color,
}: {
	boids: SharedValue<Boid[]>;
	index: number;
	color: string;
}) {
	const style = useAnimatedStyle(() => {
		const boid = boids.value[index];
		if (boid === undefined) return { opacity: 0 };
		// Speed-fade: current speed → alpha 0.2..0.9 (why it reads as activity).
		const speed = Math.hypot(boid.vx, boid.vy);
		const normalized = Math.min(
			1,
			Math.max(0, (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)),
		);
		return {
			opacity: 0.9 * (0.22 + 0.78 * normalized),
			transform: [
				{ translateX: boid.x * SCALE - DOT_RADIUS },
				{ translateY: boid.y * SCALE - DOT_RADIUS },
			],
		};
	}, [boids, index]);

	return (
		<Animated.View
			style={[
				{
					backgroundColor: color,
					borderRadius: DOT_RADIUS,
					height: DOT_RADIUS * 2,
					left: 0,
					position: "absolute",
					top: 0,
					width: DOT_RADIUS * 2,
				},
				style,
			]}
		/>
	);
}

const DOT_KEYS = Array.from(
	{ length: BOID_COUNT },
	(_, index) => `boid-${index}`,
);

/**
 * The "agent is working" indicator: a caret-sized flock of boids in place
 * of typing dots. Deliberately no card, border, spinner, or label — the
 * milling flock is the whole signal.
 */
export function TypingIndicator() {
	const theme = useTheme();
	const initial = useMemo(() => {
		const boids = makeBoids();
		for (let tick = 0; tick < SETTLE_STEPS; tick += 1) step(boids, 1 / 60);
		return boids;
	}, []);
	const boids = useSharedValue<Boid[]>(initial);

	useFrameCallback((frame) => {
		const dt = Math.min(
			0.05,
			(frame.timeSincePreviousFrame ?? 1_000 / 60) / 1_000,
		);
		const next = boids.value.map((boid) => ({ ...boid }));
		step(next, dt);
		boids.value = next;
	});

	return (
		<View
			accessibilityLabel="Agent is working"
			className="px-1 py-2"
			style={{ height: BOX_H + 16 }}
		>
			<View style={{ height: BOX_H, width: BOX_W }}>
				{DOT_KEYS.map((key, index) => (
					<Dot boids={boids} color={theme.foreground} index={index} key={key} />
				))}
			</View>
		</View>
	);
}
