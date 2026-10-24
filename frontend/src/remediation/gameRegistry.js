import OrderStepsGame from './OrderStepsGame';
import MatchPairsGame from './MatchPairsGame';

/**
 * Game Registry
 *
 * Provides a decoupled, plugin-based registry for remediation mini-games.
 * Adding a third game (e.g. "Sort the Basket") requires only:
 *   registerGame('sort_the_basket', SortTheBasketComponent);
 */

const registry = new Map();

// Register Default Built-in Games
registry.set('order_steps', OrderStepsGame);
registry.set('match_pairs', MatchPairsGame);

/**
 * Register or override a remediation game type
 * @param {string} gameType - Unique identifier (e.g. "order_steps", "match_pairs")
 * @param {React.ComponentType} Component - React component implementing the game contract
 */
export function registerGame(gameType, Component) {
  registry.set(gameType, Component);
}

/**
 * Resolve a game component by type, with safe fallback to OrderStepsGame
 * @param {string} gameType
 * @returns {React.ComponentType}
 */
export function getGame(gameType) {
  return registry.get(gameType) || registry.get('order_steps');
}

/**
 * List all currently registered game keys
 * @returns {string[]}
 */
export function listGames() {
  return Array.from(registry.keys());
}
