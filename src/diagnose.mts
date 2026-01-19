/**
 * Feature detection and diagnostics for @cldmv/jsonv
 * Phase 6: Diagnose implementation
 */

import { Lexer } from "./lexer/lexer.mjs";
import { Parser } from "./parser.mjs";
import { TokenType } from "./lexer/lexer-types.mjs";
import type { DiagnoseResult, InfoResult } from "./api-types.mjs";

/**
 * Detect ES year and features used in jsonv text
 *
 * @param text - The jsonv text to analyze
 * @returns Detailed diagnostics including year, features, and compatibility
 */
export function diagnose(text: string): DiagnoseResult {
	// Parse to get value
	let valid = true;
	let value: any;
	try {
		const parser = new Parser(text, { year: 2025, allowInternalReferences: true });
		const parseResult = parser.parse();

		// Check if parser encountered any errors
		if (parseResult.errors && parseResult.errors.length > 0) {
			valid = false;
			value = undefined;
		} else {
			value = parser.evaluate(parseResult.program);
		}
	} catch (error) {
		valid = false;
		value = undefined;
	}

	// Analyze tokens for features
	const features = new Set<string>();
	let minYear: 2011 | 2015 | 2020 | 2021 = 2011;

	// Tokenize to detect features (preserve comments for detection)
	const scanLexer = new Lexer(text, { year: 2025, preserveComments: true });
	const tokens = scanLexer.tokenize();

	// Detect features by token type
	for (const token of tokens) {
		switch (token.type) {
			case TokenType.LINE_COMMENT:
			case TokenType.BLOCK_COMMENT:
				features.add("comments");
				break;

			case TokenType.NUMBER:
				// Check if the value is Infinity or NaN
				if (token.value === Infinity || token.value === -Infinity || Number.isNaN(token.value as number)) {
					features.add("special-numbers");
				}
				// Check token literal type from lexer
				if (token.raw?.startsWith("0x") || token.raw?.startsWith("0X")) {
					features.add("hex-literals");
				} else if (token.raw?.startsWith("0b") || token.raw?.startsWith("0B")) {
					features.add("binary-literals");
					minYear = Math.max(minYear, 2015) as typeof minYear;
				} else if (token.raw?.startsWith("0o") || token.raw?.startsWith("0O")) {
					features.add("octal-literals");
					minYear = Math.max(minYear, 2015) as typeof minYear;
				} else if (/^0[0-7]+$/.test(token.raw || "")) {
					features.add("octal-literals");
					minYear = Math.max(minYear, 2015) as typeof minYear;
				}
				// Check for numeric separators
				if (token.raw?.includes("_")) {
					features.add("numeric-separators");
					minYear = Math.max(minYear, 2021) as typeof minYear;
				}
				// Check for leading/trailing decimal point
				if (token.raw?.match(/^\.|\.$/)) {
					features.add("decimal-points");
				}
				break;

			case TokenType.INFINITY:
			case TokenType.NAN:
				features.add("special-numbers");
				break;

			case TokenType.BIGINT:
				features.add("bigint");
				minYear = Math.max(minYear, 2020) as typeof minYear;
				// Check for hex BigInt (0x...n), binary (0b...n), octal (0o...n)
				if (token.raw?.startsWith("0x") || token.raw?.startsWith("0X")) {
					features.add("hex-literals");
				} else if (token.raw?.startsWith("0b") || token.raw?.startsWith("0B")) {
					features.add("binary-literals");
					minYear = Math.max(minYear, 2015) as typeof minYear;
				} else if (token.raw?.startsWith("0o") || token.raw?.startsWith("0O")) {
					features.add("octal-literals");
					minYear = Math.max(minYear, 2015) as typeof minYear;
				}
				// Check for numeric separators in BigInt
				if (token.raw?.includes("_")) {
					features.add("numeric-separators");
					minYear = Math.max(minYear, 2021) as typeof minYear;
				}
				break;

			case TokenType.TEMPLATE_LITERAL:
			case TokenType.TEMPLATE_HEAD:
			case TokenType.TEMPLATE_MIDDLE:
			case TokenType.TEMPLATE_TAIL:
				features.add("template-literals");
				minYear = Math.max(minYear, 2015) as typeof minYear;
				break;

			case TokenType.STRING:
				// Check for single quotes
				if (token.raw?.startsWith("'")) {
					features.add("single-quoted-strings");
				}
				break;

			case TokenType.IDENTIFIER:
				// Check if it's a special value
				if (["Infinity", "NaN"].includes(token.value as string)) {
					features.add("special-numbers");
				}
				break;
		}
	}

	// Check for trailing commas
	for (let i = 0; i < tokens.length - 1; i++) {
		if (tokens[i].type === TokenType.COMMA) {
			const next = tokens[i + 1];
			if (next.type === TokenType.RBRACE || next.type === TokenType.RBRACKET) {
				features.add("trailing-commas");
				break;
			}
		}
	}

	// Check for unquoted keys (look for identifier followed by colon)
	for (let i = 0; i < tokens.length - 1; i++) {
		if (tokens[i].type === TokenType.IDENTIFIER && tokens[i + 1].type === TokenType.COLON) {
			features.add("unquoted-keys");
			break;
		}
	}

	// Check for internal references in the parsed value
	if (hasInternalReferences(value, text)) {
		features.add("internal-references");
	}

	// Generate warnings
	const warnings: string[] = [];
	const featureList = Array.from(features);

	if (features.has("bigint")) {
		warnings.push("Uses BigInt literals - requires ES2020+ or polyfill");
	}

	if (features.has("numeric-separators")) {
		warnings.push("Uses numeric separators - requires ES2021+");
	}

	if (features.has("binary-literals") || features.has("octal-literals") || features.has("template-literals")) {
		warnings.push("Uses ES2015 literal syntax - requires ES2015+ parser");
	}

	if (features.has("internal-references")) {
		warnings.push("Uses internal references - requires jsonv parser (not compatible with standard JSON/JSON5)");
	}

	// Determine compatibility
	const json =
		!features.has("comments") &&
		!features.has("trailing-commas") &&
		!features.has("unquoted-keys") &&
		!features.has("single-quoted-strings") &&
		!features.has("hex-literals") &&
		!features.has("binary-literals") &&
		!features.has("octal-literals") &&
		!features.has("bigint") &&
		!features.has("numeric-separators") &&
		!features.has("template-literals") &&
		!features.has("special-numbers") &&
		!features.has("internal-references") &&
		!features.has("decimal-points");

	const json5 =
		!features.has("binary-literals") &&
		!features.has("octal-literals") &&
		!features.has("bigint") &&
		!features.has("numeric-separators") &&
		!features.has("template-literals") &&
		!features.has("internal-references");

	return {
		valid,
		year: minYear,
		features: featureList,
		value,
		warnings,
		compatibility: {
			json,
			json5,
			year: minYear
		}
	};
}

/**
 * Get basic info about jsonv text (simplified diagnose)
 *
 * @param text - The jsonv text to analyze
 * @returns ES year and parsed value
 */
export function info(text: string): InfoResult {
	const result = diagnose(text);
	return {
		valid: result.valid,
		year: result.year,
		value: result.value
	};
}

/**
 * Check if value contains internal references
 * Heuristic: check if text contains identifiers that look like references
 */
function hasInternalReferences(value: any, text: string): boolean {
	// Check for template interpolation
	if (text.includes("${")) {
		return true;
	}

	// Check for bare identifiers in object values
	// This is a simple heuristic - look for patterns like: key: bareIdentifier
	const referencePattern = /:\s*[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*(?:\s*[,}\]])/;
	if (referencePattern.test(text)) {
		return true;
	}

	return false;
}
