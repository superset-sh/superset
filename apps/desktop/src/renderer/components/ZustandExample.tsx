import { useCount, useExampleStore, useText } from "renderer/stores";

/**
 * Example component demonstrating Zustand usage patterns
 *
 * This component shows:
 * 1. Using selector hooks for optimized re-renders
 * 2. Accessing actions from the store
 * 3. Direct store access for multiple values
 */
export function ZustandExample() {
	// Optimized selectors - only re-renders when specific values change
	const count = useCount();
	const text = useText();

	// Access actions directly from the store
	const increment = useExampleStore((state) => state.increment);
	const decrement = useExampleStore((state) => state.decrement);
	const setText = useExampleStore((state) => state.setText);
	const reset = useExampleStore((state) => state.reset);

	return (
		<div className="p-4 space-y-4">
			<h2 className="text-xl font-bold">Zustand Example</h2>

			{/* Counter Example */}
			<div className="space-y-2">
				<p className="font-semibold">Counter: {count}</p>
				<div className="space-x-2">
					<button
						type="button"
						onClick={increment}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
					>
						Increment
					</button>
					<button
						type="button"
						onClick={decrement}
						className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
					>
						Decrement
					</button>
				</div>
			</div>

			{/* Text Input Example */}
			<div className="space-y-2">
				<p className="font-semibold">Text: {text}</p>
				<input
					type="text"
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="Type something..."
					className="px-3 py-2 border rounded w-full"
				/>
			</div>

			{/* Reset Button */}
			<button
				type="button"
				onClick={reset}
				className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
			>
				Reset All
			</button>
		</div>
	);
}
