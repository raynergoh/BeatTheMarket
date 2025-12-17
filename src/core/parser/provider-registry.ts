/**
 * Provider Registry
 * Enables Open-Closed Principle compliance by allowing new providers
 * to be registered without modifying core orchestration code.
 */

import { PortfolioProvider } from '../types';
import { IbkrProvider } from './ibkr-provider';

// Registry storage
const providers = new Map<string, PortfolioProvider>();

/**
 * Register a new portfolio provider.
 * @param key - Unique identifier for the provider (e.g., 'ibkr', 'schwab', 'coinbase')
 * @param provider - Provider instance implementing PortfolioProvider interface
 */
export function registerProvider(key: string, provider: PortfolioProvider): void {
    providers.set(key.toLowerCase(), provider);
}

/**
 * Get a registered provider by key.
 * @param key - Provider identifier
 * @returns The provider instance, or undefined if not found
 */
export function getProvider(key: string): PortfolioProvider | undefined {
    return providers.get(key.toLowerCase());
}

/**
 * Get all registered provider keys.
 * @returns Array of registered provider keys
 */
export function getRegisteredProviders(): string[] {
    return Array.from(providers.keys());
}

/**
 * Check if a provider is registered.
 * @param key - Provider identifier
 * @returns true if provider exists
 */
export function hasProvider(key: string): boolean {
    return providers.has(key.toLowerCase());
}

// Auto-register default providers
registerProvider('ibkr', new IbkrProvider());
