/**
 * Lexer Token Types for @cldmv/jsonv
 *
 * Defines all token types recognized by the lexer across all ES years (2011-2025).
 */

import type { SourceLocation } from "../ast-types.mjs";
import { JsonvSyntaxError } from "../errors.mjs";

/**
 * All possible token types in @cldmv/jsonv
 */
export enum TokenType {
	// JSON base tokens
	STRING = "String",
	NUMBER = "Number",
	TRUE = "True",
	FALSE = "False",
	NULL = "Null",

	// Punctuation
	LBRACE = "{", // {
	RBRACE = "}", // }
	LBRACKET = "[", // [
	RBRACKET = "]", // ]
	COLON = ":", // :
	COMMA = ",", // ,
	DOT = ".", // . (for member expressions)

	// JSON5 / ES2011 additions
	IDENTIFIER = "Identifier", // Unquoted keys, internal refs
	INFINITY = "Infinity",
	NAN = "NaN",
	LINE_COMMENT = "LineComment", // //
	BLOCK_COMMENT = "BlockComment", // /* */

	// ES2015 additions
	// Template tokens include their delimiters: `raw` and `loc` run from the
	// opening ` or the } that closes the previous interpolation through the
	// closing ` or the next ${, so a template's tokens tile its source with no gaps.
	TEMPLATE_LITERAL = "TemplateLiteral", // `string`
	TEMPLATE_HEAD = "TemplateHead", // `string${
	TEMPLATE_MIDDLE = "TemplateMiddle", // }string${
	TEMPLATE_TAIL = "TemplateTail", // }string`

	// ES2020 addition
	BIGINT = "BigInt", // 123n

	// Special tokens
	EOF = "EOF", // End of file
	UNKNOWN = "Unknown" // Unknown token (error state)
}

/**
 * Token produced by the lexer
 */
export interface Token {
	/**
	 * Type of token
	 */
	type: TokenType;

	/**
	 * Parsed value of the token
	 * - String tokens: unescaped string content
	 * - Number tokens: numeric value (number or bigint)
	 * - Boolean tokens: true or false
	 * - Null token: null
	 * - Identifier: identifier name
	 * - Comments: comment text (without delimiters)
	 * - Template tokens: cooked (unescaped) text without the `` ` ``, `${` and `}` delimiters
	 * - Others: usually the raw string
	 */
	value: string | number | bigint | boolean | null;

	/**
	 * Raw source text of the token (as it appears in input), always equal to
	 * `input.slice(loc.start.offset, loc.end.offset)`. Template tokens include
	 * their delimiters: `` `a${ `` (head), `}b${` (middle), `` }c` `` (tail).
	 */
	raw: string;

	/**
	 * Source location (line/column info)
	 */
	loc: SourceLocation;
}

/**
 * Years where new jsonv features were introduced
 * Years not in this list inherit features from the nearest older year
 */
export const FEATURE_YEARS = [2011, 2015, 2020, 2021] as const;

/**
 * Map any ES year to the closest year with feature additions
 * Years without new features inherit from the nearest older year
 *
 * @param year - Target ES year (>= 2011)
 * @returns Closest year with actual feature definitions
 * @example
 * getFeatureYear(2013) // 2011 (no changes in 2012-2014)
 * getFeatureYear(2019) // 2015 (no changes in 2016-2019)
 * getFeatureYear(2025) // 2021 (no changes in 2022-2025)
 */
export function getFeatureYear(year: number): number {
	const minYear = FEATURE_YEARS[0];
	if (year < minYear) {
		return minYear;
	}

	// Find the closest year <= target year that has features
	for (let i = FEATURE_YEARS.length - 1; i >= 0; i--) {
		if (year >= FEATURE_YEARS[i]) {
			return FEATURE_YEARS[i];
		}
	}

	return minYear;
}

/**
 * Parsing mode: which syntax a document may use.
 * - `"jsonv"`: every jsonv feature available in the selected year
 * - `"json5"`: exactly JSON5 1.0 (https://spec.json5.org/)
 * - `"json"`: exactly RFC 8259 JSON
 */
