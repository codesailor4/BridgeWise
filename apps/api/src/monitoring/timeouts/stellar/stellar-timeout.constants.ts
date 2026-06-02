/** Warn when a transfer has been pending/in-progress for 2 minutes */
export const DEFAULT_WARNING_THRESHOLD_MS = 2 * 60 * 1000;

/** Mark as timed-out after 5 minutes without completion */
export const DEFAULT_CRITICAL_THRESHOLD_MS = 5 * 60 * 1000;

/** How often the background scanner runs (every 30 seconds) */
export const SCAN_INTERVAL_CRON = '*/30 * * * * *';

/** Maximum number of completed/failed transfers to keep in memory */
export const MAX_RESOLVED_HISTORY = 200;

/** Event name emitted when a timeout is detected */
export const TIMEOUT_DETECTED_EVENT = 'stellar.transfer.timeout';

/** Event name emitted when a transfer completes */
export const TRANSFER_COMPLETED_EVENT = 'stellar.transfer.completed';
