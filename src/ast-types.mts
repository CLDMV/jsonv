/**
 * AST Node Types for @cldmv/jsonv parser
 *
 * Represents the Abstract Syntax Tree for JSON/JSON5/jsonv files
 * supporting all features from ES2011 (JSON5) through ES2025.
 */

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
 * Root node containing the entire document
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
 * Object property
 */
export interface Property extends ASTNode {
	type: "Property";
	key: Expression | string; // string for unquoted keys
	value: Expression;
	computed: boolean; // false for unquoted/quoted keys, true for computed
}

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
 * Template literal (backtick strings with optional interpolation)
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
 * Comment node (preserved when comment preservation is enabled)
 */
export interface Comment {
	type: "Line" | "Block";
	value: string;
	loc: SourceLocation;
}

/**
 * Parse result with optional comments
 */
export interface ParseResult {
	program: Program;
	comments?: Comment[];
	errors?: ParseError[];
}

/**
 * Parse error information
 */
export interface ParseError {
	message: string;
	loc: SourceLocation;
	code: string; // Error code for programmatic handling
}
