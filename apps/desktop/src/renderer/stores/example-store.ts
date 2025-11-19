import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Example store demonstrating Zustand usage patterns
 *
 * Features:
 * - TypeScript type safety
 * - DevTools integration for debugging
 * - Optional persistence (commented out by default)
 */

interface ExampleState {
	// State
	count: number;
	text: string;

	// Actions
	increment: () => void;
	decrement: () => void;
	setText: (text: string) => void;
	reset: () => void;
}

const initialState = {
	count: 0,
	text: "",
};

export const useExampleStore = create<ExampleState>()(
	devtools(
		// Uncomment persist middleware if you need localStorage persistence
		// persist(
		(set) => ({
			...initialState,

			increment: () => set((state) => ({ count: state.count + 1 })),
			decrement: () => set((state) => ({ count: state.count - 1 })),
			setText: (text: string) => set({ text }),
			reset: () => set(initialState),
		}),
		// 	{
		// 		name: "example-store", // localStorage key
		// 	}
		// ),
		{
			name: "ExampleStore", // DevTools name
		},
	),
);

// Selectors for optimized re-renders
export const useCount = () => useExampleStore((state) => state.count);
export const useText = () => useExampleStore((state) => state.text);
