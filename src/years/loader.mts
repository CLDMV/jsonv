/**
 * Dynamic year loader for @cldmv/jsonv
 *
 * Allows importing any ES year dynamically and automatically resolves
 * to the nearest published year implementation.
 *
 * @example
 * ```typescript
 * import { loadYear } from '@cldmv/jsonv/loader';
 *
 * // Load ES2023 (resolves to ES2021)
 * const jsonv2023 = await loadYear(2023);
 * const data = jsonv2023.parse('{ value: 123n }');
 *
 * // Load ES2017 (resolves to ES2015)
 * const jsonv2017 = await loadYear(2017);
 * ```
 */

import { resolveYear } from "./year-resolver.mjs";
import type { JSONVApi } from "../api-types.mjs";

/**
 * Year to module path mapping
 * Maps published years to their actual module files
 */
const YEAR_MODULES: Record<number, string> = {
	2011: "./2011.mjs",
	2012: "./2012.mjs",
	2013: "./2013.mjs",
	2014: "./2014.mjs",
	2015: "./2015.mjs",
	2016: "./2016.mjs",
	2017: "./2017.mjs",
	2018: "./2018.mjs",
	2019: "./2019.mjs",
	2020: "./2020.mjs",
	2021: "./2021.mjs",
	2022: "./2022.mjs",
	2023: "./2023.mjs",
	2024: "./2024.mjs",
	2025: "./2025.mjs"
};

/**
 * Dynamically load a year module
 *
 * @param year - The ES year to load (2011-2025, or any year to resolve backwards)
 * @returns Promise resolving to the year module API
 *
 * @example
 * ```typescript
 * // Load latest published year for ES2023
 * const jsonv = await loadYear(2023); // Resolves to 2021
 *
 * // Load specific year
 * const jsonv2015 = await loadYear(2015);
 *
 * // Load year before first published - gets minimum
 * const jsonv2010 = await loadYear(2010); // Resolves to 2011
 * ```
 */
export async function loadYear(year: number): Promise<JSONVApi> {
	// Resolve to nearest published year
	const resolvedYear = resolveYear(year);

	// Get module path
	const modulePath = YEAR_MODULES[resolvedYear];
	if (!modulePath) {
		throw new Error(`No module found for resolved year ${resolvedYear}`);
	}

	// Dynamically import the module
	const module = await import(modulePath);
	return module.default as JSONVApi;
}

/**
 * Synchronously get the year that would be loaded for a given year
 * Useful for determining which implementation will be used without loading
 *
 * @param year - The ES year to check
 * @returns The year that will actually be loaded
 *
 * @example
 * ```typescript
 * getLoadedYear(2023); // 2021
 * getLoadedYear(2017); // 2015
 * getLoadedYear(2010); // 2011
 * ```
 */
export function getLoadedYear(year: number): number {
	return resolveYear(year);
}

/**
 * Check if a specific year module exists
 *
 * @param year - The year to check
 * @returns True if the year has a module file (even if it forwards to another year)
 */
export function hasYearModule(year: number): boolean {
	return year in YEAR_MODULES;
}

/**
 * Get all available year modules
 *
 * @returns Array of years that have module files
 */
export function getAvailableYears(): number[] {
	return Object.keys(YEAR_MODULES)
		.map(Number)
		.sort((a, b) => a - b);
}
