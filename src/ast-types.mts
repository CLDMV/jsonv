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
 * Template literal string segment
 */
export interface TemplateElement extends ASTNode {
	type: "TemplateElement";
	value: {
		raw: string;
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
 */
export interface AstResult {
	program: Program;
	/** Comments in source order (empty when `preserveComments: false` was passed). */
	comments: Comment[];
	/** Positioned tokens in source order, excluding comments and EOF. */
	tokens: Token[];
	/** Collected parse errors (empty when the input parsed cleanly). */
	errors: ParseError[];
}

/**
 * Parse error information
 */
export interface ParseError {
	message: string;
	loc: SourceLocation;
	code: string; // Error code for programmatic handling
}
