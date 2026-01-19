/**
 * Stringify implementation for @cldmv/jsonv
 *
 * Phase 5 Implementation:
 * - JSON/JSON5/jsonv output modes
 * - BigInt serialization strategies
 * - Numeric separator handling
 * - Replacer and space options (JSON.stringify compatible)
 * - Raw JSON object handling
 * - Circular reference detection
 */

import type { StringifyOptions, RawJSON } from "./api-types.mjs";

/**
 * Symbol to mark raw JSON objects
 */
const RAW_JSON_SYMBOL = Symbol.for("@cldmv/jsonv:rawJSON");

/**
 * Stringify JavaScript value to jsonv/JSON5/JSON text
 *
 * @param value - The value to serialize
 * @param replacer - Optional replacer function or property array
 * @param space - Indentation string or number of spaces
 * @returns The serialized text
 */
export function stringify(
	value: any,
	replacer?: ((this: any, key: string, value: any) => any) | Array<string | number> | null,
	space?: string | number
): string {
	// Convert parameters to options object
	const options: StringifyOptions = {
		mode: "jsonv",
		bigint: "native",
		preserveNumericFormatting: false
	};

	if (typeof replacer === "function") {
		options.replacer = replacer;
	} else if (Array.isArray(replacer)) {
		options.replacer = replacer;
	}

	if (typeof space === "number") {
		options.space = space;
	} else if (typeof space === "string") {
		options.space = space;
	}

	return stringifyWithOptions(value, options);
}

/**
 * Stringify with explicit options
 *
 * @param value - The value to serialize
 * @param options - Stringify options
 * @returns The serialized text
 */
export function stringifyWithOptions(value: any, options?: StringifyOptions): string {
	const opts: Required<StringifyOptions> = {
		mode: options?.mode ?? "jsonv",
		bigint: options?.bigint ?? "native",
		preserveNumericFormatting: options?.preserveNumericFormatting ?? false,
		replacer: options?.replacer ?? null,
		space: options?.space ?? 0,
		singleQuote: options?.singleQuote ?? false,
		trailingComma: options?.trailingComma ?? false,
		unquotedKeys: options?.unquotedKeys ?? false
	};

	// Calculate indentation
	let indent = "";
	if (typeof opts.space === "number" && opts.space > 0) {
		indent = " ".repeat(Math.min(opts.space, 10));
	} else if (typeof opts.space === "string") {
		indent = opts.space.slice(0, 10);
	}

	const stringifier = new Stringifier(opts, indent);
	return stringifier.stringify(value);
}

/**
 * Create a raw JSON object that serializes as-is
 * Compatible with modern JSON.rawJSON API
 *
 * @param text - The raw JSON text
 * @returns A raw JSON object
 */
export function rawJSON(text: string): RawJSON {
	// Validate that text is valid JSON
	try {
		JSON.parse(text);
	} catch {
		throw new TypeError("rawJSON text must be valid JSON");
	}

	return {
		[RAW_JSON_SYMBOL]: true,
		rawJSON: text
	} as RawJSON;
}

/**
 * Test if value is a raw JSON object
 * Compatible with modern JSON.isRawJSON API
 *
 * @param value - The value to test
 * @returns True if value is a raw JSON object
 */
export function isRawJSON(value: unknown): value is RawJSON {
	return value !== null && typeof value === "object" && RAW_JSON_SYMBOL in value && (value as any)[RAW_JSON_SYMBOL] === true;
}

/**
 * Internal stringifier class
 */
class Stringifier {
	private seen = new Set<any>();
	private indentLevel = 0;

	constructor(
		private options: Required<StringifyOptions>,
		private indent: string
	) {}

	stringify(value: any): string {
		// Apply replacer to root value
		if (this.options.replacer && typeof this.options.replacer === "function") {
			value = this.options.replacer.call({ "": value }, "", value);
		}

		return this.stringifyValue(value, "");
	}

	private stringifyValue(value: any, key: string): string {
		// Handle undefined (not serializable in JSON)
		if (value === undefined) {
			return "undefined";
		}

		// Handle null
		if (value === null) {
			return "null";
		}

		// Handle raw JSON objects
		if (isRawJSON(value)) {
			return value.rawJSON;
		}

		// Handle primitives
		const type = typeof value;

		if (type === "string") {
			return this.stringifyString(value);
		}

		if (type === "number") {
			if (Number.isNaN(value)) {
				return this.options.mode === "json" ? "null" : "NaN";
			}
			if (!Number.isFinite(value)) {
				if (this.options.mode === "json") {
					return "null";
				}
				return value > 0 ? "Infinity" : "-Infinity";
			}
			return String(value);
		}

		if (type === "boolean") {
			return String(value);
		}

		if (type === "bigint") {
			return this.stringifyBigInt(value);
		}

		if (type === "symbol" || type === "function") {
			return "undefined";
		}

		// Handle Date
		if (value instanceof Date) {
			return this.stringifyString(value.toISOString());
		}

		// Handle arrays
		if (Array.isArray(value)) {
			return this.stringifyArray(value);
		}

		// Handle objects
		if (type === "object") {
			return this.stringifyObject(value);
		}

		return "null";
	}

