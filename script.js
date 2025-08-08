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

// The root Vue application has been extended with a template and a pair of
// lightweight child components to better separate concerns. The
// <match-review> component displays the list of previous matches and a
// button to start a new match. The <match-setup> component encapsulates
// the form for starting or joining a match. The scoreboard and modals
// remain in the root template as they depend on many reactive values and
// methods defined on the root instance.

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
                round: '',
                startTime: '',
                player1: '1',
                player2: '2',
                matchFormat: 3,
                firstServer: 1
            },
            // Form model for joining a match in progress
            joinMatch: {
                tournament: '',
                date: '',
                court: '',
                round: '',
                startTime: '',
                player1: '1',
                player2: '2',
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
                pointType: '',
                comment: ''
            },
            // Game comment modal state
            gameCommentModal: {
                visible: false,
                comment: ''
            },
            // Fast forward modal state
            fastForwardModal: {
                visible: false,
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
            // Flag to show/hide the statistics panel
            statsVisible: false,
            // Flag to show/hide the point breakdown modal
            pointBreakdownVisible: false,
            // End match modal state
            endMatchModal: {
                visible: false,
                reason: 'completed',
                winner: null,
                notes: '',
                setScores: [
                    { p1: 0, p2: 0 },
                    { p1: 0, p2: 0 },
                    { p1: 0, p2: 0 },
                    { p1: 0, p2: 0 },
                    { p1: 0, p2: 0 }
                ]
            }
        };
    },

    // Register child components used in the root template. These
    // components receive all of the reactive objects and functions they
    // require via props from the root instance. By isolating the markup
    // for the match list and setup form into their own components, we
    // avoid duplicating large template fragments in index.html and make
    // the overall structure easier to follow.
    components: {
        // Displays the list of previous matches and a button to start a new match.
        // Rather than directly calling parent methods (which would lose the
        // correct `this` context when passed as props), this component emits
        // events that the root listens for. This avoids runtime errors
        // arising from invoking unbound functions.
        'match-review': {
            props: ['matches', 'formatDate', 'formatSetScores'],
            emits: ['open-match', 'new-match-screen'],
            template: `
                <div class="match-review-section">
                    <div class="section-header">
                        <h3>Previous Matches</h3>
                        <!-- Emit new-match-screen on click so the parent can handle navigation -->
                        <button @click="$emit('new-match-screen')" id="hide-match-review">Start New Match</button>
                    </div>
                    <div v-if="matches.length === 0">
                        <p class="no-matches">No previous matches found.</p>
                    </div>
                    <div v-else>
                        <div class="match-item" v-for="match in matches" :key="match.id" @click="$emit('open-match', match)">
                            <div class="match-header">
                                <div class="match-title">{{ match.player1 }} vs {{ match.player2 }}
                                    <span v-if="match.isInProgress" class="status-indicator">In Progress</span>
                                </div>
                                <div class="match-date">{{ formatDate(match.date) }}</div>
                            </div>
                            <div class="match-details-summary">
                                {{ match.tournament || 'Friendly Match' }}
                                <span v-if="match.court"> • {{ match.court }}</span>
                                <span v-if="match.round"> • {{ match.round }}</span>
                                <span v-if="match.startTime"> • {{ match.startTime }}</span>
                            </div>
                            <div class="match-score">
                                <template v-if="!match.isInProgress">
                                    {{ match.winner }} wins {{ formatSetScores(match.finalSets) }}
                                </template>
                                <template v-else>
                                    Current: {{ formatSetScores(match.finalSets) || '0-0' }}
                                </template>
                            </div>
                        </div>
                    </div>
                </div>
            `
        },
        // Encapsulates the form for starting or joining a match. Similar to
        // match-review, it emits events instead of calling parent methods
        // directly. The parent provides reactive data objects (newMatch,
        // joinMatch) that this component binds to via v-model.
        'match-setup': {
            props: ['matchStartType', 'newMatch', 'joinMatch'],
            emits: ['start-match', 'start-join-match', 'cancel'],
            template: `
                <div class="player-setup">
                    <!-- Match Type Selection -->
                    <div class="match-start-option">
                        <h4>What would you like to do?</h4>
                        <div class="match-status-buttons">
                            <label>
                                <!-- Use :checked and @change to update matchStartType via an emitted event.
                                     Props are read‑only so we cannot bind v-model directly to matchStartType. -->
                                <input type="radio" value="new" :checked="matchStartType === 'new'" @change="$emit('update-match-start-type', 'new')"> Start New Match
                            </label>
                            <label>
                                <input type="radio" value="join" :checked="matchStartType === 'join'" @change="$emit('update-match-start-type', 'join')"> Join Match in Progress
                            </label>
                        </div>
                    </div>
                    <!-- New Match Setup -->
                    <div v-if="matchStartType === 'new'">
                        <div class="match-details">
                            <h4>Match Details:</h4>
                            <div class="match-details-grid">
                                <input type="text" v-model="newMatch.tournament" placeholder="Tournament/Event">
                                <input type="date" v-model="newMatch.date">
                                <input type="text" v-model="newMatch.court" placeholder="Court (e.g. Court 1, Centre Court)">
                            </div>
                            <div class="match-details-grid" style="margin-top:10px;">
                                <input type="text" v-model="newMatch.round" placeholder="Round (e.g. Quarterfinal)">
                                <input type="time" v-model="newMatch.startTime">
                                <span></span>
                            </div>
                        </div>
                        <div class="players-section">
                            <h4>Players:</h4>
                            <input type="text" v-model="newMatch.player1" placeholder="Player 1 Name">
                            <input type="text" v-model="newMatch.player2" placeholder="Player 2 Name">
                        </div>
                        <div class="match-format">
                            <label>
                                <input type="radio" value="3" v-model.number="newMatch.matchFormat"> Best of 3 Sets
                            </label>
                            <label>
                                <input type="radio" value="5" v-model.number="newMatch.matchFormat"> Best of 5 Sets
                            </label>
                        </div>
                        <div class="server-selection">
                            <h4>Who serves first?</h4>
                            <div class="server-buttons">
                                <label>
                                    <input type="radio" value="1" v-model.number="newMatch.firstServer"> 
                                    <span>{{ newMatch.player1 || '1' }}</span>
                                </label>
                                <label>
                                    <input type="radio" value="2" v-model.number="newMatch.firstServer"> 
                                    <span>{{ newMatch.player2 || '2' }}</span>
                                </label>
                            </div>
                        </div>
                        <!-- Emit start-match event instead of calling parent method -->
                        <div class="match-action-buttons">
                            <button id="start-match" @click="$emit('start-match')">Start Match</button>
                        </div>
                    </div>
                    <!-- Join Match in Progress -->
                    <div v-if="matchStartType === 'join'">
                        <div class="match-details">
                            <h4>Match Details:</h4>
                            <div class="match-details-grid">
                                <input type="text" v-model="joinMatch.tournament" placeholder="Tournament/Event">
                                <input type="date" v-model="joinMatch.date">
                                <input type="text" v-model="joinMatch.court" placeholder="Court (e.g. Court 1, Centre Court)">
                            </div>
                            <div class="match-details-grid" style="margin-top:10px;">
                                <input type="text" v-model="joinMatch.round" placeholder="Round (e.g. Quarterfinal)">
                                <input type="time" v-model="joinMatch.startTime">
                                <span></span>
                            </div>
                        </div>
                        <div class="players-section">
                            <h4>Players:</h4>
                            <input type="text" v-model="joinMatch.player1" placeholder="Player 1 Name">
                            <input type="text" v-model="joinMatch.player2" placeholder="Player 2 Name">
                        </div>
                        <div class="match-format">
                            <label>
                                <input type="radio" value="3" v-model.number="joinMatch.matchFormat"> Best of 3 Sets
                            </label>
                            <label>
                                <input type="radio" value="5" v-model.number="joinMatch.matchFormat"> Best of 5 Sets
                            </label>
                        </div>
                        <!-- Current Match State -->
                        <div class="current-match-state">
                            <h4>Current Match State:</h4>
                            <div class="current-sets">
                                <h5>Completed Sets:</h5>
                                <div class="sets-input-grid">
                                    <div v-for="n in joinMatch.matchFormat" :key="'set'+n" class="set-input" v-show="n <= Math.min(joinMatch.matchFormat, 5)">
                                        <label>Set {{ n }}:</label>
                                        <div class="score-input-container">
                                            <div class="player-score-input">
                                                <label class="player-label">{{ joinMatch.player1 || '1' }}</label>
                                                <input type="number" v-model.number="joinMatch.setScores[n-1].p1" min="0" max="20" placeholder="0">
                                            </div>
                                            <span class="score-separator">-</span>
                                            <div class="player-score-input">
                                                <label class="player-label">{{ joinMatch.player2 || '2' }}</label>
                                                <input type="number" v-model.number="joinMatch.setScores[n-1].p2" min="0" max="20" placeholder="0">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="current-game">
                                <h5>Current Game Points:</h5>
                                <div class="game-score-inputs">
                                    <div class="game-score-input">
                                        <label class="game-player-label">{{ joinMatch.player1 || '1' }}:</label>
                                        <select v-model="joinMatch.currentPoints.p1">
                                            <option value="0">0</option>
                                            <option value="1">15</option>
                                            <option value="2">30</option>
                                            <option value="3">40</option>
                                            <option value="4">40+ (Ad)</option>
                                        </select>
                                    </div>
                                    <div class="game-score-input">
                                        <label class="game-player-label">{{ joinMatch.player2 || '2' }}:</label>
                                        <select v-model="joinMatch.currentPoints.p2">
                                            <option value="0">0</option>
                                            <option value="1">15</option>
                                            <option value="2">30</option>
                                            <option value="3">40</option>
                                            <option value="4">40+ (Ad)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="current-server">
                                <h5>Who is currently serving?</h5>
                                <div class="current-server-buttons">
                                    <button class="current-server-btn" :class="{'selected': joinMatch.currentServer === 1}" @click="joinMatch.currentServer = 1">{{ joinMatch.player1 || '1' }}</button>
                                    <button class="current-server-btn" :class="{'selected': joinMatch.currentServer === 2}" @click="joinMatch.currentServer = 2">{{ joinMatch.player2 || '2' }}</button>
                                </div>
                            </div>
                        </div>
                        <!-- Emit start-join-match event instead of calling parent method -->
                        <div class="match-action-buttons">
                            <button id="join-match" @click="$emit('start-join-match')">Join Match</button>
                        </div>
                    </div>
                    <div class="cancel-button-container">
                        <button class="cancel-button" @click="$emit('cancel')">Cancel</button>
                    </div>
                </div>
            `
        }
    },

    // Define the top‑level template. It renders a heading and then
    // chooses between the review screen, setup form, scoreboard and
    // various modals based on the current application stage and state.
    template: `
        <div>
            <h1>Tennis Scorekeeper</h1>
            <match-review
                v-if="stage === 'review'"
                :matches="matches"
                :format-date="formatDate"
                :format-set-scores="formatSetScores"
                @open-match="openMatch"
                @new-match-screen="newMatchScreen"
            ></match-review>
            <match-setup
                v-if="stage === 'setup'"
                :match-start-type="matchStartType"
                :new-match="newMatch"
                :join-match="joinMatch"
                @start-match="startMatch"
                @start-join-match="startJoinMatch"
                @cancel="stage = 'review'"
                @update-match-start-type="matchStartType = $event"
            ></match-setup>
            <!-- Active match scoreboard and related controls -->
            <div v-if="stage === 'match'" class="scoreboard">
                <div class="match-info">
                    <div class="match-format">
                        <label>
                            <input type="radio" value="3" v-model.number="match.matchFormat" @change="changeMatchFormat"> Best of 3 Sets
                        </label>
                        <label>
                            <input type="radio" value="5" v-model.number="match.matchFormat" @change="changeMatchFormat"> Best of 5 Sets
                        </label>
                    </div>
                    <div class="match-actions">
                        <button id="go-home" @click="goHome">Go Home</button>
                        <button id="reset-match" @click="resetMatch">New Match</button>
                    </div>
                    <!-- Display tournament metadata including round, date, time and court -->
                    <div class="match-meta" style="margin-top:10px; font-size:0.85em; color: var(--text-color);">
                        <span v-if="match.tournament">{{ match.tournament }}</span>
                        <span v-if="match.round"> • {{ match.round }}</span>
                        <span v-if="match.date"> • {{ formatDate(match.date) }}</span>
                        <span v-if="match.startTime"> • {{ match.startTime }}</span>
                        <span v-if="match.court"> • {{ match.court }}</span>
                    </div>
                </div>
                <table class="score-table">
                    <thead>
                        <tr>
                            <th>Player</th>
                            <th v-for="n in maxSets" :key="n" v-show="n <= match.matchFormat">Set {{ n }}</th>
                            <th>Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr :class="{'current-server': match.server === 1, 'winner': match.matchComplete && winner === match.players[1].name}" data-player="1">
                            <td class="player-name">{{ match.players[1].name }}</td>
                            <td v-for="n in maxSets" :key="'p1-' + n" v-show="n <= match.matchFormat">{{ displaySetScore(1, n - 1) }}</td>
                            <td class="point-score">{{ pointDisplay(1) }}</td>
                        </tr>
                        <tr :class="{'current-server': match.server === 2, 'winner': match.matchComplete && winner === match.players[2].name}" data-player="2">
                            <td class="player-name">{{ match.players[2].name }}</td>
                            <td v-for="n in maxSets" :key="'p2-' + n" v-show="n <= match.matchFormat">{{ displaySetScore(2, n - 1) }}</td>
                            <td class="point-score">{{ pointDisplay(2) }}</td>
                        </tr>
                    </tbody>
                </table>
                <div class="match-status">
                    <div id="serving-indicator">{{ servingIndicator }}</div>
                    <div id="match-result" class="match-result" v-if="match.matchComplete">{{ winner }} wins the match!</div>
                </div>
                <div class="controls">
                    <div class="primary-controls">
                        <button id="point-btn" class="point-button" @click="openServeModal" :disabled="match.matchComplete">Point Played</button>
                    </div>
                    <div class="match-controls">
                        <button id="undo-btn" @click="undoLastPoint" :disabled="match.matchComplete || match.pointHistory.length === 0">Undo Last Point</button>
                        <button id="match-over-btn" class="match-over-button" @click="showEndMatchModal" :disabled="match.matchComplete">Match is Over</button>
                    </div>
                    <div class="review-controls">
                        <button id="show-stats" @click="toggleStats">Match Stats</button>
                        <button id="point-breakdown" @click="showPointBreakdown">Point Breakdown</button>
                        <button id="fast-forward" @click="showFastForwardModal" :disabled="match.matchComplete">Fast Forward</button>
                    </div>
                </div>
                <div class="serve-stats" v-if="statsVisible">
                    <h3>Match Statistics</h3>
                    <div class="stats-grid">
                        <div class="player-stats">
                            <h4>{{ match.players[1].name }}</h4>
                            <div class="stat-row"><span>1st Serve %:</span><span>{{ statDisplay(match.players[1], 'firstServePct') }}</span></div>
                            <div class="stat-row"><span>1st Serve Won:</span><span>{{ statDisplay(match.players[1], 'firstServeWon') }}</span></div>
                            <div class="stat-row"><span>2nd Serve Won:</span><span>{{ statDisplay(match.players[1], 'secondServeWon') }}</span></div>
                            <div class="stat-row"><span>Aces:</span><span>{{ match.players[1].stats.aces }}</span></div>
                            <div class="stat-row"><span>Double Faults:</span><span>{{ match.players[1].stats.doubleFaults }}</span></div>
                            <div class="stat-row"><span>Winners:</span><span>{{ match.players[1].stats.winners }}</span></div>
                            <div class="stat-row"><span>Unforced Errors:</span><span>{{ match.players[1].stats.unforcedErrors }}</span></div>
                        </div>
                        <div class="player-stats">
                            <h4>{{ match.players[2].name }}</h4>
                            <div class="stat-row"><span>1st Serve %:</span><span>{{ statDisplay(match.players[2], 'firstServePct') }}</span></div>
                            <div class="stat-row"><span>1st Serve Won:</span><span>{{ statDisplay(match.players[2], 'firstServeWon') }}</span></div>
                            <div class="stat-row"><span>2nd Serve Won:</span><span>{{ statDisplay(match.players[2], 'secondServeWon') }}</span></div>
                            <div class="stat-row"><span>Aces:</span><span>{{ match.players[2].stats.aces }}</span></div>
                            <div class="stat-row"><span>Double Faults:</span><span>{{ match.players[2].stats.doubleFaults }}</span></div>
                            <div class="stat-row"><span>Winners:</span><span>{{ match.players[2].stats.winners }}</span></div>
                            <div class="stat-row"><span>Unforced Errors:</span><span>{{ match.players[2].stats.unforcedErrors }}</span></div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Serve Modal -->
            <div v-if="serveModal.visible" class="modal" style="display:block;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>{{ match.players[match.server].name }} serving</h3>
                        <span class="close" @click="closeServeModal">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div class="quick-winner-section" style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #ddd;">
                            <h4>Quick Point Entry:</h4>
                            <div class="quick-winner-buttons">
                                <button class="player-btn" @click="quickFinalizePoint(1)" style="margin: 5px;">{{ match.players[1].name }} Won Point</button>
                                <button class="player-btn" @click="quickFinalizePoint(2)" style="margin: 5px;">{{ match.players[2].name }} Won Point</button>
                            </div>
                            <p style="font-size: 0.9em; color: #666; margin-top: 10px;">Or fill out details below:</p>
                        </div>
                        <div v-if="!serveModal.firstServe">
                            <h4>First Serve:</h4>
                            <div class="serve-buttons">
                                <button class="serve-btn" @click="selectFirstServe('ace')">Ace</button>
                                <button class="serve-btn" @click="selectFirstServe('unreturned')">Unreturned</button>
                                <button class="serve-btn" @click="selectFirstServe('in')">In (Returned)</button>
                                <button class="serve-btn" @click="selectFirstServe('out')">Out/Fault</button>
                            </div>
                        </div>
                        <div v-else-if="serveModal.firstServe === 'out' && !serveModal.secondServe">
                            <h4>Second Serve:</h4>
                            <div class="serve-buttons">
                                <button class="serve-btn" @click="selectSecondServe('ace')">Ace</button>
                                <button class="serve-btn" @click="selectSecondServe('unreturned')">Unreturned</button>
                                <button class="serve-btn" @click="selectSecondServe('in')">In (Returned)</button>
                                <button class="serve-btn" @click="selectSecondServe('double-fault')">Double Fault</button>
                            </div>
                        </div>
                        <div v-if="serveNeedsFinal()">
                            <h4>How did the point end?</h4>
                            <div class="player-selection">
                                <h5>Which player hit the final shot?</h5>
                                <div class="player-buttons">
                                    <button class="player-btn" :class="{'selected': serveModal.finalPlayer === 1}" @click="selectFinalPlayer(1)">{{ match.players[1].name }}</button>
                                    <button class="player-btn" :class="{'selected': serveModal.finalPlayer === 2}" @click="selectFinalPlayer(2)">{{ match.players[2].name }}</button>
                                </div>
                            </div>
                            <div class="stroke-selection" v-if="serveModal.finalPlayer">
                                <h5>What type of shot?</h5>
                                <div class="ending-buttons">
                                    <button class="ending-btn" @click="selectStroke('fh-winner')">Forehand Winner</button>
                                    <button class="ending-btn" @click="selectStroke('bh-winner')">Backhand Winner</button>
                                    <button class="ending-btn" @click="selectStroke('fh-unforced')">Forehand UE</button>
                                    <button class="ending-btn" @click="selectStroke('bh-unforced')">Backhand UE</button>
                                    <button class="ending-btn" @click="selectStroke('fh-forced')">Forced Forehand Error</button>
                                    <button class="ending-btn" @click="selectStroke('bh-forced')">Forced Backhand Error</button>
                                </div>
                            </div>
                        </div>
                        <div class="point-type-section" style="margin-top:15px;">
                            <h4>Point Type:</h4>
                            <div class="point-type-buttons">
                                <button class="point-type-btn" :class="{'selected': serveModal.pointType === 'short'}" @click="serveModal.pointType = 'short'">Short</button>
                                <button class="point-type-btn" :class="{'selected': serveModal.pointType === 'medium'}" @click="serveModal.pointType = 'medium'">Medium</button>
                                <button class="point-type-btn" :class="{'selected': serveModal.pointType === 'long'}" @click="serveModal.pointType = 'long'">Long</button>
                            </div>
                        </div>
                        <div class="point-comment-section" style="margin-top:15px;">
                            <h4>Point Comment (Optional):</h4>
                            <textarea v-model="serveModal.comment" placeholder="Add a comment about this point..." rows="4" class="mobile-friendly-textarea"></textarea>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Point Breakdown Modal -->
            <div v-if="pointBreakdownVisible" class="modal" style="display:block;">
                <div class="modal-content point-breakdown-modal">
                    <div class="modal-header">
                        <h3>Match Breakdown</h3>
                        <span class="close" @click="pointBreakdownVisible = false">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div v-if="match.pointHistory.length === 0">
                            <p class="no-data">No points played yet.</p>
                        </div>
                        <div v-else class="point-breakdown-content">
                            <div class="breakdown-summary">
                                <h4>Match Summary</h4>
                                <div class="summary-stats">
                                    <div class="stat-item">Total Points: {{ match.pointHistory.length }}</div>
                                    <div class="stat-item">Short Points: {{ match.pointHistory.filter(p => p.pointType === 'short').length }}</div>
                                    <div class="stat-item">Medium Points: {{ match.pointHistory.filter(p => p.pointType === 'medium').length }}</div>
                                    <div class="stat-item">Long Points: {{ match.pointHistory.filter(p => p.pointType === 'long').length }}</div>
                                    <div class="stat-item">No Type: {{ match.pointHistory.filter(p => !p.pointType).length }}</div>
                                </div>
                            </div>
                            
                            <!-- Set by Set Breakdown -->
                            <div class="sets-breakdown">
                                <div v-for="set in organizedPointHistory" :key="'set' + set.setNumber" class="set-container">
                                    <div class="set-header">
                                        <h4>Set {{ set.setNumber }}</h4>
                                        <div class="set-info">
                                            <span class="set-winner" v-if="set.winner !== 'In Progress'">Winner: {{ set.winner }}</span>
                                            <span class="set-score" v-if="set.finalScore">{{ set.finalScore }}</span>
                                            <span class="set-status" v-else>In Progress</span>
                                        </div>
                                    </div>
                                    
                                    <!-- Games within this set -->
                                    <div class="games-container">
                                        <div v-for="game in set.games" :key="'game' + game.gameNumber" class="game-container">
                                            <div class="game-header">
                                                <h5>Game {{ game.gameNumber }}</h5>
                                                <div class="game-info">
                                                    <span class="game-winner" v-if="game.winner !== 'In Progress'">{{ game.winner }}</span>
                                                    <span class="game-status" v-else>In Progress</span>
                                                    <span class="game-points-count">{{ game.points.length }} point{{ game.points.length !== 1 ? 's' : '' }}</span>
                                                </div>
                                            </div>
                                            
                                            <!-- Points within this game -->
                                            <div class="game-points">
                                                <div v-for="point in game.points" :key="'point' + point.timestamp" class="point-entry-compact">
                                                    <div class="point-compact-header">
                                                        <span class="point-number-compact">{{ point.pointNumber }}</span>
                                                        <span v-if="point.pointType" class="point-type-badge-small" :class="'type-' + point.pointType">{{ point.pointType[0].toUpperCase() }}</span>
                                                        <span class="point-winner-compact">{{ match.players[point.winner].name }}</span>
                                                        <span class="point-server-compact">served by {{ match.players[point.server].name }}</span>
                                                    </div>
                                                    <div v-if="point.serveData" class="point-serve-compact">
                                                        <span class="serve-result">{{ point.serveData.firstServe }}{{ point.serveData.secondServe ? (', ' + point.serveData.secondServe) : '' }}</span>
                                                    </div>
                                                    <div v-if="point.pointEnding" class="point-ending-compact">
                                                        {{ match.players[point.pointEnding.finalPlayer].name }} {{ point.pointEnding.strokeType.replace('-', ' ') }}
                                                    </div>
                                                    <div v-if="point.comment" class="point-comment-compact">{{ point.comment }}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Game Comment Modal -->
            <div v-if="gameCommentModal.visible" class="modal" style="display:block;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Game Complete!</h3>
                        <span class="close" @click="cancelGameComment">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div class="game-complete-info">
                            <p>Would you like to add a comment about this game?</p>
                        </div>
                        <div class="game-comment-input">
                            <textarea v-model="gameCommentModal.comment" placeholder="Add your thoughts about this game (optional)..." rows="4" class="mobile-friendly-textarea"></textarea>
                        </div>
                        <div class="game-comment-actions">
                            <button @click="saveGameComment" class="save-comment-btn">Save & Continue</button>
                            <button @click="cancelGameComment" class="skip-comment-btn">Skip</button>
                        </div>
                    </div>
                </div>
            </div>
            <!-- End Match Modal -->
            <div v-if="endMatchModal.visible" class="modal" style="display:block;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>End Match</h3>
                        <span class="close" @click="endMatchModal.visible = false">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div class="end-match-reason">
                            <h4>Reason for ending match:</h4>
                            <select v-model="endMatchModal.reason">
                                <option value="completed">Match completed normally</option>
                                <option value="withdrawal">Player withdrawal</option>
                                <option value="injury">Injury</option>
                                <option value="weather">Weather/conditions</option>
                                <option value="time">Time limit reached</option>
                                <option value="other">Other reason</option>
                            </select>
                        </div>
                        <div class="end-match-sets">
                            <h4>Final Set Scores:</h4>
                            <div class="end-match-sets-grid">
                                <div v-for="n in match.matchFormat" :key="'endset'+n" class="end-set-input" v-show="n <= Math.min(match.matchFormat, 5)">
                                    <label>Set {{ n }}:</label>
                                    <div class="end-score-input-container">
                                        <div class="end-player-score-input">
                                            <label class="end-player-label">{{ match.players[1].name }}</label>
                                            <input type="number" v-model.number="endMatchModal.setScores[n-1].p1" min="0" max="20" placeholder="0">
                                        </div>
                                        <span class="end-score-separator">-</span>
                                        <div class="end-player-score-input">
                                            <label class="end-player-label">{{ match.players[2].name }}</label>
                                            <input type="number" v-model.number="endMatchModal.setScores[n-1].p2" min="0" max="20" placeholder="0">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="match-winner-selection">
                            <h4>Who won the match?</h4>
                            <div class="winner-buttons">
                                <button class="winner-btn" :class="{'selected': endMatchModal.winner === 1}" @click="selectMatchWinner(1)">{{ match.players[1].name }}</button>
                                <button class="winner-btn" :class="{'selected': endMatchModal.winner === 2}" @click="selectMatchWinner(2)">{{ match.players[2].name }}</button>
                                <button class="winner-btn" :class="{'selected': endMatchModal.winner === 0}" @click="selectMatchWinner(0)">No Result</button>
                            </div>
                        </div>
                        <div class="end-match-comment">
                            <h4>Additional Notes (Optional):</h4>
                            <textarea v-model="endMatchModal.notes" placeholder="Any additional notes about how/why the match ended..." rows="4" class="mobile-friendly-textarea"></textarea>
                        </div>
                        <div class="end-match-actions" style="margin-top:15px;">
                            <button id="confirm-end-match" @click="confirmEndMatch">End Match</button>
                            <button id="cancel-end-match" @click="endMatchModal.visible = false">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Fast Forward Modal -->
            <div v-if="fastForwardModal.visible" class="modal" style="display:block;">
                <div class="modal-content fast-forward-modal">
                    <div class="modal-header">
                        <h3>Fast Forward Match</h3>
                        <span class="close" @click="cancelFastForward">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div class="fast-forward-info">
                            <p>Update the match to the current state. Enter the actual scores from where you left off:</p>
                        </div>
                        
                        <div class="fast-forward-sets">
                            <h4>Set Scores:</h4>
                            <div class="fast-forward-sets-grid">
                                <div v-for="n in match.matchFormat" :key="'ffset'+n" class="fast-forward-set-input" v-show="n <= Math.min(match.matchFormat, 5)">
                                    <label>Set {{ n }}:</label>
                                    <div class="fast-forward-score-container">
                                        <div class="fast-forward-player-score">
                                            <label class="fast-forward-player-label">{{ match.players[1].name }}</label>
                                            <input type="number" v-model.number="fastForwardModal.setScores[n-1].p1" min="0" max="20" placeholder="0">
                                        </div>
                                        <span class="fast-forward-separator">-</span>
                                        <div class="fast-forward-player-score">
                                            <label class="fast-forward-player-label">{{ match.players[2].name }}</label>
                                            <input type="number" v-model.number="fastForwardModal.setScores[n-1].p2" min="0" max="20" placeholder="0">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="fast-forward-current-game">
                            <h4>Current Game Points:</h4>
                            <div class="fast-forward-game-inputs">
                                <div class="fast-forward-game-input">
                                    <label class="fast-forward-game-label">{{ match.players[1].name }}:</label>
                                    <select v-model="fastForwardModal.currentPoints.p1">
                                        <option value="0">0</option>
                                        <option value="1">15</option>
                                        <option value="2">30</option>
                                        <option value="3">40</option>
                                        <option value="4">40+ (Ad)</option>
                                    </select>
                                </div>
                                <div class="fast-forward-game-input">
                                    <label class="fast-forward-game-label">{{ match.players[2].name }}:</label>
                                    <select v-model="fastForwardModal.currentPoints.p2">
                                        <option value="0">0</option>
                                        <option value="1">15</option>
                                        <option value="2">30</option>
                                        <option value="3">40</option>
                                        <option value="4">40+ (Ad)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="fast-forward-server">
                            <h4>Who is currently serving?</h4>
                            <div class="fast-forward-server-buttons">
                                <button class="fast-forward-server-btn" :class="{'selected': fastForwardModal.currentServer === 1}" @click="fastForwardModal.currentServer = 1">{{ match.players[1].name }}</button>
                                <button class="fast-forward-server-btn" :class="{'selected': fastForwardModal.currentServer === 2}" @click="fastForwardModal.currentServer = 2">{{ match.players[2].name }}</button>
                            </div>
                        </div>
                        
                        <div class="fast-forward-actions">
                            <button @click="applyFastForward" class="apply-fast-forward-btn">Update Match</button>
                            <button @click="cancelFastForward" class="cancel-fast-forward-btn">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
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
        },
        
        /**
         * Organizes point history by sets and games for the point breakdown modal.
         */
        organizedPointHistory() {
            if (!this.match || !this.match.pointHistory) return [];
            
            const organized = [];
            let currentSet = 1;
            let currentGame = 1;
            let gamePoints = [];
            let setGames = [];
            
            this.match.pointHistory.forEach((point, index) => {
                // Add point to current game
                gamePoints.push({
                    ...point,
                    pointNumber: gamePoints.length + 1
                });
                
                // Check if this point completed a game (by looking at the next point's game context)
                const nextPoint = this.match.pointHistory[index + 1];
                const gameEnded = !nextPoint || nextPoint.gameNumber !== point.gameNumber;
                
                if (gameEnded) {
                    // Determine game winner by looking at who won the last point of the game
                    const gameWinner = this.match.players[point.winner].name;
                    
                    setGames.push({
                        gameNumber: currentGame,
                        points: [...gamePoints],
                        winner: gameWinner,
                        setNumber: currentSet
                    });
                    
                    gamePoints = [];
                    currentGame++;
                    
                    // Check if this game completed a set
                    const setEnded = nextPoint && nextPoint.setNumber !== point.setNumber;
                    
                    if (setEnded || !nextPoint) {
                        const setWinner = this.determineSetWinner(setGames, currentSet);
                        organized.push({
                            setNumber: currentSet,
                            games: [...setGames],
                            winner: setWinner,
                            finalScore: this.getSetFinalScore(currentSet)
                        });
                        
                        setGames = [];
                        currentSet++;
                        currentGame = 1;
                    }
                }
            });
            
            // Handle current incomplete game/set
            if (gamePoints.length > 0) {
                setGames.push({
                    gameNumber: currentGame,
                    points: [...gamePoints],
                    winner: 'In Progress',
                    setNumber: currentSet
                });
            }
            
            if (setGames.length > 0) {
                organized.push({
                    setNumber: currentSet,
                    games: [...setGames],
                    winner: 'In Progress',
                    finalScore: null
                });
            }
            
            return organized;
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
                    name: this.newMatch.player1 || '1',
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
                    name: this.newMatch.player2 || '2',
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
                round: this.newMatch.round.trim(),
                startTime: this.newMatch.startTime,
                players: players,
                currentSet: 0,
                server: this.newMatch.firstServer,
                matchFormat: this.newMatch.matchFormat,
                matchComplete: false,
                setScores: [],
                pointHistory: [],
                // tracks which player should serve the next game
                gameStartServer: this.newMatch.firstServer,
                // game comments storage
                gameComments: {},
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
            this.pointBreakdownVisible = false;
            this.endMatchModal.visible = false;
            this.gameCommentModal.visible = false;
            this.fastForwardModal.visible = false;
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
            this.pointBreakdownVisible = false;
            this.endMatchModal.visible = false;
            this.gameCommentModal.visible = false;
            this.fastForwardModal.visible = false;
            
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
                round: this.joinMatch.round.trim(),
                startTime: this.joinMatch.startTime,
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
                finalSets: [],
                gameComments: {}
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
            this.pointBreakdownVisible = false;
            this.endMatchModal.visible = false;
            this.gameCommentModal.visible = false;
            this.fastForwardModal.visible = false;
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
                round: this.match.round,
                startTime: this.match.startTime,
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
                    pointHistory: JSON.parse(JSON.stringify(this.match.pointHistory)),
                    gameComments: JSON.parse(JSON.stringify(this.match.gameComments))
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
            this.serveModal.pointType = '';
            this.serveModal.comment = '';
            this.serveModal.pointType = '';
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
                // Server wins outright - automatically set as short point
                this.finalisePoint(this.match.server, { firstServe: outcome, secondServe: null }, null, 'short', this.serveModal.comment);
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
                // Point to receiver - automatically set as short point
                const receiver = this.match.server === 1 ? 2 : 1;
                this.finalisePoint(receiver, { firstServe: 'out', secondServe: 'out' }, null, 'short', this.serveModal.comment);
                this.closeServeModal();
            } else if (outcome === 'ace' || outcome === 'unreturned') {
                // Server wins outright - automatically set as short point
                this.finalisePoint(this.match.server, { firstServe: 'out', secondServe: outcome }, null, 'short', this.serveModal.comment);
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
         * @param {string} stroke one of 'fh-winner', 'bh-winner', 'fh-unforced', 'bh-unforced', 'fh-forced', 'bh-forced'
         */
        selectStroke(stroke) {
            this.serveModal.strokeType = stroke;
            // Determine point winner based on stroke
            let winner;
            if (stroke.includes('winner')) {
                winner = this.serveModal.finalPlayer;
            } else {
                // Unforced error or forced error: opponent wins
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
            this.finalisePoint(winner, serveData, pointEnding, this.serveModal.pointType, this.serveModal.comment);
            this.closeServeModal();
        },
        /**
         * Quick method to finalize a point with just the winner, no detailed tracking.
         *
         * @param {number} winner the player who won the point (1 or 2)
         */
        quickFinalizePoint(winner) {
            // Use minimal serve data and point ending info
            const serveData = {
                firstServe: 'in',
                secondServe: null
            };
            const pointEnding = null; // No detailed ending info
            this.finalisePoint(winner, serveData, pointEnding, 'medium', '');
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
        finalisePoint(winner, serveData, pointEnding, pointType, comment) {
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
                pointType: pointType || '',
                comment: comment || '',
                timestamp: new Date().toISOString(),
                gameNumber: this.match.players[1].games + this.match.players[2].games + 1,
                setNumber: this.match.currentSet + 1,
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
                // Show game comment modal after a brief delay
                setTimeout(() => {
                    this.showGameCommentModal();
                }, 300);
                
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
         * Show the point breakdown modal. Displays point-by-point match history.
         */
        showPointBreakdown() {
            this.pointBreakdownVisible = true;
        },
        
        /**
         * Show the game comment modal when a game is completed.
         */
        showGameCommentModal() {
            this.gameCommentModal.visible = true;
            this.gameCommentModal.comment = '';
        },
        
        /**
         * Save a comment for the completed game.
         */
        saveGameComment() {
            if (this.gameCommentModal.comment.trim()) {
                const gameKey = `set${this.match.currentSet + 1}_game${this.match.players[1].games + this.match.players[2].games}`;
                this.match.gameComments[gameKey] = {
                    comment: this.gameCommentModal.comment.trim(),
                    timestamp: new Date().toISOString(),
                    setNumber: this.match.currentSet + 1,
                    gameNumber: this.match.players[1].games + this.match.players[2].games
                };
            }
            this.gameCommentModal.visible = false;
        },
        
        /**
         * Cancel game comment entry.
         */
        cancelGameComment() {
            this.gameCommentModal.visible = false;
        },
        
        /**
         * Show the fast forward modal to update match state.
         */
        showFastForwardModal() {
            if (!this.match || this.match.matchComplete) return;
            
            // Pre-populate with current state
            for (let i = 0; i < 5; i++) {
                if (i < this.match.setScores.length) {
                    this.fastForwardModal.setScores[i] = {
                        p1: this.match.setScores[i].p1Games,
                        p2: this.match.setScores[i].p2Games
                    };
                } else if (i === this.match.currentSet && (this.match.players[1].games > 0 || this.match.players[2].games > 0)) {
                    // Current set in progress
                    this.fastForwardModal.setScores[i] = {
                        p1: this.match.players[1].games,
                        p2: this.match.players[2].games
                    };
                } else {
                    this.fastForwardModal.setScores[i] = { p1: 0, p2: 0 };
                }
            }
            
            this.fastForwardModal.currentPoints = {
                p1: this.match.players[1].points,
                p2: this.match.players[2].points
            };
            
            this.fastForwardModal.currentServer = this.match.server;
            this.fastForwardModal.visible = true;
        },
        
        /**
         * Apply the fast forward changes to the match.
         */
        applyFastForward() {
            if (!this.match) return;
            
            // Update set scores and determine current set
            const newSetScores = [];
            const newPlayerSets = { 1: [0, 0, 0, 0, 0], 2: [0, 0, 0, 0, 0] };
            let currentSet = 0;
            let currentP1Games = 0;
            let currentP2Games = 0;
            
            for (let i = 0; i < this.match.matchFormat; i++) {
                const setScore = this.fastForwardModal.setScores[i];
                if (setScore.p1 > 0 || setScore.p2 > 0) {
                    // Check if this set is complete
                    if (this.isSetComplete(setScore.p1, setScore.p2)) {
                        newSetScores.push({
                            p1Games: setScore.p1,
                            p2Games: setScore.p2
                        });
                        
                        // Award set to winner
                        if (setScore.p1 > setScore.p2) {
                            newPlayerSets[1][i] = 1;
                        } else if (setScore.p2 > setScore.p1) {
                            newPlayerSets[2][i] = 1;
                        }
                        
                        currentSet = i + 1;
                    } else {
                        // This is the current set in progress
                        currentP1Games = setScore.p1;
                        currentP2Games = setScore.p2;
                        currentSet = i;
                        break;
                    }
                } else {
                    // No more sets with scores
                    break;
                }
            }
            
            // Update match state
            this.match.setScores = newSetScores;
            this.match.players[1].sets = newPlayerSets[1];
            this.match.players[2].sets = newPlayerSets[2];
            this.match.currentSet = currentSet;
            this.match.players[1].games = currentP1Games;
            this.match.players[2].games = currentP2Games;
            this.match.players[1].points = this.fastForwardModal.currentPoints.p1;
            this.match.players[2].points = this.fastForwardModal.currentPoints.p2;
            this.match.server = this.fastForwardModal.currentServer;
            
            // Check if match is now complete
            const setsWon1 = this.match.players[1].sets.reduce((s, v) => s + (v ? 1 : 0), 0);
            const setsWon2 = this.match.players[2].sets.reduce((s, v) => s + (v ? 1 : 0), 0);
            const needed = Math.ceil(this.match.matchFormat / 2);
            
            if (setsWon1 >= needed || setsWon2 >= needed) {
                this.match.matchComplete = true;
                this.match.winner = setsWon1 > setsWon2 ? this.match.players[1].name : this.match.players[2].name;
                this.match.finalSets = this.match.setScores.slice();
                this.match.isInProgress = false;
                this.saveCurrentMatch();
            }
            
            this.fastForwardModal.visible = false;
        },
        
        /**
         * Cancel fast forward changes.
         */
        cancelFastForward() {
            this.fastForwardModal.visible = false;
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
            
            // Pre-populate with current set scores
            for (let i = 0; i < 5; i++) {
                if (i < this.match.setScores.length) {
                    this.endMatchModal.setScores[i] = {
                        p1: this.match.setScores[i].p1Games,
                        p2: this.match.setScores[i].p2Games
                    };
                } else if (i === this.match.currentSet && (this.match.players[1].games > 0 || this.match.players[2].games > 0)) {
                    // Current set in progress
                    this.endMatchModal.setScores[i] = {
                        p1: this.match.players[1].games,
                        p2: this.match.players[2].games
                    };
                } else {
                    this.endMatchModal.setScores[i] = { p1: 0, p2: 0 };
                }
            }
            
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
            
            // Apply set scores from the modal
            const newSetScores = [];
            const newPlayerSets = { 1: [0, 0, 0, 0, 0], 2: [0, 0, 0, 0, 0] };
            
            for (let i = 0; i < this.match.matchFormat; i++) {
                const setScore = this.endMatchModal.setScores[i];
                if (setScore.p1 > 0 || setScore.p2 > 0) {
                    newSetScores.push({
                        p1Games: setScore.p1,
                        p2Games: setScore.p2
                    });
                    
                    // Determine set winner
                    if (setScore.p1 > setScore.p2) {
                        newPlayerSets[1][i] = 1;
                    } else if (setScore.p2 > setScore.p1) {
                        newPlayerSets[2][i] = 1;
                    }
                }
            }
            
            // Update match state
            this.match.setScores = newSetScores;
            this.match.players[1].sets = newPlayerSets[1];
            this.match.players[2].sets = newPlayerSets[2];
            this.match.currentSet = newSetScores.length;
            
            // Apply winner and finalise the match
            if (this.endMatchModal.winner === 0) {
                // No result
                this.match.matchComplete = true;
                this.match.winner = 'No Result';
            } else {
                const winnerName = this.match.players[this.endMatchModal.winner].name;
                this.match.matchComplete = true;
                this.match.winner = winnerName;
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
                this.match.round = stored.round || '';
                this.match.startTime = stored.startTime || '';
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
            this.match.round = stored.round || '';
            this.match.startTime = stored.startTime || '';
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
            // Restore game comments if available
            if (state.gameComments) {
                this.match.gameComments = JSON.parse(JSON.stringify(state.gameComments));
            }
            this.stage = 'match';
        },
        
        /**
         * Format timestamp for point display
         */
        formatPointTime(timestamp) {
            if (!timestamp) return '';
            try {
                const date = new Date(timestamp);
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (e) {
                return '';
            }
        },
        
        /**
         * Determine the winner of a set based on its games
         */
        determineSetWinner(games, setNumber) {
            if (!games.length) return 'Unknown';
            
            // If we have completed set scores, use those
            if (this.match.setScores && this.match.setScores[setNumber - 1]) {
                const setScore = this.match.setScores[setNumber - 1];
                if (setScore.p1Games > setScore.p2Games) {
                    return this.match.players[1].name;
                } else if (setScore.p2Games > setScore.p1Games) {
                    return this.match.players[2].name;
                }
            }
            
            // Otherwise count games won
            let p1Games = 0;
            let p2Games = 0;
            
            games.forEach(game => {
                if (game.winner === this.match.players[1].name) p1Games++;
                else if (game.winner === this.match.players[2].name) p2Games++;
            });
            
            if (p1Games > p2Games) return this.match.players[1].name;
            if (p2Games > p1Games) return this.match.players[2].name;
            return 'Tied';
        },
        
        /**
         * Get the final score for a completed set
         */
        getSetFinalScore(setNumber) {
            if (this.match.setScores && this.match.setScores[setNumber - 1]) {
                const setScore = this.match.setScores[setNumber - 1];
                return `${setScore.p1Games}-${setScore.p2Games}`;
            }
            return null;
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