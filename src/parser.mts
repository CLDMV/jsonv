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
import { JsonvSyntaxError, JsonvReferenceError, JsonvAggregateSyntaxError } from "./errors.mjs";

// Re-exported so consumers importing from the "./parser" subpath (where both
// throw sites for this error live) can detect it without a separate import.
export { JsonvSyntaxError };

// Re-exported so consumers importing from the "./parser" subpath (where
// tolerant parses throw it) can detect it without a separate import.
export { JsonvAggregateSyntaxError };

// Re-exported so consumers importing from the "./parser" subpath (where the
// throw site for this error lives, in `checkUnresolved`) can detect it
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
 * Used in multi-pass evaluation to mark references that need resolution
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
 * Parser class
 */
export class Parser {
	private lexer: Lexer;
	private options: Required<ParseOptions>;
	private tokens: Token[] = []; // Non-comment tokens, ending with EOF
	private comments: Comment[] = []; // Comments in source order (preserveComments only)
	private current: number = 0;
	private errors: ParseError[] = [];
	private evaluationStack: Set<string> = new Set(); // Track references being evaluated (circular detection)

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
	 * when `preserveComments` is set, and any collected parse errors (only the
	 * first unless `tolerant` is set, in which case the parser resynchronizes at
	 * the next property / element boundary and keeps collecting).
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
				// Report the token but leave it in place: it is punctuation that no
				// value can start with (a `,`, `:`, `}`, `]`, `.`, a template middle or
				// tail, or EOF), and the enclosing object, array, template or root
				// uses it to resynchronize (see `synchronize`). Consuming it here would
				// swallow the boundary the caller needs, e.g. the `}` in `{ c: }`.
				this.addError(`Unexpected token: ${getTokenTypeName(token.type)}`, token);
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
			const property = this.parseProperty();
			if (property) {
				properties.push(property);
			}

