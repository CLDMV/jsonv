/**
 * Public API types for @cldmv/jsonv
 */

// TODO: Phase 4-5 - These types will be used in DiagnoseResult and ParseResult
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ParseError, Comment } from "./ast-types.mjs";

/**
 * Options for parsing jsonv text
 */
export interface ParseOptions {
	/**
	 * Reviver function for transforming parsed values (JSON.parse compatible)
	 */
	reviver?: (this: any, key: string, value: any) => any;

	/**
	 * Parsing mode compatibility
	 * - 'jsonv': Full jsonv features for target year (default)
	 * - 'json5': Exactly JSON5 1.0 (https://spec.json5.org/), no jsonv extensions
	 * - 'json': Exactly RFC 8259 JSON
	 *
	 * In 'json5' and 'json' modes, a feature outside the mode is rejected with a
	 * positioned `JsonvSyntaxError` whose `code` is `"FEATURE_NOT_ALLOWED_IN_MODE"`.
	 * Any other value throws a `TypeError`.
	 */
	mode?: "jsonv" | "json5" | "json";

	/**
	 * Target ES year (determines available features)
	 * If not specified, uses latest (2025)
	 */
	year?: 2011 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025;

	/**
	 * Enable internal reference resolution
	 * Default: true for ES2011+
	 */
	allowInternalReferences?: boolean;

	/**
	 * Preserve comments in parse result
	 * Default: false
	 */
	preserveComments?: boolean;

	/**
	 * Tolerant mode: collect multiple errors instead of failing on first.
	 *
	 * The parser recovers at the next property / element boundary after a
	 * syntax error and keeps going, so one parse reports every syntax error.
	 * - `parse` / `parseWithOptions` (and the year entry points): if any syntax
	 *   error was collected, one `JsonvAggregateSyntaxError` (a
	 *   `JsonvSyntaxError`) is thrown and the document is not evaluated. Its
	 *   `errors` array holds every error in source order, each a
	 *   `JsonvSyntaxError` with `line`, `column`, `offset` and `code`; its own
	 *   message, position and code are the first error's, and the message ends
	 *   with the total count. A lexical error (which stops tokenization) is
	 *   reported the same way. Input without syntax errors evaluates exactly as
	 *   in a strict parse.
	 * - `parseToAst`: never throws for collected errors; they are returned in
	 *   its `errors` array.
	 *
	 * Default: false
	 */
	tolerant?: boolean;

	/**
	 * Strict BigInt mode: require 'n' suffix for integers outside safe range
	 * When false, automatically converts large integers to BigInt
	 * When true, throws error if large integer lacks 'n' suffix
	 * Default: false (auto-convert for convenience)
	 */
	strictBigInt?: boolean;

	/**
	 * Strict octal mode: require '0o' prefix for octal literals
	 * When false, allows both 0o755 and legacy 0755 syntax
	 * When true, legacy 0755 syntax throws error
	 * Default: false (allow both forms)
	 */
	strictOctal?: boolean;
}

/**
 * Options for stringifying values to jsonv text
 */
export interface StringifyOptions {
	/**
	 * Replacer function or property filter array (JSON.stringify compatible)
	 */
	replacer?: ((this: any, key: string, value: any) => any) | Array<string | number> | null;

	/**
	 * Indentation string or number of spaces
	 */
	space?: string | number;

	/**
	 * Output mode
	 * - 'jsonv': Full jsonv features (default)
	 * - 'json5': JSON5 output
	 * - 'json': Strict JSON output
	 */
	mode?: "jsonv" | "json5" | "json";

	/**
	 * BigInt serialization strategy
	 * - 'native': Output as BigInt literal with 'n' suffix (default for jsonv mode)
	 * - 'string': Output as string
	 * - 'object': Output as { "$bigint": "value" }
	 */
	bigint?: "native" | "string" | "object";

	/**
	 * Preserve numeric separator formatting from original parse
	 * Default: false (normalize to canonical form)
	 */
	preserveNumericFormatting?: boolean;

	/**
	 * Use single quotes for strings (JSON5/jsonv only)
	 * Default: false (use double quotes)
	 */
	singleQuote?: boolean;

	/**
	 * Use trailing commas (JSON5/jsonv only)
	 * Default: false
	 */
	trailingComma?: boolean;

	/**
	 * Use unquoted object keys when possible (JSON5/jsonv only)
	 * Default: false
	 */
	unquotedKeys?: boolean;
}

/**
 * Result from diagnose() method
 */
export interface DiagnoseResult {
	/**
	 * Whether the input is valid jsonv
	 */
	valid: boolean;

	/**
	 * Detected ES year (minimum year required for features used)
	 */
	year: 2011 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025;

	/**
	 * List of features detected in the input
	 */
	features: string[];

	/**
	 * Parsed value
	 */
	value: any;

	/**
	 * Compatibility warnings
	 */
	warnings: string[];

	/**
	 * Notes about compatibility with other years
	 */
	compatibility: {
		json: boolean; // Compatible with strict JSON?
		json5: boolean; // Compatible with JSON5?
		year: number; // Minimum year required
	};
}

/**
 * Result from info() method (simplified diagnose)
 */
export interface InfoResult {
	/**
	 * Whether the input is valid jsonv
	 */
	valid: boolean;

	/**
	 * Detected ES year
	 */
	year: 2011 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025;

	/**
	 * Parsed value
	 */
	value: any;
}

/**
 * Raw JSON object (compatibility with modern JSON API)
 */
export interface RawJSON {
	readonly rawJSON: string;
}

/**
 * Main API interface exported from each year module
 */
export interface JSONVApi {
	/**
	 * Parse jsonv text to JavaScript value
	 */
	parse(text: string, reviver?: ((this: any, key: string, value: any) => any) | ParseOptions): any;

	/**
	 * Parse with explicit options
	 */
	parseWithOptions(text: string, options?: ParseOptions): any;

	/**
	 * Serialize JavaScript value to jsonv text (JSON.stringify compatible signature)
	 * For advanced options, use stringifyWithOptions()
	 */
	stringify(
		value: any,
		replacer?: ((this: any, key: string, value: any) => any) | Array<string | number> | null,
		space?: string | number
	): string;

	/**
	 * Stringify with explicit options
	 */
	stringifyWithOptions(value: any, options?: StringifyOptions): string;

	/**
	 * Test if value is a raw JSON object
	 */
	isRawJSON(value: unknown): value is RawJSON;

	/**
	 * Create a raw JSON object that serializes as-is
	 */
	rawJSON(text: string): RawJSON;

	/**
	 * Analyze jsonv text and return detailed diagnostics
	 */
	diagnose(text: string): DiagnoseResult;

	/**
	 * Get basic info about jsonv text (simplified diagnose)
	 */
	info(text: string): InfoResult;
}
