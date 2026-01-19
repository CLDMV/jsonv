/**
 * ES2015 Year Module
 *
 * Exports the jsonv API configured for ES2015 features (2011 base + 2015):
 * - All ES2011 (JSON5) features
 * - Binary integer literals (0b1010)
 * - New octal syntax (0o755, alongside old 0755)
 * - Template literals with backticks
 * - Template literal interpolation for internal references (${ref})
 */

import { parseWithOptions as parseWithOptionsImpl } from "../parser.mjs";
import {
	stringify as stringifyImpl,
	stringifyWithOptions as stringifyWithOptionsImpl,
	rawJSON as rawJSONImpl,
	isRawJSON as isRawJSONImpl
} from "../stringify.mjs";
import { diagnose as diagnoseImpl, info as infoImpl } from "../diagnose.mjs";
import type { ParseOptions, StringifyOptions, DiagnoseResult, InfoResult, RawJSON, JSONVApi } from "../api-types.mjs";

/**
 * Parse jsonv text with ES2015 features
 */
function parse(text: string, reviver?: (this: any, key: string, value: any) => any): any {
	const options: ParseOptions = {
		year: 2015,
		mode: "jsonv",
		reviver
	};
	return parseWithOptionsImpl(text, options);
}

/**
 * Parse with explicit options
 */
function parseWithOptions(text: string, options?: ParseOptions): any {
	return parseWithOptionsImpl(text, { ...options, year: 2015 });
}

/**
 * Stringify value with ES2015 output
 */
function stringify(
	value: any,
	replacer?: ((this: any, key: string, value: any) => any) | Array<string | number> | null,
	space?: string | number
): string {
	return stringifyImpl(value, replacer, space);
}

/**
 * Stringify with explicit options
 */
function stringifyWithOptions(value: any, options?: StringifyOptions): string {
	return stringifyWithOptionsImpl(value, { mode: "jsonv", ...options });
}

/**
 * Test if value is a raw JSON object
 */
function isRawJSON(value: unknown): value is RawJSON {
	return isRawJSONImpl(value);
}

/**
 * Create a raw JSON object
 */
function rawJSON(text: string): RawJSON {
	return rawJSONImpl(text);
}

/**
 * Analyze jsonv text and return detailed diagnostics
 */
function diagnose(text: string): DiagnoseResult {
	return diagnoseImpl(text);
}

/**
 * Get basic info about jsonv text
 */
function info(text: string): InfoResult {
	return infoImpl(text);
}

/**
 * JSONV API object for ES2015
 */
const JSONV: JSONVApi = {
	parse,
	parseWithOptions,
	stringify,
	stringifyWithOptions,
	isRawJSON,
	rawJSON,
	diagnose,
	info
};

// Individual exports
export { parse, parseWithOptions, stringify, stringifyWithOptions, isRawJSON, rawJSON, diagnose, info };

// Default export
export default JSONV;
