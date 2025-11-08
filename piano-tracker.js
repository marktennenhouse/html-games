/**
 * Piano Skill Tracker - Game Integration Library
 *
 * Lightweight tracking library for vanilla JavaScript piano games
 * Features:
 * - Zero dependencies
 * - Async, non-blocking
 * - Batch mode for high-frequency games
 * - Fire-and-forget pattern
 * - ~4KB minified
 *
 * Usage:
 *   const tracker = new PianoTracker('https://api.example.com', userId, gameId);
 *   await tracker.startSession(progressionKeyId);
 *   await tracker.trackNote(noteId, playedId, timeMs, position, 'right');
 *   await tracker.trackChord(chordId, playedId, timeMs, position, 'both');
 *   await tracker.endSession(score, successes, errors);
 */

class PianoTracker {
    /**
     * Create a new tracker instance
     * @param {string} apiBaseUrl - Base URL of the tracking API
     * @param {number} userId - User ID
     * @param {number} gameId - Game ID
     * @param {Object} options - Optional configuration
     * @param {boolean} options.batchMode - Enable batching for high-frequency games
     * @param {number} options.batchSize - Number of events per batch (default: 10)
     * @param {number} options.batchTimeout - Max time to wait before flushing (ms, default: 2000)
     * @param {boolean} options.debug - Enable debug logging
     */
    constructor(apiBaseUrl, userId, gameId, options = {}) {
        this.apiUrl = apiBaseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.userId = userId;
        this.gameId = gameId;
        this.sessionId = null;
        this.lastChordId = null;
        this.lastChordTime = null;

        // Performance options
        this.batchMode = options.batchMode || false;
        this.batchSize = options.batchSize || 10;
        this.batchTimeout = options.batchTimeout || 2000;
        this.debug = options.debug || false;

        // Batch queue
        this.eventQueue = [];
        this.batchTimer = null;

        // Statistics
        this.stats = {
            eventsSent: 0,
            batchesSent: 0,
            errors: 0
        };
    }

