/**
 * AST Node Types for @cldmv/jsonv parser
 *
 * Represents the Abstract Syntax Tree for JSON/JSON5/jsonv files
 * supporting all features from ES2011 (JSON5) through ES2025.
 *
 * Every node produced by the parser carries a `loc` whose `start`/`end`
 * positions slice back to the node's exact source text via their `offset`s
 * (`text.slice(loc.start.offset, loc.end.offset)`). Lines are 1-based and
 * advance on `\n`, `\r\n` (one break), lone `\r`, U+2028 and U+2029;
 * columns and offsets are 0-based UTF-16 code-unit indexes.
 */

import type { Token } from "./lexer/lexer-types.mjs";

/**
 * Base interface for all AST nodes
 */
export interface ASTNode {
	type: string;
	loc?: SourceLocation;
}

/**
 * Source location information for error reporting
 */
export interface SourceLocation {
	start: Position;
	end: Position;
	source?: string;
}

export interface Position {
	line: number; // 1-based
	column: number; // 0-based
	offset: number; // 0-based character offset
}

/**
 * Root node containing the entire document.
 * `loc` spans the whole input, from offset 0 to the end of the text
 * (including leading/trailing whitespace and comments).
 */
export interface Program extends ASTNode {
	type: "Program";
	body: Expression;
}

/**
 * All possible expression types
 */
export type Expression = Literal | ObjectExpression | ArrayExpression | Identifier | TemplateLiteral | MemberExpression;

/**
 * Literal values (strings, numbers, booleans, null)
 */
export interface Literal extends ASTNode {
	type: "Literal";
	value: string | number | bigint | boolean | null;
	/**
	 * Source text of the literal. For a template without interpolation (backticks
	 * included) each CRLF pair and lone CR is normalized to LF, as in ECMAScript;
	 * every other literal's `raw` is the source slice at `loc`.
	 */
	raw: string;
	bigint?: string; // For BigInt literals
}

/**
 * Object expression: { key: value, ... }
 */
export interface ObjectExpression extends ASTNode {
	type: "ObjectExpression";
	properties: Property[];
}

/**
 * Object property. `loc` spans the key through the end of the value.
 */
export interface Property extends ASTNode {
	type: "Property";
	/**
	 * Positioned key node:
	 * - `Literal` for quoted keys (`"a"`, `'a'`) and numeric keys (`3`, `0x10`, `7n`)
	 * - `Identifier` for unquoted keys, including keyword keys (`true`, `null`, `Infinity`, `NaN`)
	 *
	 * The evaluated object key is `Identifier.name`, or `String(Literal.value)`.
	 */
	key: PropertyKeyNode;
	value: Expression;
	computed: boolean; // false for unquoted/quoted keys, true for computed
}

/**
 * Node types that can appear as an object property key
 */
export type PropertyKeyNode = Literal | Identifier;

/**
 * Array expression: [ value1, value2, ... ]
 */
export interface ArrayExpression extends ASTNode {
	type: "ArrayExpression";
	elements: (Expression | null)[]; // null for holes (not applicable in JSON)
}

/**
 * Identifier (for internal references)
 */
export interface Identifier extends ASTNode {
	type: "Identifier";
	name: string;
}

/**
 * Template literal (backtick strings with optional interpolation).
 * `loc` spans the opening backtick through the closing backtick.
 */
export interface TemplateLiteral extends ASTNode {
	type: "TemplateLiteral";
	quasis: TemplateElement[];
	expressions: Expression[];
}

/**
 * Template literal string segment (a quasi).
 *
 * Each quasi is its template token: `loc` and `value.raw` include the segment's
 * delimiters, so the quasis and the interpolated expressions between them tile
 * the template's source with no gaps. For `` `a${x}b${y}c` ``:
 * - head: `` `a${ `` (the opening backtick through the `${`)
 * - middle: `}b${` (the `}` that closes the previous interpolation through the next `${`)
 * - tail: `` }c` `` (the `}` that closes the last interpolation through the closing backtick)
 *
 * `value.cooked` is the segment's text without delimiters and with escapes
 * processed (`"a"`, `"b"`, `"c"`). A template without interpolation is a
 * `Literal`, not a `TemplateLiteral`.
 *
 * Line terminators follow ECMAScript: a CRLF pair or a lone CR in the segment is
 * LF in both `cooked` and `raw`, while `loc` keeps the original source offsets.
 * An escaped `\r` (backslash, `r`) is unaffected and cooks to CR.
 */
