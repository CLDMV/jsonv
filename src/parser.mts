/**
 * Parser for @cldmv/jsonv
 *
 * Converts token stream from lexer into an Abstract Syntax Tree (AST).
 * Implements recursive descent parsing for JSON5 + ES2015-2025 features.
 *
 * Phase 2-3 Implementation - TODO:
 * - Implement recursive descent parser
 * - Parse JSON5 base features: objects, arrays, literals, comments
 * - Parse ES2015 features: binary/octal literals, template strings
 * - Parse ES2020 features: BigInt literals
 * - Parse ES2021 features: numeric separators
 * - Parse internal references: identifiers and member expressions (Phase 3)
 * - Implement reference resolution with scope tracking (Phase 3)
 * - Validate defined-before-use, no-circular-refs rules (Phase 3)
 * - Provide detailed error messages with context
 * - Support tolerant mode (collect multiple errors)
 */

import type {
	Program,
	ParseResult,
	ParseError,
	Expression,
	Literal,
	ObjectExpression,
	ArrayExpression,
	Property,
	Identifier,
	TemplateLiteral,
	TemplateElement,
	MemberExpression,
	PropertyKeyNode,
	Comment,
	AstResult
} from "./ast-types.mjs";
import type { ParseOptions } from "./api-types.mjs";
import { Lexer } from "./lexer/lexer.mjs";
import type { Token } from "./lexer/lexer-types.mjs";
import { TokenType, getFeatureYear } from "./lexer/lexer-types.mjs";
import { JsonvSyntaxError, JsonvReferenceError } from "./errors.mjs";

// Re-exported so consumers importing from the "./parser" subpath (where both
// throw sites for this error live) can detect it without a separate import.
export { JsonvSyntaxError };

// Re-exported so consumers importing from the "./parser" subpath (where the
// throw sites for this error live, in the reference resolver) can detect it
// without a separate import.
export { JsonvReferenceError };

// Re-exported for tooling that walks the AST / token stream returned by
// Parser.parse() and parseToAst() (token `type` values are TokenType members).
export { TokenType };
export type { Token };
export type {
	ASTNode,
	SourceLocation,
	Position,
	Program,
	Expression,
	Literal,
	ObjectExpression,
	ArrayExpression,
	Property,
	PropertyKeyNode,
	Identifier,
	TemplateLiteral,
	TemplateElement,
	MemberExpression,
	Comment,
	ParseResult,
	AstResult,
	ParseError
} from "./ast-types.mjs";

/**
 * Helper to get token type name for error messages
 */
function getTokenTypeName(type: TokenType): string {
	// Find the enum key name for this value
	for (const key in TokenType) {
		if (TokenType[key as keyof typeof TokenType] === type) {
			return key;
		}
	}
	return "UNKNOWN";
}

/**
 * Marker for unresolved internal references
 * Placed by evaluation pass 1 wherever a reference appears; pass 2 replaces it
 */
interface UnresolvedReference {
	__UNRESOLVED__: true;
	path: string;
	node: Identifier | MemberExpression | TemplateLiteral;
}

/**
 * Check if a value is an unresolved reference marker
 */
function isUnresolved(value: any): value is UnresolvedReference {
	return value && typeof value === "object" && value.__UNRESOLVED__ === true;
}

/**
 * One entry of the reference-resolution stack: a marker being resolved and
 * the reference expression it is currently following (the marker's own node,
 * or, for a template, the interpolated expression being looked up). Used to
 * name a cycle and to point at the reference that closes it.
 */
interface ResolveFrame {
	marker: UnresolvedReference;
	via: Identifier | MemberExpression | TemplateLiteral;
}

/**
 * How many markers `Parser#resolveMarker` may resolve recursively, one inside
 * another, before deferring the rest to an explicit work stack (see
 * `Parser#resolveDeferred`). Keeps a long chain of templates from overflowing
 * the call stack; each level costs a handful of stack frames.
 */
const MAX_RESOLVE_DEPTH = 500;

/**
 * Thrown (not as an error) by `Parser#resolveMarker` when resolution nests past
 * {@link MAX_RESOLVE_DEPTH}: `marker` is resolved first, then the interrupted
 * resolution is retried.
 */
class DeferredResolution {
	constructor(readonly marker: UnresolvedReference) {}
}

/**
 * A marker waiting to be resolved by `Parser#resolveDeferred`, with the sizes
 * of the resolution stacks to restore before resolving it.
 */
interface ResolutionPoint {
	marker: UnresolvedReference;
	frames: number;
	values: number;
	follows: number;
}

/**
 * Deep-copy a fully resolved value (plain objects, arrays and primitives), so a
 * reference to an object or array yields its own copy rather than sharing the
 * referenced one.
 */
function cloneResolved(value: any): any {
	if (Array.isArray(value)) {
		return value.map(cloneResolved);
	}
	if (value !== null && typeof value === "object") {
		const copy: Record<string, any> = {};
		for (const key of Object.keys(value)) {
			copy[key] = cloneResolved(value[key]);
		}
		return copy;
	}
	return value;
}

