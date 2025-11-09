import { TEXT_CONFIG } from "./config";

/**
 * Helper function to calculate glare properties based on elapsed time
 */
export function calculateGlareProperties(
	startTime: number | null,
	currentTime: number,
): { isActive: boolean; lightX: number; lightY: number; intensity: number } {
	if (!startTime) {
		return { isActive: false, lightX: 0, lightY: 0, intensity: 0 };
	}

	const totalElapsed = (currentTime - startTime) / 1000; // Convert to seconds
	const cycleTime = TEXT_CONFIG.GLARE_DURATION + TEXT_CONFIG.GLARE_INTERVAL;

	// Calculate which cycle we're in and time within that cycle
	const timeInCycle = totalElapsed % cycleTime;
	const duration = TEXT_CONFIG.GLARE_DURATION;

	// Check if we're in the active glare portion of the cycle
	if (timeInCycle > duration) {
		return { isActive: false, lightX: 0, lightY: 0, intensity: 0 };
	}

	// Calculate progress (0 to 1) within the glare animation
	const progress = timeInCycle / duration;

	// Smooth ease-in-out for light movement
	const easeProgress = (1 - Math.cos(progress * Math.PI)) / 2;

	// Calculate light position - sweep from left to right across the symbol
	const lightX =
		TEXT_CONFIG.GLARE_START_X +
		easeProgress * (TEXT_CONFIG.GLARE_END_X - TEXT_CONFIG.GLARE_START_X);
	const lightY = TEXT_CONFIG.GLARE_Y;

	// Intensity peaks when light is over the symbol (center)
	const distanceFromCenter = Math.abs(lightX);
	const maxDistance = Math.abs(TEXT_CONFIG.GLARE_START_X);
	const intensityMultiplier = 1 - Math.min(distanceFromCenter / maxDistance, 1);
	const intensity = intensityMultiplier * TEXT_CONFIG.GLARE_LIGHT_INTENSITY;

	return { isActive: true, lightX, lightY, intensity };
}
