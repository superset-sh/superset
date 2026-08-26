/**
 * One id per renderer process (= per window). The main-process manager keys
 * each window's wanted forwards by it, and drops them when the window's
 * subscription tears down.
 */
export const portForwardClientId = crypto.randomUUID();
