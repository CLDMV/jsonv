/**
 * ES2011 (JSON5) Year Module
 *
 * Exports the jsonv API configured for ES2011 (JSON5 base) features:
 * - Single and multi-line comments
 * - Trailing commas
 * - Single and double quoted strings
 * - Unquoted object keys
 * - Hexadecimal numbers (0x)
 * - Leading and trailing decimal points (.5, 5.)
 * - Positive sign (+42)
 * - Infinity and NaN
 * - Multi-line strings (line continuations)
 * - Internal references (bare identifiers only at this year)
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
 * Parse jsonv text with ES2011 (JSON5) features
 */
function parse(text: string, reviver?: (this: any, key: string, value: any) => any): any {
	const options: ParseOptions = {
		year: 2011,
		mode: "json5",
		reviver
	};
	return parseWithOptionsImpl(text, options);
}

/**
 * Parse with explicit options
 */
function parseWithOptions(text: string, options?: ParseOptions): any {
	return parseWithOptionsImpl(text, { ...options, year: 2011 });
}

/**
 * Stringify value with ES2011 (JSON5) output
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
	return stringifyWithOptionsImpl(value, { mode: "json5", ...options });
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
 * JSONV API object for ES2011 (JSON5)
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
