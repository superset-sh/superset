import { terminalOutputFilterChain } from "../terminal-output-filter";
import { oscResponseFilter } from "./osc-response-filter";

export function registerDefaultFilters(): void {
	terminalOutputFilterChain.register(oscResponseFilter);
}

export { oscResponseFilter };