/**
 * Parser class
 */
export class Parser {
	private lexer: Lexer;
	private options: Required<ParseOptions>;
	private tokens: Token[] = []; // Non-comment tokens, ending with EOF
	private comments: Comment[] = []; // Comments in source order (preserveComments only)
	private current: number = 0;
	private errors: ParseError[] = [];

	// Reference-resolution state, live only during `evaluate()` (see `resetResolution`)
	private refRoot: any = undefined; // Evaluated document that references are looked up in
	private refStack: ResolveFrame[] = []; // Markers being resolved, outermost first (for cycle messages)
	private followVisiting: Set<UnresolvedReference> = new Set(); // Markers whose target is being located
	private valueVisiting: Set<UnresolvedReference> = new Set(); // Markers whose full value is being built
	private targetMemo: Map<UnresolvedReference, any> = new Map(); // Marker -> located target (memoized)
	private valueMemo: Map<UnresolvedReference, any> = new Map(); // Marker -> final value (memoized)
	private valueStack: UnresolvedReference[] = []; // valueVisiting in insertion order
	private followStack: UnresolvedReference[] = []; // followVisiting in insertion order
	private refDepth: number = 0; // Nesting depth of resolveMarker calls on the JS call stack

	constructor(source: string, options: ParseOptions = {}) {
		const requestedYear = options.year ?? new Date().getFullYear();
		const targetYear = getFeatureYear(requestedYear) as 2011 | 2015 | 2020 | 2021;

		this.lexer = new Lexer(source, {
			// The lexer maps this to its feature year itself; it also needs the
			// requested year for rules that change between feature years (ES2019
			// allows U+2028/U+2029 in strings, but 2019 maps to feature year 2015).
			year: requestedYear,
			preserveComments: options.preserveComments ?? false,
			mode: options.mode ?? "jsonv",
			strictOctal: options.strictOctal ?? false
		});

		// Set default options
		this.options = {
			reviver: options.reviver ?? ((key, value) => value),
			mode: options.mode ?? "jsonv",
			year: targetYear,
			allowInternalReferences: options.allowInternalReferences ?? true,
			preserveComments: options.preserveComments ?? false,
			tolerant: options.tolerant ?? false,
			strictBigInt: options.strictBigInt ?? false,
			strictOctal: options.strictOctal ?? false
		};
	}

	/**
	 * Parse the input and return the AST.
	 *
	 * Returns the `Program` (whose `loc` spans the whole input), the positioned
	 * token stream (excluding comments and EOF), the comments in source order
	 * when `preserveComments` is set, and any collected parse errors.
	 * Lexical errors are thrown as a `LexerError` (a {@link JsonvSyntaxError}).
	 */
	parse(): ParseResult {
		// Tokenize the input, separating comments from the tokens the grammar
		// consumes so comments may appear between any two tokens.
		this.tokens = [];
		this.comments = [];
		for (const token of this.lexer.tokenize()) {
			if (token.type === TokenType.LINE_COMMENT || token.type === TokenType.BLOCK_COMMENT) {
				this.comments.push({
					type: token.type === TokenType.LINE_COMMENT ? "Line" : "Block",
					value: token.value as string,
					loc: token.loc
				});
			} else {
				this.tokens.push(token);
			}
		}
		this.current = 0;

		// Parse the root value
		const body = this.parseValue();

		// Expect EOF
		if (!this.isAtEnd()) {
			this.addError("Unexpected token after root value", this.peek());
		}

		// The EOF token sits at the very end of the input
		const eof = this.tokens[this.tokens.length - 1];
		const program: Program = {
			type: "Program",
			body,
			loc: {
				start: { line: 1, column: 0, offset: 0 },
				end: eof.loc.end
			}
		};

		const result: ParseResult = {
			program,
			tokens: this.tokens.slice(0, -1),
			errors: this.errors.length > 0 ? this.errors : undefined
		};

		if (this.options.preserveComments) {
			result.comments = this.comments;
		}

		return result;
	}

	/**
	 * Parse a value (dispatcher for all value types)
	 */
	private parseValue(): Expression {
		const token = this.peek();

		switch (token.type) {
			case TokenType.STRING:
			case TokenType.NUMBER:
			case TokenType.BIGINT:
			case TokenType.TRUE:
			case TokenType.FALSE:
			case TokenType.NULL:
			case TokenType.INFINITY:
			case TokenType.NAN:
				return this.parseLiteral();

			case TokenType.LBRACE:
				return this.parseObject();

			case TokenType.LBRACKET:
				return this.parseArray();

			case TokenType.IDENTIFIER:
				return this.parseIdentifier();

			case TokenType.TEMPLATE_LITERAL:
			case TokenType.TEMPLATE_HEAD:
				return this.parseTemplateLiteral();

			default:
				this.addError(`Unexpected token: ${getTokenTypeName(token.type)}`, token);
				this.advance();
				// Return null literal as fallback
				return {
					type: "Literal",
					value: null,
					raw: "null",
					loc: token.loc
				};
		}
	}