export interface TemplateElement extends ASTNode {
	type: "TemplateElement";
	value: {
		/**
		 * Source text of the segment including its delimiters: the source slice at
		 * `loc` with each CRLF pair and lone CR replaced by LF, as the ECMAScript
		 * template raw value (TRV) is. For LF sources it equals the slice exactly.
		 */
		raw: string;
		/** Segment text without delimiters, escapes processed, CRLF and lone CR cooked to LF. */
		cooked: string;
	};
	tail: boolean; // true if this is the last element
}

/**
 * Member expression for nested property access: a.b.c
 */
export interface MemberExpression extends ASTNode {
	type: "MemberExpression";
	object: Expression;
	property: Identifier;
	computed: false; // Always false for jsonv (only dot notation)
}

/**
 * Comment (returned in {@link ParseResult.comments} when `preserveComments` is set).
 * `value` is the comment text without its delimiters (`//`, `/*`, `*\/`);
 * `loc` spans the delimiters too.
 */
export interface Comment {
	type: "Line" | "Block";
	value: string;
	loc: SourceLocation;
}

/**
 * Result of {@link Parser.parse}
 */
export interface ParseResult {
	program: Program;
	/**
	 * Comments in source order. Present (possibly empty) whenever the
	 * `preserveComments` option is set; `undefined` otherwise.
	 */
	comments?: Comment[];
	/**
	 * Positioned tokens in source order, excluding comments and the EOF token
	 * (ESLint convention: tokens and comments are separate lists).
	 */
	tokens: Token[];
	/**
	 * Parse errors, or `undefined` when there are none.
	 */
	errors?: ParseError[];
}

/**
 * Result of {@link parseToAst}: a stable, tooling-oriented view of the parse
 * where every list is always present.
 *
 * `parseToAst` never throws for invalid input: lexical and parse errors are
 * both collected into `errors`. Without `tolerant`, lexing stops at the first
 * lexical error, so `tokens` and `comments` hold only what was lexed before
 * it; with `tolerant`, the lexer skips the unreadable text and keeps going.
 */
export interface AstResult {
	/**
	 * The root node. Never `null`: when there are errors it is the partial
	 * program recovered from the tokens that could be read. A value the lexer
	 * could not read is represented by a `Literal` with `value: null` whose
	 * `raw` is the unreadable source text.
	 */
	program: Program;
	/**
	 * Comments in source order (empty when `preserveComments: false` was
	 * passed). After a lexical error without `tolerant`, only the comments
	 * before the error.
	 */
	comments: Comment[];
	/**
	 * Positioned tokens in source order, excluding comments and EOF. Text the
	 * lexer could not read has no token. After a lexical error without
	 * `tolerant`, only the tokens before the error.
	 */
	tokens: Token[];
	/**
	 * Collected lexical and parse errors, in source order (empty when the input
	 * parsed cleanly). Without `tolerant`, at most one: the first lexical error
	 * if there is one, otherwise the first parse error.
	 */
	errors: ParseError[];
}

/**
 * A collected lexical or parse error.
 *
 * Lexical errors (from the lexer) carry the lexer's specific `code`, such as
 * `"UNTERMINATED_STRING"`, `"INVALID_UNICODE_ESCAPE"` or `"INVALID_BIGINT"`;
 * errors from the parser's grammar checks have the code `"PARSE_ERROR"`.
 */
export interface ParseError {
	/** Human-readable message, without position information. */
	message: string;
	/** Source location of the error. */
	loc: SourceLocation;
	/** Machine-readable error code for programmatic handling. */
	code: string;
	/** 1-based line of the error (`loc.start.line`). */
	line: number;
	/** 0-based column of the error (`loc.start.column`). */
	column: number;
	/** 0-based character offset of the error (`loc.start.offset`). */
	offset: number;
}