	private stringifyString(str: string): string {
		const quote = this.options.singleQuote && this.options.mode !== "json" ? "'" : '"';
		let result = quote;

		for (let i = 0; i < str.length; i++) {
			const char = str[i];
			const code = str.charCodeAt(i);

			// Escape sequences
			switch (char) {
				case "\\":
					result += "\\\\";
					break;
				case "\b":
					result += "\\b";
					break;
				case "\f":
					result += "\\f";
					break;
				case "\n":
					result += "\\n";
					break;
				case "\r":
					result += "\\r";
					break;
				case "\t":
					result += "\\t";
					break;
				case '"':
					result += quote === '"' ? '\\"' : '"';
					break;
				case "'":
					result += quote === "'" ? "\\'" : "'";
					break;
				default:
					if (code < 0x20 || code === 0x7f) {
						result += "\\u" + code.toString(16).padStart(4, "0");
					} else {
						result += char;
					}
			}
		}

		result += quote;
		return result;
	}

	private stringifyBigInt(value: bigint): string {
		const strategy = this.options.bigint;

		if (strategy === "native" && this.options.mode !== "json") {
			return value.toString() + "n";
		}

		if (strategy === "string") {
			return this.stringifyString(value.toString());
		}

		if (strategy === "object") {
			return `{"$bigint":${this.stringifyString(value.toString())}}`;
		}

		// Default to string for JSON mode
		return this.stringifyString(value.toString());
	}

	private stringifyArray(arr: any[]): string {
		// Check for circular reference
		if (this.seen.has(arr)) {
			throw new TypeError("Converting circular structure to JSON");
		}

		this.seen.add(arr);
		this.indentLevel++;

		let result = "[";
		const hasIndent = this.indent.length > 0;

		for (let i = 0; i < arr.length; i++) {
			if (i > 0) {
				result += ",";
			}

			if (hasIndent) {
				result += "\n" + this.indent.repeat(this.indentLevel);
			}

			let element = arr[i];

			// Apply replacer
			if (this.options.replacer && typeof this.options.replacer === "function") {
				element = this.options.replacer.call(arr, String(i), element);
			}

			result += this.stringifyValue(element, String(i));
		}

		// Trailing comma for JSON5/jsonv
		if (arr.length > 0 && this.options.mode !== "json" && hasIndent) {
			result += ",";
		}

		this.indentLevel--;

		if (hasIndent && arr.length > 0) {
			result += "\n" + this.indent.repeat(this.indentLevel);
		}

		result += "]";

		this.seen.delete(arr);
		return result;
	}

	private stringifyObject(obj: any): string {
		// Check for circular reference
		if (this.seen.has(obj)) {
			throw new TypeError("Converting circular structure to JSON");
		}

		this.seen.add(obj);
		this.indentLevel++;

		let result = "{";
		const hasIndent = this.indent.length > 0;
		let first = true;

		// Get keys to serialize
		let keys = Object.keys(obj);

		// Filter by replacer array if provided
		if (Array.isArray(this.options.replacer)) {
			const allowedKeys = new Set(this.options.replacer.map(String));
			keys = keys.filter((k) => allowedKeys.has(k));
		}

		for (const key of keys) {
			let value = obj[key];

			// Apply replacer function
			if (this.options.replacer && typeof this.options.replacer === "function") {
				value = this.options.replacer.call(obj, key, value);
			}

			// Skip undefined values
			if (value === undefined || typeof value === "function" || typeof value === "symbol") {
				continue;
			}

			if (!first) {
				result += ",";
			}

			if (hasIndent) {
				result += "\n" + this.indent.repeat(this.indentLevel);
			}

			// Key
			if (this.options.mode !== "json" && this.isValidIdentifier(key)) {
				result += key;
			} else {
				result += this.stringifyString(key);
			}

			result += ":";
			if (hasIndent) {
				result += " ";
			}

			// Value
			result += this.stringifyValue(value, key);

			first = false;
		}

		// Trailing comma for JSON5/jsonv
		if (!first && this.options.mode !== "json" && hasIndent) {
			result += ",";
		}

		this.indentLevel--;

		if (hasIndent && !first) {
			result += "\n" + this.indent.repeat(this.indentLevel);
		}

		result += "}";

		this.seen.delete(obj);
		return result;
	}

	private isValidIdentifier(key: string): boolean {
		if (key.length === 0) {
			return false;
		}

		// Check if key is a valid JavaScript identifier
		// Start: letter, _, $
		// Rest: letter, digit, _, $
		const identifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
		return identifierRegex.test(key);
	}
}
