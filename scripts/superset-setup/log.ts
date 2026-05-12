const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[0;33m";
const NC = "\x1b[0m";

export class SetupReporter {
	readonly failedSteps: string[] = [];
	readonly skippedSteps: string[] = [];

	error(message: string): void {
		console.error(`${RED}x${NC} ${message}`);
	}

	success(message: string): void {
		console.log(`${GREEN}ok${NC} ${message}`);
	}

	warn(message: string): void {
		console.warn(`${YELLOW}!${NC} ${message}`);
	}

	stepFailed(step: string): void {
		this.failedSteps.push(step);
	}

	stepSkipped(step: string): void {
		this.skippedSteps.push(step);
	}

	printSummary(title: string): boolean {
		console.log("");
		console.log("----------------------------------------");
		console.log(`${title} Summary`);
		console.log("----------------------------------------");

		if (this.failedSteps.length === 0 && this.skippedSteps.length === 0) {
			console.log(`${GREEN}All steps completed successfully!${NC}`);
		} else {
			if (this.skippedSteps.length > 0) {
				console.log(`${YELLOW}Skipped steps:${NC}`);
				for (const step of this.skippedSteps) {
					console.log(`  - ${step}`);
				}
			}
			if (this.failedSteps.length > 0) {
				console.log(`${RED}Failed steps:${NC}`);
				for (const step of this.failedSteps) {
					console.log(`  - ${step}`);
				}
			}
		}

		console.log("----------------------------------------");
		return this.failedSteps.length === 0;
	}
}
