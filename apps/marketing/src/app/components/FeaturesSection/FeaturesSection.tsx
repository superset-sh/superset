"use client";

import { FeatureDemo } from "./components/FeatureDemo";
import { IsolationDemo } from "./components/IsolationDemo";
import { OpenInDemo } from "./components/OpenInDemo";
import { ParallelExecutionDemo } from "./components/ParallelExecutionDemo";
import { UniversalCompatibilityDemo } from "./components/UniversalCompatibilityDemo";
import { FEATURES } from "./constants";

const DEMO_COMPONENTS = [
	ParallelExecutionDemo,
	UniversalCompatibilityDemo,
	IsolationDemo,
	OpenInDemo,
];

export function FeaturesSection() {
	return (
		<section className="relative py-24 sm:py-32">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				{/* Feature Rows */}
				<div className="space-y-24 sm:space-y-32">
					{FEATURES.map((feature, index) => {
						const isReversed = index % 2 === 1;
						const DemoComponent = DEMO_COMPONENTS[index];
						return (
							<div
								key={feature.title}
								className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center"
							>
								{/* Text Content */}
								<div
									className={`space-y-6 ${isReversed ? "lg:order-2" : "lg:order-1"}`}
								>
									<div className="space-y-4">
										<span className="text-sm font-mono uppercase tracking-widest text-brand">
											{feature.tag}
										</span>
										<h3 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
											{feature.title}
										</h3>
									</div>
									<p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-[500px]">
										{feature.description}
									</p>
								</div>

								{/* Demo */}
								<div className={`${isReversed ? "lg:order-1" : "lg:order-2"}`}>
									<FeatureDemo colors={feature.colors}>
										{DemoComponent && <DemoComponent />}
									</FeatureDemo>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
