/**
 * Logger function type that accepts any number of arguments.
 */
export type Logger = (...args: unknown[]) => void;

/**
 * Creates a console logger that only prints when enabled.
 * @param {boolean} enabled - Whether logging is enabled.
 * @returns {Logger} Conditional logger function.
 */
export const createDebugLogger = (enabled: boolean): Logger => {
    if (!enabled) {
        return () => {};
    }
    return (...args: unknown[]) => {
        const timestamp = new Date().toTimeString().split(' ')[0];
        console.log(`${timestamp}`, ...args);
    };
};

/**
 * Creates a console error logger that is always enabled.
 * @returns {Logger} Error logger function.
 */
export const createErrorLogger = (): Logger => {
    return (...args: unknown[]) => {
        const timestamp = new Date().toTimeString().split(' ')[0];
        console.error(`${timestamp}`, ...args);
    };
};