			// Handle trailing comma
			if (this.check(TokenType.COMMA)) {
				this.advance();
				// Allow trailing comma before }
				if (this.check(TokenType.RBRACE)) {
					break;
				}
			} else if (!this.check(TokenType.RBRACE)) {
				this.addError("Expected ',' or '}' in object", this.peek());
				// Tolerant recovery: skip to the next property boundary and carry on
				// with the property after it, instead of abandoning the object.
				this.synchronize();
				if (!this.check(TokenType.COMMA)) {
					break;
				}
				this.advance();
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
	 * Parse an object property.
	 *
	 * Returns `null` when the property is malformed beyond a single bad key
	 * token: the error is recorded and the tokens up to the next property
	 * boundary are skipped, so nothing after the error is misread as a value
	 * (in `{ a: 1,, b: 2 }` the `b` is a key, not an internal reference).
	 */
	private parseProperty(): Property | null {
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
			if (this.peekNext().type !== TokenType.COLON) {
				// Not a lone bad key token followed by its `:` (an extra `,`, a
				// bracketed key, ...): drop the property and resume at the next
				// property boundary. A `,` is itself that boundary.
				this.synchronize();
				return null;
			}
			// A single bad token in key position (`{ [: 1 }`): keep a positioned
			// placeholder key and parse the value after the `:`.
			this.advance();
			key = {
				type: "Literal",
				value: "error",
				raw: keyToken.raw,
				loc: keyToken.loc
			};
		}

		if (!this.check(TokenType.COLON)) {
			// Missing `:` -- whatever follows the key is not reliably a value (in
			// `{ a b: 1 }` it is the next key), so drop the property and resume at
			// the next property boundary rather than parse it as a reference.
			this.expect(TokenType.COLON);
			this.synchronize();
			return null;
		}
		this.advance();
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
				// Tolerant recovery: skip to the next element boundary and carry on
				// with the element after it, instead of abandoning the array.
				this.synchronize();
				if (!this.check(TokenType.COMMA)) {
					break;
				}
				this.advance();
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
			if (!this.check(TokenType.TEMPLATE_MIDDLE) && !this.check(TokenType.TEMPLATE_TAIL)) {
				this.addError("Expected template middle or template tail", this.peek());
				// Tolerant recovery: skip the rest of this interpolation up to the
				// template's next middle or tail and continue from there, so the
				// leftover tokens are not misread by the enclosing value.
				this.synchronize(false);
				if (!this.check(TokenType.TEMPLATE_MIDDLE) && !this.check(TokenType.TEMPLATE_TAIL)) {
					break;
				}
			}

			const quasi = this.advance();
			const tail = quasi.type === TokenType.TEMPLATE_TAIL;
			quasis.push({
				type: "TemplateElement",
				value: {
					raw: quasi.raw,
					cooked: quasi.value as string
				},
				tail,
				loc: quasi.loc
			});
			if (tail) {
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
	 * Return the token after the current one without consuming anything
	 * (the EOF token when the current token is the last one).
	 */
	private peekNext(): Token {
		return this.tokens[Math.min(this.current + 1, this.tokens.length - 1)];
	}

	/**
	 * Error recovery: skip tokens up to the next boundary at the current nesting
	 * level, leaving the boundary token unconsumed for the caller.
	 *
	 * A boundary is a `,` (when `stopAtComma` is set), a closing `}` / `]` or a
	 * template middle / tail that closes the enclosing construct, or EOF.
	 * Nested objects, arrays and templates opened while skipping are skipped
	 * whole, so the commas and closers inside them are not mistaken for
	 * boundaries of the enclosing construct.
	 *
	 * @param stopAtComma - Stop at a `,` (a property or element boundary); an
	 *   interpolation has no commas of its own, so template recovery passes `false`.
	 */
	private synchronize(stopAtComma: boolean = true): void {
		let depth = 0;

		while (!this.isAtEnd()) {
			switch (this.peek().type) {
				case TokenType.LBRACE:
				case TokenType.LBRACKET:
				case TokenType.TEMPLATE_HEAD:
					depth++;
					break;
				case TokenType.RBRACE:
				case TokenType.RBRACKET:
				case TokenType.TEMPLATE_TAIL:
					if (depth === 0) {
						return;
					}
					depth--;
					break;
				case TokenType.TEMPLATE_MIDDLE:
					if (depth === 0) {
						return;
					}
					break;
				case TokenType.COMMA:
					if (depth === 0 && stopAtComma) {
						return;
					}
					break;
			}
			this.advance();
		}
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

		// While recovering, the construct that reported an error and the
		// constructs enclosing it can each stop at the same unexpected token
		// (`Expected ',' or ']'`, then `Expected RBRACKET`, then `Unexpected token
		// after root value`). Only the first report at a position is kept.
		const last = this.errors[this.errors.length - 1];
		if (last && last.loc.start.offset === token.loc.start.offset) {
			return;
		}

		const error: ParseError = {
			message,
			loc: token.loc!,
			code: "PARSE_ERROR"
		};

		this.errors.push(error);
	}

	/**
	 * Convert AST to JavaScript value with multi-pass internal reference resolution
	 *
	 * Pass 1: Build object structure, marking all references as __UNRESOLVED__
	 * Pass 2-N: Resolve references that point to concrete values (not other markers)
	 * Max 3 passes, then error on remaining unresolved references
	 */
	evaluate(program: Program): any {
		// Pass 1: Build structure with unresolved markers
		let result = this.evaluateNodePass1(program.body);

		if (!this.options.allowInternalReferences) {
			// No references allowed, apply reviver and return
			return this.applyReviver("", result, { "": result });
		}

		// Pass 2-N: Resolve references (max 3 passes)
		const maxPasses = 3;
		for (let pass = 1; pass <= maxPasses; pass++) {
			const { value, changed } = this.resolvePass(result, result);
			result = value;

			// If nothing resolved this pass, we're done
			if (!changed) {
				break;
			}
		}

		// Check for unresolved references (circular or undefined)
		this.checkUnresolved(result);

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

		return parts.join(".");
	}

	/**
	 * Pass 2-N: Resolve references in a value recursively
	 * Only resolves if target has concrete value (not another marker)
	 */
	private resolvePass(value: any, rootObj: any): { value: any; changed: boolean } {
		let changed = false;

		// Handle arrays
		if (Array.isArray(value)) {
			const arr = [];
			for (const item of value) {
				const result = this.resolvePass(item, rootObj);
				arr.push(result.value);
				if (result.changed) {
					changed = true;
				}
			}
			return { value: arr, changed };
		}

		// Handle unresolved references
		if (isUnresolved(value)) {
			const resolved = this.tryResolve(value, rootObj);

			// Only resolve if target is concrete (not another marker)
			if (resolved !== undefined && !isUnresolved(resolved)) {
				return { value: resolved, changed: true };
			}

			// Still unresolved, keep marker
			return { value, changed: false };
		}

		// Handle objects
		if (value && typeof value === "object" && value !== null) {
			const obj: Record<string, any> = {};
			for (const key in value) {
				const result = this.resolvePass(value[key], rootObj);
				obj[key] = result.value;
				if (result.changed) {
					changed = true;
				}
			}
			return { value: obj, changed };
		}

		// Primitive - no change
		return { value, changed: false };
	}

	/**
	 * Try to resolve a single reference by looking it up in root object
	 */
	private tryResolve(ref: UnresolvedReference, rootObj: any): any {
		const node = ref.node;

		if (node.type === "Identifier") {
			return rootObj[node.name];
		}

		if (node.type === "MemberExpression") {
			return this.resolveMemberExpr(node, rootObj);
		}

		if (node.type === "TemplateLiteral") {
			return this.resolveTemplate(node, rootObj);
		}

		return undefined;
	}

	/**
	 * Resolve a member expression by walking the path in rootObj
	 */
	private resolveMemberExpr(node: MemberExpression, rootObj: any): any {
		// Build path: database.primary.port → ["database", "primary", "port"]
		const path: string[] = [];
		let current: Expression = node;

		while (current.type === "MemberExpression") {
			const memberExpr = current as MemberExpression;
			path.unshift(memberExpr.property.name);
			current = memberExpr.object;
		}

		if (current.type === "Identifier") {
			path.unshift((current as Identifier).name);
		}

		// Walk the path in rootObj
		let value: any = rootObj;
		for (const prop of path) {
			if (value === null || value === undefined || typeof value !== "object") {
				return undefined;
			}
			if (!(prop in value)) {
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

				// If value is still unresolved, can't resolve template yet
				if (value === undefined || isUnresolved(value)) {
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
	 * value here. Returns `undefined` or an unresolved marker when the expression
	 * cannot be resolved yet (a reference whose target is missing or not yet
	 * resolved, or an inline object or array), which leaves the enclosing template
	 * unresolved for this pass.
	 */
	private resolveInterpolation(expr: Expression, rootObj: any): any {
		switch (expr.type) {
			case "Identifier":
				return rootObj[expr.name];
			case "MemberExpression":
				return this.resolveMemberExpr(expr, rootObj);
			case "TemplateLiteral":
				return this.resolveTemplate(expr, rootObj);
			case "Literal":
				return expr.value;
			default:
				return undefined;
		}
	}

	/**
	 * Check for unresolved references and throw error
	 */
	private checkUnresolved(value: any, path: string = ""): void {
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				this.checkUnresolved(value[i], `${path}[${i}]`);
			}
			return;
		}

		if (isUnresolved(value)) {
			throw new JsonvReferenceError(
				`Unresolved reference: ${value.path} (circular reference or undefined)`,
				value.node.loc!,
				"UNRESOLVED_REFERENCE"
			);
		}

		if (value && typeof value === "object" && value !== null) {
			for (const key in value) {
				this.checkUnresolved(value[key], path ? `${path}.${key}` : key);
			}
		}
	}
}

/**
 * Convert a collected parse error to the {@link JsonvSyntaxError} a parse
 * throws for it, with the position appended to the message.
 */
function toSyntaxError(error: ParseError): JsonvSyntaxError {
	const message = `${error.message} at line ${error.loc.start.line}, column ${error.loc.start.column}`;
	return new JsonvSyntaxError(message, error.loc, error.code);
}

/**
 * Parse and evaluate `text`, the shared body of {@link parse} and
 * {@link parseWithOptions}.
 *
 * A strict parse throws the first syntax error. A tolerant parse that
 * collected any syntax errors throws one {@link JsonvAggregateSyntaxError}
 * listing all of them in source order, and does not evaluate the partial
 * document (evaluating it would report references in the recovered structure
 * instead of the syntax errors). A lexical error aborts tokenization before
 * anything can be collected; a tolerant parse reports it through the same
 * aggregate so tolerant callers always get one error shape.
 */
function parseAndEvaluate(text: string, options: ParseOptions): any {
	const parser = new Parser(text, options);
	let result: ParseResult;
	try {
		result = parser.parse();
	} catch (err) {
		if (options.tolerant && err instanceof JsonvSyntaxError) {
			throw new JsonvAggregateSyntaxError([err]);
		}
		throw err;
	}

	const errors = result.errors ?? [];
	if (errors.length > 0) {
		if (!options.tolerant) {
			throw toSyntaxError(errors[0]);
		}
		// Array#sort is stable, so errors at the same offset keep their order.
		const ordered = [...errors].sort((a, b) => a.loc.start.offset - b.loc.start.offset);
		throw new JsonvAggregateSyntaxError(ordered.map(toSyntaxError));
	}

	return parser.evaluate(result.program);
}

/**
 * Public parse function
 * Compatible with JSON.parse(text, reviver) signature
 */
export function parse(text: string, reviver?: (this: any, key: string, value: any) => any): any {
	return parseAndEvaluate(text, { reviver });
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
 * Parse with explicit options.
 *
 * With `tolerant: true` the parser recovers from syntax errors and keeps
 * collecting them; if any were collected, one {@link JsonvAggregateSyntaxError}
 * listing every error in source order is thrown and the document is not
 * evaluated. Input without syntax errors evaluates exactly as in a strict parse.
 */
export function parseWithOptions(text: string, options?: ParseOptions): any {
	return parseAndEvaluate(text, options ?? {});
}
