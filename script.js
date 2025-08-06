/*
 * Tennis Scorekeeper
 *
 * This script provides the core logic for a modern, user friendly tennis
 * scorekeeping application. Built with Vue 3, the application manages
 * matches, players, scoring, statistics and match history. The original
 * monolithic JavaScript implementation has been replaced with a reactive
 * component that cleanly separates state, derived data and actions.
 *
 * Major features include:
 *   • A home screen listing previous matches stored in localStorage.
 *   • A simple setup form to start new matches with tournament, date,
 *     court, player names, format and first server selection.
 *   • A live scoreboard displaying set and point scores. Controls allow
 *     recording a point, undoing the last point, ending the match early,
 *     toggling statistics and reviewing completed sets.
 *   • A serve modal for capturing serve outcomes and point endings. The
 *     modal walks the user through first serve, second serve (if needed)
 *     and final shot selection, handling aces, double faults, winners and
 *     unforced errors automatically.
 *   • A statistics panel calculating first/second serve percentages,
 *     aces, double faults, winners and unforced errors based on the
 *     recorded points.
 *   • A lightweight set review modal summarising completed sets and the
 *     current set in progress.
 *   • An end match modal to finalise matches early with a reason and
 *     optional notes.
 *
 * The application stores up to 50 matches in localStorage. Completed
 * matches are marked as such and remain in the history for review. In
 *‑progress matches can be resumed exactly where you left off.
 */

const { createApp, reactive, computed, watch } = Vue;

