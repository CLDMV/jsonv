/**
 * Structured error types for @cldmv/jsonv
 *
 * Every jsonv parse entry point (lexer-level and parser-level, strict and
 * tolerant modes, year-gated feature checks) throws a {@link JsonvSyntaxError}
 * so consumers can detect a jsonv parse failure with `instanceof` and read
 * its position via `line`/`column`/`offset` instead of parsing the message
 * text.
 */

import type { SourceLocation } from "./ast-types.mjs";

/**
 * A `SyntaxError` raised while lexing or parsing jsonv text.
 *
 * Carries the same structured source-location info already used internally
 * to build the error message, exposed as plain numeric properties so callers
 * don't have to parse `line X, column Y` out of {@link Error.message}.
 *
 * `name` remains `"SyntaxError"` (matching the plain `SyntaxError` this
 * replaces), so existing `error.name === "SyntaxError"` / `error instanceof
 * SyntaxError` checks keep working unchanged. Use `instanceof
 * JsonvSyntaxError` to detect jsonv's own positioned errors specifically.
 *
 * @example
 * ```js
 * import { parse, JsonvSyntaxError } from "@cldmv/jsonv";
 *
 * try {
 *   parse("{ a: 1, }");
 * } catch (err) {
 *   if (err instanceof JsonvSyntaxError) {
 *     console.log(err.line, err.column, err.offset);
 *   }
 * }
 * ```
 */
export class JsonvSyntaxError extends SyntaxError {
	/**
	 * Full source location (start/end line, column, offset) of the error.
	 */
	public readonly loc: SourceLocation;

	/**
	 * 1-based line number where the error occurred. Matches the line number
	 * embedded in {@link Error.message}, when the message embeds one.
	 */
	public readonly line: number;

	/**
	 * Column where the error occurred. Uses the same numbering as the column
	 * embedded in {@link Error.message}, when the message embeds one (the
	 * jsonv lexer/parser track column as a 0-based offset into the line).
	 */
	public readonly column: number;

	/**
	 * 0-based character offset into the source text where the error occurred.
	 */
	public readonly offset: number;

	/**
	 * Machine-readable error code (e.g. `"UNTERMINATED_STRING"`, `"PARSE_ERROR"`).
	 */
	public readonly code: string;

	/**
	 * Create a positioned jsonv syntax error.
	 * @param message - Human-readable error message
	 * @param loc - Source location of the error
	 * @param code - Machine-readable error code
	 */
	constructor(message: string, loc: SourceLocation, code: string = "SYNTAX_ERROR") {
		super(message);
		this.name = "SyntaxError";
		this.loc = loc;
		this.line = loc.start.line;
		this.column = loc.start.column;
		this.offset = loc.start.offset;
		this.code = code;
		Object.setPrototypeOf(this, JsonvSyntaxError.prototype);
	}
}