export type ParseMode = "jsonv" | "json5" | "json";

/**
 * Error code for a syntax feature that the selected `mode` does not allow
 * (e.g. a trailing comma in `mode: "json"`, a template literal in
 * `mode: "json5"`). The message names the feature and the mode.
 */
export const FEATURE_NOT_ALLOWED_IN_MODE = "FEATURE_NOT_ALLOWED_IN_MODE";

/**
 * Display names used in mode error messages
 */
export const MODE_LABELS: Readonly<Record<ParseMode, string>> = {
	jsonv: "jsonv",
	json5: "JSON5",
	json: "JSON"
};

/**
 * Validate a `mode` option value.
 *
 * @param mode - The `mode` option as passed by the caller
 * @returns The mode, or `"jsonv"` when `mode` is `undefined` or `null`
 * @throws {TypeError} When `mode` is anything other than `"jsonv"`, `"json5"` or `"json"`
 */
export function resolveMode(mode: unknown): ParseMode {
	if (mode === undefined || mode === null) {
		return "jsonv";
	}
	if (mode === "jsonv" || mode === "json5" || mode === "json") {
		return mode;
	}
	const shown = typeof mode === "string" ? `"${mode}"` : String(mode);
	throw new TypeError(`Invalid parse mode: ${shown} (expected "jsonv", "json5" or "json")`);
}

/**
 * Lexer configuration options
 */
export interface LexerOptions {
	/**
	 * Preserve comments in token stream
	 * Default: false
	 */
	preserveComments?: boolean;

	/**
	 * Target ES year (determines which token types are allowed)
	 * Accepts any year >= 2011. Years without new features inherit from nearest older year.
	 * Default: current year
	 */
	year?: number;

	/**
	 * Allow numeric separators (ES2021+)
	 * Default: auto-detected from year
	 */
	allowNumericSeparators?: boolean;

	/**
	 * Allow BigInt literals (ES2020+)
	 * Default: auto-detected from year
	 */
	allowBigInt?: boolean;

	/**
	 * Allow template literals (ES2015+)
	 * Default: auto-detected from year
	 */
	allowTemplateLiterals?: boolean;

	/**
	 * Allow hexadecimal literals (JSON5/ES2011+)
	 * Default: auto-detected from year
	 */
	allowHexLiterals?: boolean;

	/**
	 * Allow binary and octal literals (ES2015+)
	 * Default: auto-detected from year
	 */
	allowBinaryOctalLiterals?: boolean;

	/**
	 * Strict mode (disallow legacy octal like 0755 without 0o prefix)
	 * Default: false (allow both 0o755 and 0755)
	 */
	strictOctal?: boolean;

	/**
	 * Parsing mode (determines strictness)
	 * - 'jsonv': Full jsonv features
	 * - 'json5': Exactly JSON5 1.0
	 * - 'json': Exactly RFC 8259 JSON
	 * Default: 'jsonv'. Any other value throws a `TypeError`.
	 */
	mode?: ParseMode;
}

/**
 * Lexer error with position information
 *
 * Extends {@link JsonvSyntaxError}, so a `LexerError` is also a
 * `JsonvSyntaxError` (and a `SyntaxError`) with `line`/`column`/`offset`
 * properties; `name` stays `"LexerError"` (this class's existing, more
 * specific convention) rather than the base class's `"SyntaxError"`.
 */
export class LexerError extends JsonvSyntaxError {
	/**
	 * Create a lexer error
	 * @param message - Error message
	 * @param loc - Source location of the error
	 * @param code - Error code for programmatic handling
	 */
	constructor(message: string, loc: SourceLocation, code: string = "LEXER_ERROR") {
		super(message, loc, code);
		this.name = "LexerError";
		Object.setPrototypeOf(this, LexerError.prototype);
	}
}

/**
 * Numeric literal type (used internally by lexer)
 */
export enum NumericLiteralType {
	DECIMAL = "decimal",
	HEX = "hex",
	BINARY = "binary",
	OCTAL = "octal",
	OCTAL_LEGACY = "octal_legacy" // 0755 without 0o prefix
}
