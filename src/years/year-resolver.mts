/**
 * Year resolution utility for @cldmv/jsonv
 *
 * Maps any ES year to the closest published year (backwards traversal).
 * This allows users to import any year and automatically get the appropriate implementation.
 */

/**
 * Published years with actual implementations
 * These are the years where new literal syntax or features were added
 */
export const PUBLISHED_YEARS = [2011, 2015, 2020, 2021] as const;

/**
 * Latest supported year (highest published year)
 */
export const LATEST_YEAR = 2021;

/**
 * Resolve a requested year to the nearest published year (backwards)
 *
 * @param year - The requested ES year
 * @returns The published year to use
 *
 * @example
 * resolveYear(2023) // 2021 (latest published)
 * resolveYear(2017) // 2015 (backwards to 2015)
 * resolveYear(2010) // 2011 (minimum year)
 * resolveYear(2021) // 2021 (exact match)
 */
export function resolveYear(year: number): 2011 | 2015 | 2020 | 2021 {
	// Handle years beyond latest published - use latest
	if (year >= LATEST_YEAR) {
		return LATEST_YEAR;
	}

	// Handle years before minimum - use minimum
	if (year <= 2011) {
		return 2011;
	}

	// Find the highest published year that is <= requested year
	for (let i = PUBLISHED_YEARS.length - 1; i >= 0; i--) {
		if (PUBLISHED_YEARS[i] <= year) {
			return PUBLISHED_YEARS[i];
		}
	}

	// Fallback to minimum year (should never reach here)
	return 2011;
}

/**
 * Check if a year is a published year (has its own implementation)
 *
 * @param year - The year to check
 * @returns True if year has its own implementation
 */
export function isPublishedYear(year: number): year is 2011 | 2015 | 2020 | 2021 {
	return PUBLISHED_YEARS.includes(year as any);
}

/**
 * Get all published years
 *
 * @returns Array of published years
 */
export function getPublishedYears(): readonly number[] {
	return PUBLISHED_YEARS;
}