	/**
	 * Parse a literal value
	 */
	private parseLiteral(): Literal {
		const token = this.advance();

		let value: string | number | bigint | boolean | null;

		switch (token.type) {
			case TokenType.STRING:
				value = token.value as string;
				break;
			case TokenType.NUMBER:
				value = token.value as number;
				// Check INTEGER LITERALS (not scientific notation or decimals) outside safe integer range
				const hasDecimalPoint = token.raw.includes(".");
				const hasExponent = /[eE]/.test(token.raw);
				const isDecimalLiteral = hasDecimalPoint || hasExponent;

				if (
					!isNaN(value) &&
					isFinite(value) &&
					!isDecimalLiteral &&
					Number.isInteger(value) &&
					(value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER)
				) {
					if (this.options.strictBigInt) {
						// Strict mode: require explicit 'n' suffix
						this.addError(
							`Integer ${value} is outside safe integer range. Use BigInt suffix 'n' for integers larger than ${Number.MAX_SAFE_INTEGER} or smaller than ${Number.MIN_SAFE_INTEGER}`,
							token
						);
					} else {
						// Non-strict mode: auto-convert to BigInt
						value = BigInt(token.raw.replace(/[_+]/g, "")); // Remove separators and sign for BigInt constructor
					}
				}
				break;
			case TokenType.BIGINT:
				value = token.value as bigint;
				break;
			case TokenType.TRUE:
				value = true;
				break;
			case TokenType.FALSE:
				value = false;
				break;
			case TokenType.NULL:
				value = null;
				break;
			case TokenType.INFINITY:
				value = token.raw.startsWith("-") ? -Infinity : Infinity;
				break;
			case TokenType.NAN:
				value = NaN;
				break;
			default:
				this.addError(`Expected literal, got ${getTokenTypeName(token.type)}`, token);
				value = null;
		}

		const literal: Literal = {
			type: "Literal",
			value,
			raw: token.raw,
			loc: token.loc
		};

		// Add bigint field for BigInt literals
		if (token.type === TokenType.BIGINT) {
			literal.bigint = String(value);
		}

		return literal;
	}

	/**
	 * Parse an object expression
	 */
	private parseObject(): ObjectExpression {
		const start = this.expect(TokenType.LBRACE);
		const properties: Property[] = [];

		while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
			properties.push(this.parseProperty());

			// Handle trailing comma
			if (this.check(TokenType.COMMA)) {
				this.advance();
				// Allow trailing comma before }
				if (this.check(TokenType.RBRACE)) {
					break;
				}
			} else if (!this.check(TokenType.RBRACE)) {
				this.addError("Expected ',' or '}' in object", this.peek());
				break;
			}
		}

		const end = this.expect(TokenType.RBRACE);