    /**
     * Start a new game session
     * @param {number} progressionKeyId - The progression-key combination being practiced
     * @returns {Promise<number>} Session ID
     */
    async startSession(progressionKeyId) {
        try {
            this.log('Starting session...', { progressionKeyId });

            const response = await fetch(`${this.apiUrl}/api/sessions/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: this.userId,
                    gameId: this.gameId,
                    progressionKeyId: progressionKeyId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.sessionId = data.sessionId;
            this.lastChordId = null;
            this.lastChordTime = Date.now();

            this.log('Session started', { sessionId: this.sessionId });
            return this.sessionId;

        } catch (err) {
            this.handleError('Failed to start session', err);
            return null;
        }
    }

    /**
     * Track a single note event (for Foundation/Pre-Beginner levels)
     * @param {number} expectedNoteId - Expected note/chord ID
     * @param {number|null} playedNoteId - Actual note/chord ID played
     * @param {number} responseTimeMs - Time to respond in milliseconds
     * @param {number} position - Position in progression (1-based)
     * @param {string} hand - 'left', 'right', or 'both'
     * @returns {Promise<void>}
     */
    async trackNote(expectedNoteId, playedNoteId, responseTimeMs, position, hand = 'right') {
        return this.trackEvent(expectedNoteId, playedNoteId, responseTimeMs, position, hand);
    }

    /**
     * Track a chord event (for Beginner+ levels)
     * @param {number} expectedChordId - Expected chord ID
     * @param {number|null} playedChordId - Actual chord ID played
     * @param {number} responseTimeMs - Time to respond in milliseconds
     * @param {number} position - Position in progression (1-based)
     * @param {string} hand - 'left', 'right', or 'both'
     * @returns {Promise<void>}
     */
    async trackChord(expectedChordId, playedChordId, responseTimeMs, position, hand = 'both') {
        return this.trackEvent(expectedChordId, playedChordId, responseTimeMs, position, hand);
    }

    /**
     * Internal: Track any event (note or chord)
     * @private
     */
    async trackEvent(expectedId, playedId, responseTimeMs, position, hand) {
        if (!this.sessionId) {
            this.log('Warning: No active session, event not tracked');
            return;
        }

        const event = {
            sessionId: this.sessionId,
            expectedChordId: expectedId,
            playedChordId: playedId,
            isCorrect: expectedId === playedId && expectedId !== null && playedId !== null,
            responseTimeMs: responseTimeMs,
            positionInProgression: position,
            handUsed: hand,
            transitionFromChordId: this.lastChordId
        };

        this.log('Tracking event', event);

        if (this.batchMode) {
            this.queueEvent(event);
        } else {
            this.sendEvent(event);
        }

        this.lastChordId = playedId;
        this.lastChordTime = Date.now();
    }

    /**
     * Queue event for batching
     * @private
     */
    queueEvent(event) {
        this.eventQueue.push(event);

        this.log(`Event queued (${this.eventQueue.length}/${this.batchSize})`);

        // Flush if batch is full
        if (this.eventQueue.length >= this.batchSize) {
            this.flushQueue();
        }
        // Set timer to flush after timeout
        else if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => this.flushQueue(), this.batchTimeout);
        }
    }

    /**
     * Flush queued events to server
     * @private
     */
    async flushQueue() {
        if (this.eventQueue.length === 0) return;

        clearTimeout(this.batchTimer);
        this.batchTimer = null;

        const batch = [...this.eventQueue];
        this.eventQueue = [];

        this.log(`Flushing batch of ${batch.length} events`);

        try {
            const response = await fetch(`${this.apiUrl}/api/events/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: batch })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.stats.batchesSent++;
            this.stats.eventsSent += batch.length;
            this.log('Batch sent successfully', { batchesSent: this.stats.batchesSent });

        } catch (err) {
            this.handleError('Batch send failed (non-critical)', err);
            // Events are lost, but game continues
        }
    }

    /**
     * Send single event immediately (fire-and-forget)
     * @private
     */
    sendEvent(event) {
        fetch(`${this.apiUrl}/api/events/chord`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
        })
            .then(response => {
                if (response.ok) {
                    this.stats.eventsSent++;
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            })
            .catch(err => {
                this.handleError('Event send failed (non-critical)', err);
            });
    }

    /**
     * End the current session
     * @param {number} finalScore - Final game score
     * @param {number} successCount - Number of successful attempts
     * @param {number} errorCount - Number of errors
     * @returns {Promise<void>}
     */
    async endSession(finalScore, successCount, errorCount) {
        if (!this.sessionId) {
            this.log('Warning: No active session to end');
            return;
        }

        // Flush any pending batched events first
        if (this.batchMode && this.eventQueue.length > 0) {
            this.log('Flushing remaining events before ending session');
            await this.flushQueue();
        }

        try {
            this.log('Ending session...', { sessionId: this.sessionId });

            const response = await fetch(`${this.apiUrl}/api/sessions/end`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    finalScore: finalScore,
                    successCount: successCount,
                    errorCount: errorCount
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.log('Session ended successfully', this.stats);

        } catch (err) {
            this.handleError('Failed to end session', err);
        } finally {
            this.sessionId = null;
            this.lastChordId = null;
        }
    }

    /**
     * Get current tracking statistics
     * @returns {Object} Stats object with eventsSent, batchesSent, errors
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset tracking statistics
     */
    resetStats() {
        this.stats = {
            eventsSent: 0,
            batchesSent: 0,
            errors: 0
        };
    }

    /**
     * Internal error handler
     * @private
     */
    handleError(message, error) {
        this.stats.errors++;
        console.error(`[PianoTracker] ${message}:`, error);
    }

    /**
     * Internal debug logger
     * @private
     */
    log(message, data = null) {
        if (this.debug) {
            console.log(`[PianoTracker] ${message}`, data || '');
        }
    }
}

// Export for both module and global use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PianoTracker;
} else if (typeof window !== 'undefined') {
    window.PianoTracker = PianoTracker;
}