createApp({
    data() {
        return {
            // Application stage: 'review' (home), 'setup' (new match), 'match' (active scoreboard)
            stage: 'review',
            // List of stored matches loaded from localStorage
            matches: [],
            // Match start type: 'new' or 'join'
            matchStartType: 'new',
            // Form model for starting a new match
            newMatch: {
                tournament: '',
                date: '',
                court: '',
                player1: 'Player 1',
                player2: 'Player 2',
                matchFormat: 3,
                firstServer: 1
            },
            // Form model for joining a match in progress
            joinMatch: {
                tournament: '',
                date: '',
                court: '',
                player1: 'Player 1',
                player2: 'Player 2',
                matchFormat: 3,
                setScores: [
                    { p1: 0, p2: 0 },
                    { p1: 0, p2: 0 },
                    { p1: 0, p2: 0 },
                    { p1: 0, p2: 0 },
                    { p1: 0, p2: 0 }
                ],
                currentPoints: { p1: 0, p2: 0 },
                currentServer: 1
            },
            // The currently active match object. Set to null until a match is started or loaded.
            match: null,
            // Modal state for recording serve outcomes and point endings
            serveModal: {
                visible: false,
                firstServe: '',
                secondServe: '',
                finalPlayer: null,
                strokeType: '',
                comment: ''
            },
            // Flag to show/hide the statistics panel
            statsVisible: false,
            // Flag to show/hide the set review modal
            setReviewVisible: false,
            // End match modal state
            endMatchModal: {
                visible: false,
                reason: 'completed',
                winner: null,
                notes: ''
            }
        };
    },
    computed: {
        /**
         * Returns the maximum number of sets supported (always 5). We use
         * this value to generate table headers and iterate over sets in the
         * scoreboard template. Only the first match.matchFormat sets will be
         * displayed.
         */
        maxSets() {
            return 5;
        },
        /**
         * Computes the text displayed for the serving indicator. Shows
         * which player is currently serving and handles the case where the
         * match has finished.
         */
        servingIndicator() {
            if (!this.match) return '';
            if (this.match.matchComplete) return 'Match finished';
            return `${this.match.players[this.match.server].name} serving`;
        },
        /**
         * Returns the name of the player who has won the match (if the
         * match is complete). If no match is active or the match is still
         * in progress, returns an empty string.
         */
        winner() {
            if (!this.match || !this.match.matchComplete) return '';
            // Determine winner by comparing sets won
            const setsWon1 = this.match.players[1].sets.reduce((s, v) => s + (v ? 1 : 0), 0);
            const setsWon2 = this.match.players[2].sets.reduce((s, v) => s + (v ? 1 : 0), 0);
            return setsWon1 > setsWon2 ? this.match.players[1].name : this.match.players[2].name;
        }
    },
    methods: {
        /**
         * Format a date string (yyyy‑mm‑dd) into a more friendly
         * locale‑specific format. The user locale is used automatically.
         */
        formatDate(dateStr) {
            if (!dateStr) return '';
            try {
                const d = new Date(dateStr);
                return d.toLocaleDateString();
            } catch (e) {
                return dateStr;
            }
        },
        /**
         * Convert an array of final set scores into a string like
         * "6-4 6-3". If no sets are provided returns an empty string.
         */
        formatSetScores(sets) {
            if (!sets || sets.length === 0) return '';
            return sets.map(s => `${s.p1}-${s.p2}`).join(' ');
        },
        /**
         * Navigate to the match setup screen. Also initialises
         * newMatch.date to today if not already set.
         */
        newMatchScreen() {
            const today = new Date().toISOString().split('T')[0];
            this.newMatch.date = this.newMatch.date || today;
            this.joinMatch.date = this.joinMatch.date || today;
            this.matchStartType = 'new';
            this.stage = 'setup';
        },
        /**
         * Load matches from localStorage. Only the latest 50 entries are kept.
         */
        loadMatches() {
            const raw = localStorage.getItem('tennis-scorekeeper-matches');
            if (raw) {
                try {
                    this.matches = JSON.parse(raw) || [];
                } catch (e) {
                    this.matches = [];
                }
            }
        },
        /**
         * Persist the current matches list back to localStorage.
         */
        saveMatches() {
            localStorage.setItem('tennis-scorekeeper-matches', JSON.stringify(this.matches.slice(0, 50)));
        },
        /**
         * Reset the application state to start a new match from scratch.
         * This clears the current match and returns to the setup screen. The
         * user is asked for confirmation before discarding the current state.
         */
        resetMatch() {
            if (this.match && !this.match.matchComplete) {
                if (!confirm('This will abandon the current match. Are you sure?')) {
                    return;
                }
            }
            this.match = null;
            this.statsVisible = false;
            this.setReviewVisible = false;
            this.endMatchModal.visible = false;
            this.stage = 'setup';
        },
        /**
         * Create a brand new match object based on the setup form. This
         * function initialises all of the nested objects required for
         * scoring and statistics.
         */
        createMatch() {
            const id = Date.now();
            // Initialise players with names, set and game counters, point
            // counters and statistics buckets.
            const players = {
                1: {
                    name: this.newMatch.player1 || 'Player 1',
                    sets: [0, 0, 0, 0, 0],
                    games: 0,
                    points: 0,
                    stats: {
                        firstServeTotal: 0,
                        firstServeIn: 0,
                        firstServeWon: 0,
                        secondServeAttempts: 0,
                        secondServeWon: 0,
                        aces: 0,
                        doubleFaults: 0,
                        winners: 0,
                        unforcedErrors: 0
                    }
                },
                2: {
                    name: this.newMatch.player2 || 'Player 2',
                    sets: [0, 0, 0, 0, 0],
                    games: 0,
                    points: 0,
                    stats: {
                        firstServeTotal: 0,
                        firstServeIn: 0,
                        firstServeWon: 0,
                        secondServeAttempts: 0,
                        secondServeWon: 0,
                        aces: 0,
                        doubleFaults: 0,
                        winners: 0,
                        unforcedErrors: 0
                    }
                }
            };
            return {
                id: id,
                tournament: this.newMatch.tournament.trim(),
                date: this.newMatch.date,
                court: this.newMatch.court.trim(),
                players: players,
                currentSet: 0,
                server: this.newMatch.firstServer,
                matchFormat: this.newMatch.matchFormat,
                matchComplete: false,
                setScores: [],
                pointHistory: [],
                // tracks which player should serve the next game
                gameStartServer: this.newMatch.firstServer,
                // local state preserved for in progress matches
                isInProgress: true,
                // Additional metadata for review
                winner: null,
                finalSets: []
            };
        },
        /**
         * Starts a new match based on the setup form. The new match is
         * initialised and the scoreboard is displayed. A match ID is
         * generated based on the current timestamp.
         */
        startMatch() {
            // Validate form – ensure players are named
            if (!this.newMatch.player1.trim() || !this.newMatch.player2.trim()) {
                alert('Please enter names for both players.');
                return;
            }
            // Create the match object
            this.match = this.createMatch();
            // Hide any previous modals
            this.statsVisible = false;
            this.setReviewVisible = false;
            this.endMatchModal.visible = false;
            // Show scoreboard
            this.stage = 'match';
        },
        /**
         * Join an existing match by setting up the match state based on
         * the current score and game situation provided in the join form.
         */
        startJoinMatch() {
            // Validate form – ensure players are named
            if (!this.joinMatch.player1.trim() || !this.joinMatch.player2.trim()) {
                alert('Please enter names for both players.');
                return;
            }
            
            // Create base match structure
            this.match = this.createJoinMatch();
            
            // Calculate current set and games based on set scores
            this.calculateMatchStateFromScores();
            
            // Hide any previous modals
            this.statsVisible = false;
            this.setReviewVisible = false;
            this.endMatchModal.visible = false;
            
            // Show scoreboard
            this.stage = 'match';
        },
        /**
         * Create a match object for joining a match in progress.
         * Similar to createMatch but uses joinMatch data.
         */
        createJoinMatch() {
            const id = Date.now();
            // Initialise players with names from join form
            const players = {
                1: {
                    name: this.joinMatch.player1.trim(),
                    sets: [0, 0, 0, 0, 0],
                    games: 0,
                    points: this.joinMatch.currentPoints.p1,
                    stats: {
                        firstServeTotal: 0,
                        firstServeIn: 0,
                        firstServeWon: 0,
                        secondServeAttempts: 0,
                        secondServeWon: 0,
                        aces: 0,
                        doubleFaults: 0,
                        winners: 0,
                        unforcedErrors: 0
                    }
                },
                2: {
                    name: this.joinMatch.player2.trim(),
                    sets: [0, 0, 0, 0, 0],
                    games: 0,
                    points: this.joinMatch.currentPoints.p2,
                    stats: {
                        firstServeTotal: 0,
                        firstServeIn: 0,
                        firstServeWon: 0,
                        secondServeAttempts: 0,
                        secondServeWon: 0,
                        aces: 0,
                        doubleFaults: 0,
                        winners: 0,
                        unforcedErrors: 0
                    }
                }
            };
            return {
                id: id,
                tournament: this.joinMatch.tournament.trim(),
                date: this.joinMatch.date,
                court: this.joinMatch.court.trim(),
                players: players,
                currentSet: 0, // Will be calculated
                server: this.joinMatch.currentServer,
                matchFormat: this.joinMatch.matchFormat,
                matchComplete: false,
                setScores: [],
                pointHistory: [],
                gameStartServer: this.joinMatch.currentServer,
                isInProgress: true,
                winner: null,
                finalSets: []
            };
        },
        /**
         * Calculate the current match state (sets won, current set, games)
         * based on the set scores entered in the join form.
         */
        calculateMatchStateFromScores() {
            const setScores = this.joinMatch.setScores;
            let currentSetIndex = 0;
            
            // Process completed sets
            for (let i = 0; i < Math.min(setScores.length, this.joinMatch.matchFormat); i++) {
                const set = setScores[i];
                
                // Skip empty sets
                if (set.p1 === 0 && set.p2 === 0) {
                    break;
                }
                
                // Check if this set is complete (someone won with 2+ game margin and at least 6 games)
                if (this.isSetComplete(set.p1, set.p2)) {
                    // Record completed set
                    this.match.setScores.push({
                        p1Games: set.p1,
                        p2Games: set.p2
                    });
                    
                    // Award set to winner
                    if (set.p1 > set.p2) {
                        this.match.players[1].sets[i] = 1;
                    } else {
                        this.match.players[2].sets[i] = 1;
                    }
                    
                    currentSetIndex++;
                } else {
                    // This is the current set in progress
                    this.match.players[1].games = set.p1;
                    this.match.players[2].games = set.p2;
                    break;
                }
            }
            
            this.match.currentSet = currentSetIndex;
            
            // Check if match is complete
            const setsWon1 = this.match.players[1].sets.reduce((s, v) => s + (v ? 1 : 0), 0);
            const setsWon2 = this.match.players[2].sets.reduce((s, v) => s + (v ? 1 : 0), 0);
            const needed = Math.ceil(this.match.matchFormat / 2);
            
            if (setsWon1 >= needed || setsWon2 >= needed) {
                this.match.matchComplete = true;
                this.match.winner = setsWon1 > setsWon2 ? this.match.players[1].name : this.match.players[2].name;
            }
        },
        /**
         * Check if a set is complete based on games won.
         * A set is complete if one player has at least 6 games and a 2+ game lead,
         * or if the score indicates a completed set (like 7-5, 6-4, etc.)
         */
        isSetComplete(p1Games, p2Games) {
            if (p1Games === 0 && p2Games === 0) return false;
            
            // Standard set win conditions
            if (p1Games >= 6 && (p1Games - p2Games) >= 2) return true;
            if (p2Games >= 6 && (p2Games - p1Games) >= 2) return true;
            
            // Could be a set in progress if close scores
            if (Math.abs(p1Games - p2Games) < 2 && Math.max(p1Games, p2Games) >= 6) {
                return false; // Likely still in progress
            }
            
            return false;
        },
        /**
         * Persist the current match progress and return to the home screen.
         * In‑progress matches are saved so they can be resumed later. If
         * the match has been completed it is stored as a finished match.
         */
        goHome() {
            if (!this.match) {
                this.stage = 'review';
                return;
            }
            // Save the current match state
            this.saveCurrentMatch();
            // Clear the active match and return to review
            this.match = null;
            this.statsVisible = false;
            this.setReviewVisible = false;
            this.endMatchModal.visible = false;
            this.stage = 'review';
            // Reload matches to reflect any updates
            this.loadMatches();
        },
        /**
         * Save the current match state into the matches array. If the match
         * already exists it is updated in place. Completed matches are
         * marked accordingly and contain final set scores.
         */
        saveCurrentMatch() {
            if (!this.match) return;
            // Prepare a shallow copy of the match for storage
            const copy = {
                id: this.match.id,
                date: this.match.date,
                tournament: this.match.tournament,
                court: this.match.court,
                player1: this.match.players[1].name,
                player2: this.match.players[2].name,
                format: this.match.matchFormat,
                isInProgress: !this.match.matchComplete,
                // Save final sets or current set scores as appropriate
                finalSets: this.match.matchComplete ? this.match.setScores.slice() : this.getCurrentSetScores(),
                winner: this.match.matchComplete ? this.winner : null,
                // When resuming we need enough state to restore game progress
                restoreState: this.match.matchComplete ? null : {
                    currentSet: this.match.currentSet,
                    server: this.match.server,
                    gameStartServer: this.match.gameStartServer,
                    players: JSON.parse(JSON.stringify(this.match.players)),
                    setScores: JSON.parse(JSON.stringify(this.match.setScores)),
                    pointHistory: JSON.parse(JSON.stringify(this.match.pointHistory))
                }
            };
            // Remove any existing match with the same id
            const idx = this.matches.findIndex(m => m.id === copy.id);
            if (idx >= 0) {
                this.matches.splice(idx, 1, copy);
            } else {
                this.matches.unshift(copy);
            }
            // Limit to last 50 matches
            if (this.matches.length > 50) {
                this.matches.splice(50);
            }
            this.saveMatches();
        },
        /**
         * Compute an array of current set scores to save with an in‑progress
         * match. This includes completed sets stored in match.setScores and
         * the currently active set if games have been played.
         */
        getCurrentSetScores() {
            const result = [];
            // Add completed sets
            for (let i = 0; i < this.match.setScores.length; i++) {
                result.push({
                    p1: this.match.setScores[i].p1Games,
                    p2: this.match.setScores[i].p2Games
                });
            }
            // Add current set if games exist
            if (this.match.players[1].games > 0 || this.match.players[2].games > 0) {
                result.push({
                    p1: this.match.players[1].games,
                    p2: this.match.players[2].games
                });
            }
            return result;
        },
        /**
         * Change the match format on the fly. If the format is reduced
         * (e.g. from 5 sets to 3) any existing set scores beyond the new
         * format are discarded. If the current set exceeds the new format
         * the match is flagged as complete.
         */
        changeMatchFormat() {
            if (!this.match) return;
            // Remove any set scores beyond the selected format
            if (this.match.setScores.length > this.match.matchFormat) {
                this.match.setScores.splice(this.match.matchFormat);
            }
            // If current set index exceeds new format, complete the match
            if (this.match.currentSet >= this.match.matchFormat) {
                this.match.matchComplete = true;
            }
        },
        /**
         * Display either the games for the current set or the final set
         * scores for completed sets. An empty string is returned for
         * future sets that haven't started.
         *
         * @param {number} playerId 1 or 2
         * @param {number} setIndex 0‑based index of the set
         */
        displaySetScore(playerId, setIndex) {
            if (!this.match) return '';
            // Completed set
            if (setIndex < this.match.currentSet) {
                const score = this.match.setScores[setIndex];
                if (score) {
                    return playerId === 1 ? score.p1Games : score.p2Games;
                }
                return '';
            }
            // Current set
            if (setIndex === this.match.currentSet) {
                return this.match.players[playerId].games;
            }
            // Future set
            return '';
        },
        /**
         * Convert a player's raw point count into a tennis scoring string.
         * Handles deuce and advantage. For values beyond 4 returns '40'
         * which is appropriate when displaying trailing scores during an
         * advantage game. In this simplified version no tiebreak is
         * implemented.
         *
         * @param {number} playerId 1 or 2
         * @returns {string}
         */
        pointDisplay(playerId) {
            const p1 = this.match.players[1].points;
            const p2 = this.match.players[2].points;
            const points = this.match.players[playerId].points;
            // Deuce/Advantage handling
            if (p1 >= 3 && p2 >= 3) {
                if (p1 === p2) {
                    return 'Deuce';
                }
                if ((playerId === 1 && p1 > p2) || (playerId === 2 && p2 > p1)) {
                    return 'Ad';
                }
                return '40';
            }
            // Standard mapping
            switch (points) {
                case 0: return '0';
                case 1: return '15';
                case 2: return '30';
                case 3: return '40';
                default: return '40';
            }
        },
        /**
         * Show the serve modal when a point is played. Resets the modal
         * state to allow a fresh selection of serves and final shots. If
         * the match has already finished nothing happens.
         */
        openServeModal() {
            if (!this.match || this.match.matchComplete) return;
            this.serveModal.visible = true;
            this.serveModal.firstServe = '';
            this.serveModal.secondServe = '';
            this.serveModal.finalPlayer = null;
            this.serveModal.strokeType = '';
            this.serveModal.comment = '';
        },
        /**
         * Close the serve modal without recording a point.
         */
        closeServeModal() {
            this.serveModal.visible = false;
        },
        /**
         * Determine whether a final shot selection is required. A final
         * selection is needed when the serve is "in" (returned) or after a
         * second serve that is not an ace/unreturned/double fault.
         */
        serveNeedsFinal() {
            // This method is referenced in the template, so it must be a
            // function rather than a computed property
            if (!this.serveModal.visible) return false;
            // First serve in (returned)
            if (this.serveModal.firstServe === 'in') return true;
            // First serve out and second serve in (returned)
            if (this.serveModal.firstServe === 'out' && this.serveModal.secondServe === 'in') return true;
            return false;
        },
        /**
         * Handle selection of a first serve outcome. Depending on the
         * result the point may be immediately won (ace/unreturned), move
         * on to the second serve (out) or proceed to final shot selection.
         *
         * @param {string} outcome one of 'ace', 'unreturned', 'in', 'out'
         */
        selectFirstServe(outcome) {
            this.serveModal.firstServe = outcome;
            if (outcome === 'ace' || outcome === 'unreturned') {
                // Server wins outright
                this.finalisePoint(this.match.server, { firstServe: outcome, secondServe: null }, null, this.serveModal.comment);
                this.closeServeModal();
            } else if (outcome === 'out') {
                // Show second serve selection
                // Nothing else to do here; second serve buttons become visible via template
            } else if (outcome === 'in') {
                // Proceed to point ending selection
                // This is handled by serveNeedsFinal
            }
        },
        /**
         * Handle selection of a second serve outcome. Depending on the
         * result the point may be immediately won (ace/unreturned), lost
         * (double fault) or proceed to final shot selection.
         *
         * @param {string} outcome one of 'ace', 'unreturned', 'in', 'double-fault'
         */
        selectSecondServe(outcome) {
            this.serveModal.secondServe = outcome;
            if (outcome === 'double-fault') {
                // Point to receiver
                const receiver = this.match.server === 1 ? 2 : 1;
                this.finalisePoint(receiver, { firstServe: 'out', secondServe: 'out' }, null, this.serveModal.comment);
                this.closeServeModal();
            } else if (outcome === 'ace' || outcome === 'unreturned') {
                // Server wins outright
                this.finalisePoint(this.match.server, { firstServe: 'out', secondServe: outcome }, null, this.serveModal.comment);
                this.closeServeModal();
            } else if (outcome === 'in') {
                // Proceed to point ending selection
                // Handled by serveNeedsFinal
            }
        },
        /**
         * Record which player hit the final shot during a rally. This
         * information, combined with the chosen stroke type, determines
         * whether the shot was a winner or an unforced error.
         *
         * @param {number} playerId 1 or 2
         */
        selectFinalPlayer(playerId) {
            this.serveModal.finalPlayer = playerId;
        },
        /**
         * Handle selection of the final stroke type. Once both the final
         * player and stroke type are chosen the point can be finalised.
         *
         * @param {string} stroke one of 'fh-winner', 'bh-winner', 'fh-unforced', 'bh-unforced'
         */
        selectStroke(stroke) {
            this.serveModal.strokeType = stroke;
            // Determine point winner based on stroke
            let winner;
            if (stroke.includes('winner')) {
                winner = this.serveModal.finalPlayer;
            } else {
                // Unforced error: opponent wins
                winner = this.serveModal.finalPlayer === 1 ? 2 : 1;
            }
            const serveData = {
                firstServe: this.serveModal.firstServe,
                secondServe: this.serveModal.firstServe === 'out' ? this.serveModal.secondServe : null
            };
            const pointEnding = {
                finalPlayer: this.serveModal.finalPlayer,
                strokeType: stroke
            };
            this.finalisePoint(winner, serveData, pointEnding, this.serveModal.comment);
            this.closeServeModal();
        },
        /**
         * Finalise a point by updating scores, games, sets, server and
         * statistics. A snapshot of the state before applying the point
         * is stored so the user can undo the last point if needed.
         *
         * @param {number} winner the player who won the point (1 or 2)
         * @param {object} serveData details of first and second serve
         * @param {object|null} pointEnding details of the final shot
         * @param {string} comment optional comment provided by the user
         */
        finalisePoint(winner, serveData, pointEnding, comment) {
            if (!this.match || this.match.matchComplete) return;
            // Capture the state before applying the point so it can be undone
            const before = {
                currentSet: this.match.currentSet,
                server: this.match.server,
                gameStartServer: this.match.gameStartServer,
                setScores: JSON.parse(JSON.stringify(this.match.setScores)),
                players: JSON.parse(JSON.stringify(this.match.players))
            };
            // Build the point record
            const pointRecord = {
                winner,
                server: this.match.server,
                serveData: serveData,
                pointEnding: pointEnding,
                comment: comment || '',
                before: before
            };
            // Push record to history
            this.match.pointHistory.push(pointRecord);
            // Update stats based on serve
            this.updateServeStats(pointRecord);
            // Update stats based on final shot
            this.updatePointStats(pointRecord);
            // Add point to the winner
            this.match.players[winner].points++;
            // Check for game win
            if (this.checkGameWin(winner)) {
                // Increment game count
                this.match.players[winner].games++;
                // Reset points
                this.match.players[1].points = 0;
                this.match.players[2].points = 0;
                // Move to next game: alternate server
                this.match.gameStartServer = this.match.gameStartServer === 1 ? 2 : 1;
                this.match.server = this.match.gameStartServer;
                // Check for set win
                if (this.checkSetWin(winner)) {
                    // Record final game scores for the completed set
                    this.match.setScores[this.match.currentSet] = {
                        p1Games: this.match.players[1].games,
                        p2Games: this.match.players[2].games
                    };
                    // Award set to winner
                    this.match.players[winner].sets[this.match.currentSet] = 1;
                    this.match.players[1].games = 0;
                    this.match.players[2].games = 0;
                    // Advance to next set
                    this.match.currentSet++;
                    // Reset server to first server for new set
                    this.match.server = this.match.gameStartServer;
                    // Check for match win
                    if (this.checkMatchWin(winner)) {
                        this.match.matchComplete = true;
                        this.match.winner = this.match.players[winner].name;
                        // Copy final sets for storage
                        this.match.finalSets = this.match.setScores.slice();
                        this.match.isInProgress = false;
                        this.saveCurrentMatch();
                    }
                }
            }
        },
        /**
         * Update players' serve statistics based on the recorded point.
         * Aces, double faults and serve winning percentages are derived
         * from serveData and the winner of the point.
         *
         * @param {object} pointRecord the point record created in finalisePoint
         */
        updateServeStats(pointRecord) {
            const serve = pointRecord.serveData;
            if (!serve) return;
            const serverId = pointRecord.server;
            const playerStats = this.match.players[serverId].stats;
            // First serve was attempted
            playerStats.firstServeTotal++;
            if (serve.firstServe !== 'out') {
                // First serve landed in
                playerStats.firstServeIn++;
                if (serve.firstServe === 'ace') {
                    playerStats.aces++;
                }
                // Did server win the point?
                if (pointRecord.winner === serverId) {
                    playerStats.firstServeWon++;
                }
            } else {
                // First serve out: second serve attempted
                playerStats.secondServeAttempts++;
                if (serve.secondServe === 'out') {
                    // Double fault
                    playerStats.doubleFaults++;
                } else {
                    // Second serve landed in
                    if (serve.secondServe === 'ace') {
                        playerStats.aces++;
                    }
                    // Did server win the point?
                    if (pointRecord.winner === serverId) {
                        playerStats.secondServeWon++;
                    }
                }
            }
        },
        /**
         * Update winners and unforced error counters based on the point
         * ending data.
         *
         * @param {object} pointRecord
         */
        updatePointStats(pointRecord) {
            const ending = pointRecord.pointEnding;
            if (!ending) return;
            const finalPlayer = ending.finalPlayer;
            const stroke = ending.strokeType;
            if (stroke.includes('winner')) {
                this.match.players[finalPlayer].stats.winners++;
            } else if (stroke.includes('unforced')) {
                this.match.players[finalPlayer].stats.unforcedErrors++;
            }
        },
        /**
         * Determine if the specified player has won the current game. A game
         * is won by the first player to reach four points with a two point
         * margin. Advantage scoring is handled implicitly by the points
         * difference.
         *
         * @param {number} playerId 1 or 2
         */
        checkGameWin(playerId) {
            const p = this.match.players[playerId].points;
            const q = this.match.players[playerId === 1 ? 2 : 1].points;
            return p >= 4 && (p - q) >= 2;
        },
        /**
         * Determine if the specified player has won the current set. The
         * player must win six games with a two game margin. This simplified
         * version allows sets to continue beyond 6‑6 until a two game
         * margin is achieved (no tiebreak implemented).
         *
         * @param {number} playerId 1 or 2
         */
        checkSetWin(playerId) {
            const gamesWon = this.match.players[playerId].games;
            const gamesLost = this.match.players[playerId === 1 ? 2 : 1].games;
            return gamesWon >= 6 && (gamesWon - gamesLost) >= 2;
        },
        /**
         * Determine if the specified player has won the match. The first
         * player to win the required number of sets (best of 3 or 5) wins
         * the match.
         *
         * @param {number} playerId 1 or 2
         */
        checkMatchWin(playerId) {
            const setsWon = this.match.players[playerId].sets.reduce((s, v) => s + (v ? 1 : 0), 0);
            const needed = Math.ceil(this.match.matchFormat / 2);
            return setsWon >= needed;
        },
        /**
         * Undo the last recorded point. Restores scores, games, sets,
         * server and statistics to their previous state. Statistics are
         * recalculated from scratch based on the remaining point history.
         */
        undoLastPoint() {
            if (!this.match || this.match.pointHistory.length === 0) return;
            // Remove last point and restore state
            const last = this.match.pointHistory.pop();
            const before = last.before;
            this.match.currentSet = before.currentSet;
            this.match.server = before.server;
            this.match.gameStartServer = before.gameStartServer;
            this.match.setScores = JSON.parse(JSON.stringify(before.setScores));
            this.match.players = JSON.parse(JSON.stringify(before.players));
            // Recompute matchComplete and winner
            this.match.matchComplete = false;
            this.match.winner = null;
            this.match.finalSets = [];
            // Reset stats for both players
            [1, 2].forEach(pid => {
                const stats = this.match.players[pid].stats;
                stats.firstServeTotal = 0;
                stats.firstServeIn = 0;
                stats.firstServeWon = 0;
                stats.secondServeAttempts = 0;
                stats.secondServeWon = 0;
                stats.aces = 0;
                stats.doubleFaults = 0;
                stats.winners = 0;
                stats.unforcedErrors = 0;
            });
            // Recalculate statistics from remaining history
            this.match.pointHistory.forEach(record => {
                this.updateServeStats(record);
                this.updatePointStats(record);
            });
        },
        /**
         * Toggle the visibility of the statistics panel.
         */
        toggleStats() {
            this.statsVisible = !this.statsVisible;
        },
        /**
         * Show the set review modal. Summarises the completed sets and the
         * current set if games have been played.
         */
        showSetReview() {
            this.setReviewVisible = true;
        },
        /**
         * Show the end match modal. Used to record a reason for ending a
         * match early and to specify a winner or no result.
         */
        showEndMatchModal() {
            if (!this.match || this.match.matchComplete) return;
            // Default to no winner selected
            this.endMatchModal.winner = null;
            this.endMatchModal.reason = 'completed';
            this.endMatchModal.notes = '';
            this.endMatchModal.visible = true;
        },
        /**
         * Select the match winner in the end match modal.
         */
        selectMatchWinner(winnerId) {
            this.endMatchModal.winner = winnerId;
        },
        /**
         * Confirm the end of the match. Updates match state, marks the
         * match as complete and saves it to history.
         */
        confirmEndMatch() {
            if (!this.match) return;
            if (this.endMatchModal.winner === null) {
                alert('Please select a match result.');
                return;
            }
            // Apply winner and finalise the match
            if (this.endMatchModal.winner === 0) {
                // No result
                this.match.matchComplete = true;
                this.match.winner = 'No Result';
            } else {
                const winnerName = this.match.players[this.endMatchModal.winner].name;
                this.match.matchComplete = true;
                this.match.winner = winnerName;
                // Assign remaining set (if current set not already recorded)
                if (this.match.currentSet < this.match.matchFormat) {
                    this.match.setScores[this.match.currentSet] = {
                        p1Games: this.match.players[1].games,
                        p2Games: this.match.players[2].games
                    };
                    this.match.players[this.endMatchModal.winner].sets[this.match.currentSet] = 1;
                }
            }
            // Copy final sets
            this.match.finalSets = this.match.setScores.slice();
            this.match.isInProgress = false;
            this.saveCurrentMatch();
            this.endMatchModal.visible = false;
        },
        /**
         * Open a match from history. If the match is in progress it will
         * be restored for editing; if completed it will be opened in
         * read‑only mode. Completed matches cannot be edited.
         *
         * @param {object} stored match record from localStorage
         */
        openMatch(stored) {
            if (!stored) return;
            // Completed matches: load as read‑only match
            if (!stored.isInProgress || !stored.restoreState) {
                this.match = this.createMatch();
                // Override match with stored data
                this.match.id = stored.id;
                this.match.tournament = stored.tournament;
                this.match.date = stored.date;
                this.match.court = stored.court;
                this.match.players[1].name = stored.player1;
                this.match.players[2].name = stored.player2;
                this.match.matchFormat = stored.format;
                // Copy final set scores
                this.match.setScores = stored.finalSets || [];
                // Mark sets as won by final scores
                this.match.players[1].sets = [0,0,0,0,0];
                this.match.players[2].sets = [0,0,0,0,0];
                stored.finalSets.forEach((set, idx) => {
                    if (set.p1 > set.p2) {
                        this.match.players[1].sets[idx] = 1;
                    } else {
                        this.match.players[2].sets[idx] = 1;
                    }
                });
                // Set winner and complete flag
                this.match.matchComplete = true;
                this.match.winner = stored.winner;
                this.match.currentSet = stored.finalSets.length;
                // Reset games and points
                this.match.players[1].games = 0;
                this.match.players[2].games = 0;
                this.match.players[1].points = 0;
                this.match.players[2].points = 0;
                // Stats remain zero as we have no point history
                // Show scoreboard in review mode
                this.stage = 'match';
                return;
            }
            // In progress: restore state from stored.restoreState
            const state = stored.restoreState;
            this.match = this.createMatch();
            this.match.id = stored.id;
            this.match.tournament = stored.tournament;
            this.match.date = stored.date;
            this.match.court = stored.court;
            this.match.players[1].name = stored.player1;
            this.match.players[2].name = stored.player2;
            this.match.matchFormat = stored.format;
            this.match.currentSet = state.currentSet;
            this.match.server = state.server;
            this.match.gameStartServer = state.gameStartServer;
            this.match.setScores = JSON.parse(JSON.stringify(state.setScores));
            // Deep copy players including sets, games, points, stats
            this.match.players = JSON.parse(JSON.stringify(state.players));
            this.match.pointHistory = JSON.parse(JSON.stringify(state.pointHistory));
            this.match.matchComplete = false;
            this.match.isInProgress = true;
            // Recalculate statistics from history
            [1, 2].forEach(pid => {
                const stats = this.match.players[pid].stats;
                stats.firstServeTotal = 0;
                stats.firstServeIn = 0;
                stats.firstServeWon = 0;
                stats.secondServeAttempts = 0;
                stats.secondServeWon = 0;
                stats.aces = 0;
                stats.doubleFaults = 0;
                stats.winners = 0;
                stats.unforcedErrors = 0;
            });
            this.match.pointHistory.forEach(record => {
                this.updateServeStats(record);
                this.updatePointStats(record);
            });
            this.stage = 'match';
        },
        /**
         * Helper to return a formatted statistic. Percentages are shown as
         * percentages with a trailing % sign; counts are returned as
         * numbers.
         *
         * @param {object} player the player object
         * @param {string} statName one of 'firstServePct', 'firstServeWon', 'secondServeWon'
         */
        statDisplay(player, statName) {
            const s = player.stats;
            if (statName === 'firstServePct') {
                if (s.firstServeTotal === 0) return '0%';
                const pct = Math.round((s.firstServeIn / s.firstServeTotal) * 100);
                return `${pct}%`;
            }
            if (statName === 'firstServeWon') {
                if (s.firstServeIn === 0) return '0%';
                const pct = Math.round((s.firstServeWon / s.firstServeIn) * 100);
                return `${pct}%`;
            }
            if (statName === 'secondServeWon') {
                if (s.secondServeAttempts === 0) return '0%';
                const pct = Math.round((s.secondServeWon / s.secondServeAttempts) * 100);
                return `${pct}%`;
            }
            return '0';
        }
    },
    mounted() {
        this.loadMatches();
        // Default date for new matches is today
        this.newMatch.date = new Date().toISOString().split('T')[0];
    }
}).mount('#app');