		return {
			type: "ObjectExpression",
			properties,
			loc:
				start.loc && end.loc
					? {
							start: start.loc.start,
							end: end.loc.end
						}
					: undefined
		};
	}

	/**
	 * Parse an object property
	 */
	private parseProperty(): Property {
		const keyToken = this.peek();
		let key: PropertyKeyNode;
		let computed = false;

		if (keyToken.type === TokenType.STRING || keyToken.type === TokenType.NUMBER || keyToken.type === TokenType.BIGINT) {
			// Quoted key, or numeric key (JSON5 allows numbers as keys, including BigInt)
			key = this.parseLiteral();
		} else if (
			keyToken.type === TokenType.IDENTIFIER ||
			keyToken.type === TokenType.TRUE ||
			keyToken.type === TokenType.FALSE ||
			keyToken.type === TokenType.NULL ||
			keyToken.type === TokenType.INFINITY ||
			keyToken.type === TokenType.NAN
		) {
			// Unquoted key, including keywords (JSON5 allows reserved words as unquoted keys)
			this.advance();
			key = {
				type: "Identifier",
				name: keyToken.raw,
				loc: keyToken.loc
			};
		} else {
			this.addError(`Expected property key, got ${getTokenTypeName(keyToken.type)}`, keyToken);
			this.advance();
			key = {
				type: "Literal",
				value: "error",
				raw: keyToken.raw,
				loc: keyToken.loc
			};
		}

		this.expect(TokenType.COLON);
		const value = this.parseValue();

		return {
			type: "Property",
			key,
			value,
			computed,
			loc: {
				start: keyToken.loc.start,
				end: value.loc!.end
			}
		};
	}

	/**
	 * Parse an array expression
	 */
	private parseArray(): ArrayExpression {
		const start = this.expect(TokenType.LBRACKET);
		const elements: (Expression | null)[] = [];

		while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
			elements.push(this.parseValue());

			// Handle trailing comma
			if (this.check(TokenType.COMMA)) {
				this.advance();
				// Allow trailing comma before ]
				if (this.check(TokenType.RBRACKET)) {
					break;
				}
			} else if (!this.check(TokenType.RBRACKET)) {
				this.addError("Expected ',' or ']' in array", this.peek());
				break;
			}
		}

		const end = this.expect(TokenType.RBRACKET);

		return {
			type: "ArrayExpression",
			elements,
			loc:
				start.loc && end.loc
					? {
							start: start.loc.start,
							end: end.loc.end
						}
					: undefined
		};
	}

	/**
	 * Parse an identifier (for internal references)
	 * Supports member expressions: server.port, config.db.host
	 */
	private parseIdentifier(): Identifier | MemberExpression {
		const start = this.expect(TokenType.IDENTIFIER);

		let result: Identifier | MemberExpression = {
			type: "Identifier",
			name: start.value as string,
			loc: start.loc
		};

		// Check for member access (dot notation)
		while (this.check(TokenType.DOT)) {
			this.advance(); // consume dot
			const propertyToken = this.expect(TokenType.IDENTIFIER);

			result = {
				type: "MemberExpression",
				object: result,
				property: {
					type: "Identifier",
					name: propertyToken.value as string,
					loc: propertyToken.loc
				},
				computed: false,
				loc: {
					start: start.loc!.start,
					end: propertyToken.loc!.end
				}
			};
		}

		return result;
	}

	/**
	 * Parse a template literal with optional interpolation
	 * Examples: `plain string`, `http://${host}:${port}`
	 *
	 * Each quasi takes its token's `raw` and `loc` unchanged, delimiters included:
	 * for `` `http://${host}/path` `` the quasis are `` `http://${ `` and `` }/path` ``.
	 */
	private parseTemplateLiteral(): TemplateLiteral | Literal {
		const token = this.advance();

		if (token.type === TokenType.TEMPLATE_LITERAL) {
			// Plain template string (no interpolation)
			return {
				type: "Literal",
				value: token.value as string,
				raw: token.raw,
				loc: token.loc
			};
		}

		// Template with interpolation (TEMPLATE_HEAD)
		if (token.type !== TokenType.TEMPLATE_HEAD) {
			this.addError("Expected template literal or template head", token);
			return {
				type: "Literal",
				value: "",
				raw: token.raw,
				loc: token.loc
			};
		}

		const quasis: TemplateElement[] = [];
		const expressions: Expression[] = [];

		// Add first quasi (before first expression)
		quasis.push({
			type: "TemplateElement",
			value: {
				raw: token.raw,
				cooked: token.value as string
			},
			tail: false,
			loc: token.loc
		});

		// Parse expressions and middle/tail quasis
		while (true) {
			// Parse the expression inside ${...}
			const errorCount = this.errors.length;
			const expr = this.parseValue();
			if (expr.type === "ObjectExpression" || expr.type === "ArrayExpression") {
				this.rejectInterpolatedLiteral(expr, errorCount);
			}
			expressions.push(expr);

			// Expect TEMPLATE_MIDDLE or TEMPLATE_TAIL
			const quasi = this.peek();
			if (quasi.type === TokenType.TEMPLATE_MIDDLE) {
				this.advance();
				quasis.push({
					type: "TemplateElement",
					value: {
						raw: quasi.raw,
						cooked: quasi.value as string
					},
					tail: false,
					loc: quasi.loc
				});
			} else if (quasi.type === TokenType.TEMPLATE_TAIL) {
				this.advance();
				quasis.push({
					type: "TemplateElement",
					value: {
						raw: quasi.raw,
						cooked: quasi.value as string
					},
					tail: true,
					loc: quasi.loc
				});
				break;
			} else {
				this.addError("Expected template middle or template tail", quasi);
				break;
			}
		}

		return {
			type: "TemplateLiteral",
			quasis,
			expressions,
			// Head through the last consumed token (the tail, when well-formed)
			loc: {
				start: token.loc.start,
				end: this.previous().loc.end
			}
		};
	}

	/**
	 * Report an object or array literal used as a template interpolation.
	 *
	 * Interpolation only stringifies internal references, nested templates and
	 * scalar literals; an inline object or array has no defined string form in
	 * jsonv, so it is a parse error positioned on the whole literal (issue #50).
	 * The literal is still parsed first so the token stream stays in step, which
	 * may already have recorded errors from inside it: the rejection is inserted
	 * ahead of those so errors stay in source order, and in fail-fast mode it
	 * replaces them, since it is the first problem in the source.
	 *
	 * @param expr - The object or array literal inside `${...}`
	 * @param errorCount - Number of errors recorded before the literal was parsed
	 */
	private rejectInterpolatedLiteral(expr: ObjectExpression | ArrayExpression, errorCount: number): void {
		if (!this.options.tolerant && errorCount > 0) {
			return; // An earlier error already stops a fail-fast parse
		}

		const kind = expr.type === "ObjectExpression" ? "Object" : "Array";
		const error: ParseError = {
			message: `${kind} literals are not supported in template interpolation`,
			loc: expr.loc!,
			code: "UNSUPPORTED_INTERPOLATION"
		};
		this.errors.splice(errorCount, this.options.tolerant ? 0 : this.errors.length, error);
	}

	// ===== Token Management =====

	/**
	 * Check if current token matches type without consuming
	 */
	private check(type: TokenType): boolean {
		if (this.isAtEnd()) return false;
		return this.peek().type === type;
	}

	/**
	 * Consume and return current token
	 */
	private advance(): Token {
		if (!this.isAtEnd()) this.current++;
		return this.previous();
	}

	/**
	 * Return current token without consuming
	 */
	private peek(): Token {
		return this.tokens[this.current];
	}

	/**
	 * Return previous token
	 */
	private previous(): Token {
		return this.tokens[this.current - 1];
	}

	/**
	 * Check if at end of token stream
	 */
	private isAtEnd(): boolean {
		return this.peek().type === TokenType.EOF;
	}

	/**
	 * Expect a specific token type and consume it
	 */
	private expect(type: TokenType): Token {
		if (this.check(type)) {
			return this.advance();
		}

		const token = this.peek();
		this.addError(`Expected ${getTokenTypeName(type)}, got ${getTokenTypeName(token.type)}`, token);
		return token;
	}

	/**
	 * Add a parse error
	 */
	private addError(message: string, token: Token): void {
		if (!this.options.tolerant && this.errors.length > 0) {
			return; // Already have an error in fail-fast mode
		}

		const error: ParseError = {
			message,
			loc: token.loc!,
			code: "PARSE_ERROR"
		};

		this.errors.push(error);
	}

	/**
	 * Convert AST to JavaScript value, resolving internal references in dependency order
	 *
	 * Pass 1: Build the object structure, marking every reference as __UNRESOLVED__
	 * Pass 2: Walk the structure and replace each marker with its value. A marker is
	 * resolved on demand, depth-first: whatever it depends on (the key it names, the
	 * keys on a member-expression path, the targets of a template's interpolations)
	 * is resolved first, so any acyclic reference graph resolves regardless of its
	 * depth or key order. Each reference is resolved once. A reference that depends
	 * on itself throws a `JsonvReferenceError` naming the cycle; one whose target
	 * does not exist throws "Unresolved reference".
	 */
	evaluate(program: Program): any {
		// Pass 1: Build structure with unresolved markers
		let result = this.evaluateNodePass1(program.body);

		if (!this.options.allowInternalReferences) {
			// No references allowed, apply reviver and return
			return this.applyReviver("", result, { "": result });
		}

		// Pass 2: Resolve references in dependency order
		this.resetResolution(result);
		try {
			result = this.resolveInPlace(result);
		} finally {
			this.resetResolution(undefined);
		}

		// Apply reviver function if provided (JSON.parse compatibility)
		return this.applyReviver("", result, { "": result });
	}

	/**
	 * Apply reviver function recursively (JSON.parse compatible)
	 * Walks the object tree bottom-up, calling reviver for each property
	 */
	private applyReviver(key: string, value: any, holder: any): any {
		if (!this.options.reviver) {
			return value;
		}

		// Recursively process arrays and objects first (bottom-up)
		if (value !== null && typeof value === "object") {
			if (Array.isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					const element = value[i];
					const newElement = this.applyReviver(String(i), element, value);
					if (newElement === undefined) {
						delete value[i];
					} else {
						value[i] = newElement;
					}
				}
			} else {
				for (const prop in value) {
					if (Object.prototype.hasOwnProperty.call(value, prop)) {
						const newValue = this.applyReviver(prop, value[prop], value);
						if (newValue === undefined) {
							delete value[prop];
						} else {
							value[prop] = newValue;
						}
					}
				}
			}
		}

		// Call reviver on current value
		return this.options.reviver.call(holder, key, value);
	}

	/**
	 * Pass 1: Evaluate AST node, marking references as unresolved
	 */
	private evaluateNodePass1(node: Expression): any {
		switch (node.type) {
			case "Literal":
				return (node as Literal).value;

			case "ObjectExpression": {
				const obj: Record<string, any> = {};
				for (const prop of (node as ObjectExpression).properties) {
					const key = prop.key.type === "Identifier" ? prop.key.name : String(prop.key.value);
					obj[key] = this.evaluateNodePass1(prop.value);
				}
				return obj;
			}

			case "ArrayExpression":
				return (node as ArrayExpression).elements.map((el) => (el ? this.evaluateNodePass1(el) : null));

			case "Identifier":
			case "MemberExpression":
			case "TemplateLiteral":
				// Mark as unresolved
				return this.createUnresolvedMarker(node);

			default:
				throw new Error(`Unknown node type: ${(node as Expression).type}`);
		}
	}

	/**
	 * Create an unresolved reference marker
	 */
	private createUnresolvedMarker(node: Identifier | MemberExpression | TemplateLiteral): UnresolvedReference {
		return {
			__UNRESOLVED__: true,
			path: this.buildReferencePath(node),
			node
		};
	}

	/**
	 * Build path string for reference (for error messages)
	 */
	private buildReferencePath(node: Identifier | MemberExpression | TemplateLiteral): string {
		if (node.type === "Identifier") {
			return node.name;
		}
		if (node.type === "MemberExpression") {
			return this.buildMemberPath(node);
		}
		return "<template>";
	}

	/**
	 * Build path string for member expression
	 */
	private buildMemberPath(node: MemberExpression): string {
		return this.referenceSegments(node).join(".");
	}

	/**
	 * Split a reference into the keys it walks from the document root:
	 * `database.primary.port` → `["database", "primary", "port"]`
	 */
	private referenceSegments(node: Identifier | MemberExpression): string[] {
		const parts: string[] = [];
		let current: Expression = node;

		while (current.type === "MemberExpression") {
			const memberExpr = current as MemberExpression;
			parts.unshift(memberExpr.property.name);
			current = memberExpr.object;
		}

		if (current.type === "Identifier") {
			parts.unshift((current as Identifier).name);
		}

		return parts;
	}

	/**
	 * Reset the reference-resolution state and set the document that references
	 * are looked up in (`undefined` releases it once evaluation finishes).
	 */
	private resetResolution(root: any): void {
		this.refRoot = root;
		this.refStack = [];
		this.refDepth = 0;
		this.valueStack = [];
		this.followStack = [];
		this.followVisiting.clear();
		this.valueVisiting.clear();
		this.targetMemo.clear();
		this.valueMemo.clear();
	}

	/**
	 * Replace every unresolved marker inside `value` with its resolved value, in
	 * place, and return the resolved value (a marker passed in directly is
	 * resolved and returned, since it has no container to be replaced in).
	 */
	private resolveInPlace(value: any): any {
		if (isUnresolved(value)) {
			// Outside any other resolution, drive it with an explicit work stack
			return this.refDepth === 0 ? this.resolveDeferred(value) : this.resolveMarker(value);
		}

		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				const item = value[i];
				if (item !== null && typeof item === "object") {
					value[i] = this.resolveInPlace(item);
				}
			}
		} else if (value !== null && typeof value === "object") {
			for (const key of Object.keys(value)) {
				const item = value[key];
				if (item !== null && typeof item === "object") {
					value[key] = this.resolveInPlace(item);
				}
			}
		}

		return value;
	}

	/**
	 * Resolve a marker without letting a long dependency chain overflow the call
	 * stack. `resolveMarker` recurses once per marker whose value it needs (a
	 * template interpolating a template interpolating a template ...); past
	 * `MAX_RESOLVE_DEPTH` nested markers it throws a {@link DeferredResolution}
	 * instead, unwinding the call stack but leaving the resolution state (the
	 * frames and visiting sets) exactly as it was at that call. The deferred
	 * marker is then resolved in that state, from an empty call stack, so cycle
	 * detection sees the same ancestors plain recursion would. Afterwards the
	 * interrupted marker is retried from its own starting state; resolved values
	 * are memoized, so the retry gets past the point it stopped at.
	 */
	private resolveDeferred(marker: UnresolvedReference): any {
		const pending: ResolutionPoint[] = [this.resolutionPoint(marker)];

		for (;;) {
			const current = pending[pending.length - 1];
			this.unwindResolution(current);
			this.refDepth = 0;
			try {
				const value = this.resolveMarker(current.marker);
				pending.pop();
				if (pending.length === 0) {
					return value;
				}
			} catch (err) {
				if (!(err instanceof DeferredResolution)) {
					throw err;
				}
				pending.push(this.resolutionPoint(err.marker));
			}
		}
	}

	/**
	 * Record the current resolution state, as the point to resolve `marker` from
	 */
	private resolutionPoint(marker: UnresolvedReference): ResolutionPoint {
		return { marker, frames: this.refStack.length, values: this.valueStack.length, follows: this.followStack.length };
	}

	/**
	 * Drop everything pushed onto the resolution state since `point` was recorded
	 */
	private unwindResolution(point: ResolutionPoint): void {
		this.refStack.length = point.frames;
		while (this.valueStack.length > point.values) {
			this.valueVisiting.delete(this.valueStack.pop()!);
		}
		while (this.followStack.length > point.follows) {
			this.followVisiting.delete(this.followStack.pop()!);
		}
	}

	/**
	 * Resolve a marker to its final value: the value it refers to with every
	 * marker inside that value resolved too. An object or array is copied, so the
	 * result never shares structure with the key it was copied from.
	 *
	 * Meeting a marker whose value is already being built means the value would
	 * have to contain itself (`a: { x: a }`), which is a cycle.
	 *
	 * The resolution state is restored on return; a throw leaves it as it was at
	 * the throw (see `resolveDeferred`).
	 */
	private resolveMarker(marker: UnresolvedReference): any {
		if (this.valueMemo.has(marker)) {
			return cloneResolved(this.valueMemo.get(marker));
		}
		if (this.valueVisiting.has(marker)) {
			throw this.circularReferenceError(marker);
		}
		if (this.refDepth >= MAX_RESOLVE_DEPTH) {
			throw new DeferredResolution(marker);
		}

		this.refDepth++;
		this.valueVisiting.add(marker);
		this.valueStack.push(marker);
		const frames = this.refStack.length;

		let value = this.followReference(marker);
		if (value !== null && typeof value === "object") {
			value = cloneResolved(this.resolveInPlace(value));
		}

		this.refStack.length = frames;
		this.valueStack.pop();
		this.valueVisiting.delete(marker);
		this.refDepth--;

		this.valueMemo.set(marker, value);
		return value;
	}

	/**
	 * Find the value a marker refers to, without resolving the markers inside it:
	 * the evaluated string of a template, or the value stored at the key path an
	 * identifier / member expression names. When that value is itself a marker
	 * (`a: b, b: c, ...`), it is followed in turn; the chain is walked in a loop
	 * rather than by recursion, so its length does not deepen the call stack.
	 * Results are memoized, so each marker is followed once.
	 *
	 * Pushes one frame per marker followed onto `refStack` and leaves them there;
	 * the caller restores the stack. Meeting a marker that is already being
	 * followed is a cycle (`a: b, b: a`); a reference to a key that does not
	 * exist is unresolved.
	 */
	private followReference(start: UnresolvedReference): any {
		if (this.targetMemo.has(start)) {
			this.refStack.push({ marker: start, via: start.node });
			return this.targetMemo.get(start);
		}

		const follows = this.followStack.length;
		let marker = start;
		let target: any;

		for (;;) {
			if (this.followVisiting.has(marker)) {
				throw this.circularReferenceError(marker);
			}
			this.followVisiting.add(marker);
			this.followStack.push(marker);
			this.refStack.push({ marker, via: marker.node });

			const node = marker.node;
			target = node.type === "TemplateLiteral" ? this.resolveTemplate(node, this.refRoot) : this.lookupReference(node, this.refRoot);

			if (target === undefined) {
				throw this.unresolvedReferenceError(marker);
			}
			if (!isUnresolved(target)) {
				break;
			}
			if (this.targetMemo.has(target)) {
				// Already followed: reuse its target, keeping a frame for the hop
				this.refStack.push({ marker: target, via: target.node });
				target = this.targetMemo.get(target);
				break;
			}
			marker = target;
		}

		// Everything followed above this call's start is this chain (nested follows have returned)
		while (this.followStack.length > follows) {
			const followed = this.followStack.pop()!;
			this.followVisiting.delete(followed);
			this.targetMemo.set(followed, target);
		}

		return target;
	}

	/**
	 * Look up the value stored at the key path a reference names, starting from
	 * the document root. A marker met partway along the path (`a: b.x` where
	 * `b: c`) is followed to the container it refers to so the walk can continue;
	 * the value at the end of the path is returned as is, marker or not.
	 * Returns `undefined` when a key along the path does not exist.
	 */
	private lookupReference(node: Identifier | MemberExpression, rootObj: any): any {
		// A reference that is itself the whole document has no keys to resolve against
		if (isUnresolved(rootObj)) {
			return undefined;
		}

		let value: any = rootObj;
		for (const prop of this.referenceSegments(node)) {
			if (isUnresolved(value)) {
				const frames = this.refStack.length;
				value = this.followReference(value);
				this.refStack.length = frames;
			}
			if (value === null || typeof value !== "object" || !(prop in value)) {
				return undefined;
			}
			value = value[prop];
		}

		return value;
	}

	/**
	 * Resolve a template literal with interpolation
	 */
	private resolveTemplate(node: TemplateLiteral, rootObj: any): any {
		let result = "";

		for (let i = 0; i < node.quasis.length; i++) {
			result += node.quasis[i].value.cooked;

			if (i < node.expressions.length) {
				const value = this.resolveInterpolation(node.expressions[i], rootObj);

				// An interpolation that does not resolve leaves the template unresolved
				if (value === undefined) {
					return undefined;
				}

				result += String(value);
			}
		}

		return result;
	}

	/**
	 * Resolve one expression interpolated into a template literal.
	 *
	 * A nested template is resolved recursively, so `a${ `b${x}c` }d` evaluates like
	 * any other interpolation (issue #49). A nested template without interpolation of
	 * its own is parsed as a string `Literal`, which is why literals resolve to their
	 * value here. A reference resolves to the final value of its target, resolving
	 * that target first when it has not been resolved yet. Returns `undefined` when
	 * the expression cannot be resolved (a reference whose target is missing, or an
	 * inline object or array), which leaves the enclosing template unresolved.
	 */
	private resolveInterpolation(expr: Expression, rootObj: any): any {
		switch (expr.type) {
			case "Identifier":
			case "MemberExpression":
				return this.resolveInterpolatedReference(expr, rootObj);
			case "TemplateLiteral":
				return this.resolveTemplate(expr, rootObj);
			case "Literal":
				return expr.value;
			default:
				return undefined;
		}
	}

	/**
	 * Resolve a reference interpolated into the template on top of `refStack`
	 * to its final value.
	 */
	private resolveInterpolatedReference(expr: Identifier | MemberExpression, rootObj: any): any {
		// Record the reference being followed, so a cycle is reported at it
		this.refStack[this.refStack.length - 1].via = expr;

		const value = this.lookupReference(expr, rootObj);
		if (isUnresolved(value)) {
			return this.resolveMarker(value);
		}
		if (value !== null && typeof value === "object") {
			this.resolveInPlace(value);
		}

		return value;
	}

	/**
	 * Build the error for a reference whose target does not exist
	 */
	private unresolvedReferenceError(marker: UnresolvedReference): JsonvReferenceError {
		return new JsonvReferenceError(
			`Unresolved reference: ${marker.path} (circular reference or undefined)`,
			marker.node.loc!,
			"UNRESOLVED_REFERENCE"
		);
	}

	/**
	 * Build the error for a reference cycle that closes on `marker`.
	 *
	 * The message names the keys on the cycle, from the key holding `marker` to
	 * the reference that leads back to it (`a -> b -> a` for `{ a: b, b: a }`),
	 * and the position is that closing reference's.
	 */
	private circularReferenceError(marker: UnresolvedReference): JsonvReferenceError {
		const top = this.refStack.length - 1;
		let start = top;
		while (start > 0 && this.refStack[start].marker !== marker) {
			start--;
		}

		const closing = this.refStack[top].via;
		// Every marker on the stack is still in the document: a marker is replaced
		// only after resolving it succeeds, and resolving one whose frame is on the
		// stack runs into that same marker again (a cycle) before it can succeed
		const locations = this.markerLocations();
		const cycle = this.refStack.slice(start).map((frame) => locations.get(frame.marker)!);
		cycle.push(this.buildReferencePath(closing));

		return new JsonvReferenceError(`Circular reference: ${cycle.join(" -> ")}`, closing.loc!, "UNRESOLVED_REFERENCE");
	}

	/**
	 * Map every marker still in the document to its key path (`a.b[2].c`)
	 */
	private markerLocations(): Map<UnresolvedReference, string> {
		const locations = new Map<UnresolvedReference, string>();
		const walk = (value: any, path: string): void => {
			if (isUnresolved(value)) {
				locations.set(value, path);
			} else if (value !== null && typeof value === "object") {
				const isArray = Array.isArray(value);
				for (const key of Object.keys(value)) {
					walk(value[key], isArray ? `${path}[${key}]` : path ? `${path}.${key}` : key);
				}
			}
		};
		walk(this.refRoot, "");
		return locations;
	}
}

