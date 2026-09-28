/**
 * Structured error types for @cldmv/jsonv
 *
 * Every jsonv parse entry point (lexer-level and parser-level, strict and
 * tolerant modes, year-gated feature checks) throws a {@link JsonvSyntaxError}
 * so consumers can detect a jsonv parse failure with `instanceof` and read
 * its position via `line`/`column`/`offset` instead of parsing the message
 * text.
 *
 * Internal-reference resolution failures (unresolved and circular
 * references) throw the sibling {@link JsonvReferenceError} instead, with
 * the same `line`/`column`/`offset`/`code` shape but pointing at the
 * offending reference node.
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

/**
 * A `ReferenceError` raised when jsonv's internal-reference resolution fails
 * -- an identifier/member-expression/template reference that never resolves
 * to a concrete value. A reference to a key that does not exist throws
 * `Unresolved reference: <path> (circular reference or undefined)` at that
 * reference; a reference cycle throws `Circular reference: a -> b -> a`,
 * naming the keys on the cycle, at the reference that closes it. Both carry
 * the `"UNRESOLVED_REFERENCE"` code.
 *
 * Carries the same structured source-location info as {@link
 * JsonvSyntaxError} -- `loc`/`line`/`column`/`offset`/`code` -- but pointing
 * at the offending reference node rather than a lexer/parser token, so
 * callers don't have to parse `path` out of {@link Error.message}.
 *
 * `name` is `"ReferenceError"`, so `error.name === "ReferenceError"` /
 * `error instanceof ReferenceError` checks work as expected. Use `instanceof
 * JsonvReferenceError` to detect jsonv's own positioned reference errors
 * specifically.
 *
 * @example
 * ```js
 * import { parseWithOptions, JsonvReferenceError } from "@cldmv/jsonv";
 *
 * try {
 *   parseWithOptions("{ a: missing }");
 * } catch (err) {
 *   if (err instanceof JsonvReferenceError) {
 *     console.log(err.line, err.column, err.offset);
 *   }
 * }
 * ```
 */
export class JsonvReferenceError extends ReferenceError {
	/**
	 * Full source location (start/end line, column, offset) of the reference.
	 */
	public readonly loc: SourceLocation;

	/**
	 * 1-based line number where the reference occurred.
	 */
	public readonly line: number;

	/**
	 * Column where the reference occurred. Uses the same 0-based numbering as
	 * {@link JsonvSyntaxError.column}.
	 */
	public readonly column: number;

	/**
	 * 0-based character offset into the source text where the reference occurred.
	 */
	public readonly offset: number;

	/**
	 * Machine-readable error code (e.g. `"UNRESOLVED_REFERENCE"`).
	 */
	public readonly code: string;

	/**
	 * Create a positioned jsonv reference error.
	 * @param message - Human-readable error message
	 * @param loc - Source location of the offending reference
	 * @param code - Machine-readable error code
	 */
	constructor(message: string, loc: SourceLocation, code: string = "UNRESOLVED_REFERENCE") {
		super(message);
		this.name = "ReferenceError";
		this.loc = loc;
		this.line = loc.start.line;
		this.column = loc.start.column;
		this.offset = loc.start.offset;
		this.code = code;
		Object.setPrototypeOf(this, JsonvReferenceError.prototype);
	}
}
