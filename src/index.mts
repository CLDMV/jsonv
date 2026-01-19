/**
 * @cldmv/jsonv - Main entry point
 *
 * Modern JSON parser extending JSON5 with ES2015-2025 features
 * Year-based API versioning tied to ECMAScript releases
 */

import { parse, parseWithOptions } from "./parser.mjs";
import {
	stringify as stringifyImpl,
	stringifyWithOptions as stringifyOptsImpl,
	rawJSON as rawJSONImpl,
	isRawJSON as isRawJSONImpl
} from "./stringify.mjs";
import { diagnose as diagnoseImpl, info as infoImpl } from "./diagnose.mjs";
import type { ParseOptions, StringifyOptions, DiagnoseResult, InfoResult, RawJSON } from "./api-types.mjs";

/**
 * Parse jsonv text to JavaScript value
 * Compatible with JSON.parse(text, reviver) signature
 *
 * @param text - The jsonv text to parse
 * @param reviver - Optional reviver function to transform values
 * @returns The parsed JavaScript value
 *
 * @example
 * ```js
 * import JSONV from '@cldmv/jsonv';
 *
 * const data = JSONV.parse('{ port: 8080, backup: port }');
 * console.log(data); // { port: 8080, backup: 8080 }
 * ```
 */
function parseJSON(text: string, reviver?: (this: any, key: string, value: any) => any): any {
	return parse(text, reviver);
}

/**
 * Serialize JavaScript value to jsonv text
 * Compatible with JSON.stringify signature
 *
 * @param value - The value to serialize
 * @param replacer - Optional replacer function or property array
 * @param space - Indentation string or number of spaces
 * @returns The serialized jsonv text
 *
 * @example
 * ```js
 * import JSONV from '@cldmv/jsonv';
 *
 * const text = JSONV.stringify({ port: 8080 }, null, 2);
 * console.log(text);
 * ```
 */
function stringify(
	value: any,
	replacer?: ((this: any, key: string, value: any) => any) | Array<string | number> | null,
	space?: string | number
): string {
	return stringifyImpl(value, replacer, space);
}

/**
 * Test if value is a raw JSON object
 * Compatible with modern JSON.isRawJSON API
 *
 * @param value - The value to test
 * @returns True if value is a raw JSON object
 *
 * @example
 * ```js
 * import JSONV from '@cldmv/jsonv';
 *
 * const raw = JSONV.rawJSON('{"key":"value"}');
 * console.log(JSONV.isRawJSON(raw)); // true
 * console.log(JSONV.isRawJSON({})); // false
 * ```
 */
function isRawJSON(value: unknown): value is RawJSON {
	return isRawJSONImpl(value);
}

/**
 * Create a raw JSON object that serializes as-is
 * Compatible with modern JSON.rawJSON API
 *
 * @param text - The raw JSON text
 * @returns A raw JSON object
 *
 * @example
 * ```js
 * import JSONV from '@cldmv/jsonv';
 *
 * const raw = JSONV.rawJSON('{"key":"value"}');
 * const result = JSONV.stringify({ data: raw });
 * // data property serializes as raw JSON text
 * ```
 */
function rawJSON(text: string): RawJSON {
	return rawJSONImpl(text);
}

/**
 * Analyze jsonv text and return detailed diagnostics
 *
 * @param text - The jsonv text to analyze
 * @returns Diagnostic information including detected year, features, and warnings
 *
 * @example
 * ```js
 * import JSONV from '@cldmv/jsonv';
 *
 * const result = JSONV.diagnose('{ value: 0b1010 }');
 * console.log(result.year); // 2015
 * console.log(result.features); // ['binary-literals']
 * ```
 */
function diagnose(text: string): DiagnoseResult {
	return diagnoseImpl(text);
}

/**
 * Get basic info about jsonv text (simplified diagnose)
 *
 * @param text - The jsonv text to analyze
 * @returns Basic information including detected year and parsed value
 *
 * @example
 * ```js
 * import JSONV from '@cldmv/jsonv';
 *
 * const result = JSONV.info('{ value: 0b1010 }');
 * console.log(result.year); // 2015
 * console.log(result.value); // { value: 10 }
 * ```
 */
function info(text: string): InfoResult {
	return infoImpl(text);
}

/**
 * Default export - JSONV API object
 * Provides JSON-compatible API with @cldmv/jsonv extensions
 */
const JSONV = {
	parse: parseJSON,
	parseWithOptions,
	stringify,
	stringifyWithOptions: stringifyOptsImpl,
	isRawJSON,
	rawJSON,
	diagnose,
	info
};

/**
 * Stringify with explicit options
 *
 * @param value - The value to serialize
 * @param options - Stringify options
 * @returns The serialized text
 */
function stringifyWithOptions(value: any, options?: StringifyOptions): string {
	return stringifyOptsImpl(value, options);
}

// Named exports
export { parseJSON as parse, parseWithOptions, stringify, stringifyWithOptions, isRawJSON, rawJSON, diagnose, info };

// Default export
export default JSONV;

// Type exports
export type { ParseOptions, StringifyOptions, DiagnoseResult, InfoResult, RawJSON };