/**

 * Public parse function
 * Compatible with JSON.parse(text, reviver) signature
 * Automatically enables strictBigInt when caller is in strict mode
 */
export function parse(text: string, reviver?: (this: any, key: string, value: any) => any): any {
	const options: ParseOptions = {
		reviver
	};

	const parser = new Parser(text, options);
	const result = parser.parse();

	if (result.errors && result.errors.length > 0 && !options?.tolerant) {
		const firstError = result.errors[0];
		const message = `${firstError.message} at line ${firstError.loc.start.line}, column ${firstError.loc.start.column}`;
		throw new JsonvSyntaxError(message, firstError.loc, firstError.code);
	}

	return parser.evaluate(result.program);
}

/**
 * Parse jsonv text to a positioned AST for tooling (linters, formatters,
 * editors) without evaluating it.
 *
 * Unlike {@link Parser.parse}, every list is always present: `comments` is
 * collected by default (pass `preserveComments: false` to skip it, which
 * yields an empty array) and `errors` is an empty array when the input parsed
 * cleanly. Parse errors are collected rather than thrown (the first one only,
 * unless `tolerant: true`); lexical errors throw a {@link JsonvSyntaxError}.
 * Internal references are left as `Identifier` / `MemberExpression` nodes and
 * are not resolved.
 *
 * @param text - The jsonv text to parse
 * @param options - Parse options (`year`, `mode`, `tolerant`, `preserveComments`, ...)
 * @returns `{ program, comments, tokens, errors }`
 *
 * @example
 * ```js
 * import { parseToAst } from "@cldmv/jsonv";
 *
 * const { program, comments, tokens, errors } = parseToAst("// port\n{ port: 8080 }");
 * program.body.properties[0].key; // { type: "Identifier", name: "port", loc: { ... } }
 * comments[0]; // { type: "Line", value: " port", loc: { start: { line: 1, column: 0, offset: 0 }, ... } }
 * ```
 */
export function parseToAst(text: string, options: ParseOptions = {}): AstResult {
	const result = new Parser(text, { ...options, preserveComments: options.preserveComments ?? true }).parse();

	return {
		program: result.program,
		comments: result.comments ?? [],
		tokens: result.tokens,
		errors: result.errors ?? []
	};
}

/**
 * Parse with explicit options
 */
export function parseWithOptions(text: string, options?: ParseOptions): any {
	const parser = new Parser(text, options);
	const result = parser.parse();

	if (result.errors && result.errors.length > 0 && !options?.tolerant) {
		const firstError = result.errors[0];
		const message = `${firstError.message} at line ${firstError.loc.start.line}, column ${firstError.loc.start.column}`;
		throw new JsonvSyntaxError(message, firstError.loc, firstError.code);
	}

	return parser.evaluate(result.program);
}
