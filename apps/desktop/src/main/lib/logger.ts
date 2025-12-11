/**
 * Logging utility for the desktop application
 * 
 * Provides structured logging with different levels and context
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
	[key: string]: unknown;
}

class Logger {
	private isDevelopment = process.env.NODE_ENV === "development";
	private isTest = process.env.NODE_ENV === "test";

	/**
	 * Format a log message with context
	 */
	private formatMessage(
		level: LogLevel,
		module: string,
		message: string,
		context?: LogContext,
	): string {
		const timestamp = new Date().toISOString();
		const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;
		const contextStr = context
			? `\n${JSON.stringify(context, null, 2)}`
			: "";
		return `${prefix} ${message}${contextStr}`;
	}

	/**
	 * Log a debug message (only in development)
	 */
	debug(module: string, message: string, context?: LogContext): void {
		if (!this.isDevelopment || this.isTest) return;
		console.debug(this.formatMessage("debug", module, message, context));
	}

	/**
	 * Log an info message
	 */
	info(module: string, message: string, context?: LogContext): void {
		if (this.isTest) return;
		console.log(this.formatMessage("info", module, message, context));
	}

	/**
	 * Log a warning message
	 */
	warn(module: string, message: string, context?: LogContext): void {
		if (this.isTest) return;
		console.warn(this.formatMessage("warn", module, message, context));
	}

	/**
	 * Log an error message
	 */
	error(module: string, message: string, error?: Error | unknown, context?: LogContext): void {
		if (this.isTest) return;
		
		const errorContext = {
			...context,
			error: error instanceof Error ? {
				name: error.name,
				message: error.message,
				stack: error.stack,
			} : error,
		};
		
		console.error(this.formatMessage("error", module, message, errorContext));
	}

	/**
	 * Create a module-specific logger
	 */
	module(moduleName: string) {
		return {
			debug: (message: string, context?: LogContext) =>
				this.debug(moduleName, message, context),
			info: (message: string, context?: LogContext) =>
				this.info(moduleName, message, context),
			warn: (message: string, context?: LogContext) =>
				this.warn(moduleName, message, context),
			error: (message: string, error?: Error | unknown, context?: LogContext) =>
				this.error(moduleName, message, error, context),
		};
	}
}

export const logger = new Logger();

/**
 * Create a module-specific logger instance
 * 
 * @example
 * const log = createModuleLogger('terminal-manager');
 * log.info('Terminal created', { paneId });
 * log.error('Failed to create terminal', error, { paneId });
 */
export function createModuleLogger(moduleName: string) {
	return logger.module(moduleName);
}
