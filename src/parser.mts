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
import type { Token, LexerError } from "./lexer/lexer-types.mjs";
import { TokenType, getFeatureYear, resolveMode, FEATURE_NOT_ALLOWED_IN_MODE, MODE_LABELS } from "./lexer/lexer-types.mjs";
import { JsonvSyntaxError, JsonvReferenceError, JsonvAggregateSyntaxError } from "./errors.mjs";

// Re-exported so consumers importing from the "./parser" subpath (where both
// throw sites for this error live) can detect it without a separate import.
export { JsonvSyntaxError };

// Re-exported so consumers importing from the "./parser" subpath (where
// tolerant parses throw it) can detect it without a separate import.
export { JsonvAggregateSyntaxError };

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
 * Convert a lexer error into a collected {@link ParseError}.
 */
function toParseError(error: LexerError): ParseError {
	return {
		message: error.message,
		loc: error.loc,
		code: error.code,
		line: error.line,
		column: error.column,
		offset: error.offset
	};
}

/**
 * Placeholder node for text the lexer could not read (an `Unknown` token):
 * a `Literal` whose `value` is `null` and whose `raw` is the unreadable text.
 */
function unreadable(token: Token): Literal {
	return {
		type: "Literal",
		value: null,
		raw: token.raw,
		loc: token.loc
	};
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
	private readonly jsonOnly: boolean; // mode === "json": RFC 8259 only
	private readonly restricted: boolean; // mode !== "jsonv": no jsonv extensions

	/**
	 * @throws {TypeError} When `options.mode` is not `"jsonv"`, `"json5"` or `"json"`
	 */
	constructor(source: string, options: ParseOptions = {}) {
		const requestedYear = options.year ?? new Date().getFullYear();
		const targetYear = getFeatureYear(requestedYear) as 2011 | 2015 | 2020 | 2021;
		const mode = resolveMode(options.mode);
		this.jsonOnly = mode === "json";
		this.restricted = mode !== "jsonv";

		this.lexer = new Lexer(source, {
			// The lexer maps this to its feature year itself; it also needs the
			// requested year for rules that change between feature years (ES2019
			// allows U+2028/U+2029 in strings, but 2019 maps to feature year 2015).
			year: requestedYear,
			preserveComments: options.preserveComments ?? false,
			mode,
			strictOctal: options.strictOctal ?? false
		});

		// Set default options
		this.options = {
			reviver: options.reviver ?? ((key, value) => value),
			mode,
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
		return this.run(this.lexer.tokenize(), []);
	}

	/**
	 * Parse the input, collecting lexical errors into `errors` instead of
	 * throwing them.
	 *
	 * Without `tolerant`, lexing stops at the first lexical error; the program
	 * is parsed from the tokens lexed before it, and that error is the only one
	 * reported. With `tolerant`, the lexer skips the unreadable text and keeps
	 * going, and every lexical and parse error is reported in source order.
	 *
	 * @internal Used by {@link parseToAst}.
	 */
	parseCollectingLexerErrors(): ParseResult {
		const { tokens, errors } = this.lexer.tokenizeCollectingErrors(this.options.tolerant);
		const result = this.run(tokens, errors.map(toParseError));
		// Lexical errors are collected before parsing starts; restore source order.
		result.errors?.sort((a, b) => a.offset - b.offset);
		return result;
	}

	/**
	 * Parse a token stream.
	 * @param lexed - Tokens from the lexer, ending with EOF
	 * @param lexerErrors - Lexical errors already collected; parse errors are appended
	 */
	private run(lexed: Token[], lexerErrors: ParseError[]): ParseResult {
		// Separate comments from the tokens the grammar consumes so comments may
		// appear between any two tokens.
		this.tokens = [];
		this.comments = [];
		this.errors = lexerErrors;
		for (const token of lexed) {
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
			// Unknown tokens only stand in for text the lexer could not read.
			tokens: this.tokens.slice(0, -1).filter((token) => token.type !== TokenType.UNKNOWN),
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
				if (this.restricted) {
					this.addModeError("Internal references", token);
				}
				return this.parseIdentifier();

			case TokenType.TEMPLATE_LITERAL:
			case TokenType.TEMPLATE_HEAD:
				return this.parseTemplateLiteral();

			case TokenType.UNKNOWN:
				// Text the lexer could not read; the lexer already reported it.
				return unreadable(this.advance());

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
				if (this.jsonOnly) {
					this.addModeError("Infinity", token);
				}
				value = token.raw.startsWith("-") ? -Infinity : Infinity;
				break;
			case TokenType.NAN:
				if (this.jsonOnly) {
					this.addModeError("NaN", token);
				}
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
				const comma = this.advance();
				// Allow trailing comma before } (not in JSON mode)
				if (this.check(TokenType.RBRACE)) {
					if (this.jsonOnly) {
						this.addModeError("Trailing commas", comma);
					}
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

		if (keyToken.type === TokenType.UNKNOWN) {
			// Text the lexer could not read; the lexer already reported it.
			key = unreadable(this.advance());
		} else if (keyToken.type === TokenType.STRING || keyToken.type === TokenType.NUMBER || keyToken.type === TokenType.BIGINT) {
			// Quoted key, or numeric key (a jsonv extension; JSON and JSON5 keys are strings or identifiers)
			if (this.restricted && keyToken.type !== TokenType.STRING) {
				this.addModeError("Numeric keys", keyToken);
			}
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
			if (this.jsonOnly) {
				this.addModeError("Unquoted keys", keyToken);
			}
			this.advance();
			key = {
				type: "Identifier",
				// An identifier's value is its name with any \uXXXX escapes decoded
				name: keyToken.type === TokenType.IDENTIFIER ? (keyToken.value as string) : keyToken.raw,
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
				const comma = this.advance();
				// Allow trailing comma before ] (not in JSON mode)
				if (this.check(TokenType.RBRACKET)) {
					if (this.jsonOnly) {
						this.addModeError("Trailing commas", comma);
					}
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
			let quasi = this.peek();
			if (quasi.type !== TokenType.TEMPLATE_MIDDLE && quasi.type !== TokenType.TEMPLATE_TAIL && quasi.type !== TokenType.UNKNOWN) {
				this.addError("Expected template middle or template tail", quasi);
				// Tolerant recovery: skip the rest of this interpolation up to the
				// template's next middle or tail and continue from there, so the
				// leftover tokens are not misread by the enclosing value.
				this.synchronize(false);
				quasi = this.peek();
				if (this.isAtEnd() || (quasi.type !== TokenType.TEMPLATE_MIDDLE && quasi.type !== TokenType.TEMPLATE_TAIL)) {
					break;
				}
			}

			if (quasi.type === TokenType.UNKNOWN) {
				// The rest of the template could not be read; the lexer already reported it.
				this.advance();
				break;
			}

			this.advance();
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
			code: "UNSUPPORTED_INTERPOLATION",
			line: expr.loc!.start.line,
			column: expr.loc!.start.column,
			offset: expr.loc!.start.offset
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
	private addError(message: string, token: Token, code: string = "PARSE_ERROR"): void {
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
			code,
			line: token.loc!.start.line,
			column: token.loc!.start.column,
			offset: token.loc!.start.offset
		};

		this.errors.push(error);
	}

	/**
	 * Add a parse error for a feature the current mode does not allow, e.g.
	 * "Trailing commas not allowed in JSON mode", with code `FEATURE_NOT_ALLOWED_IN_MODE`.
	 */
	private addModeError(feature: string, token: Token): void {
		this.addError(`${feature} not allowed in ${MODE_LABELS[this.options.mode]} mode`, token, FEATURE_NOT_ALLOWED_IN_MODE);
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
 * Normalize the second argument of `parse()`: a reviver function (the
 * `JSON.parse(text, reviver)` form) or a {@link ParseOptions} object.
 */
function toParseOptions(reviverOrOptions?: ((this: any, key: string, value: any) => any) | ParseOptions): ParseOptions {
	return typeof reviverOrOptions === "function" ? { reviver: reviverOrOptions } : { ...reviverOrOptions };
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
 * Compatible with JSON.parse(text, reviver) signature; also accepts a
 * {@link ParseOptions} object in place of the reviver.
 */
export function parse(text: string, reviverOrOptions?: ((this: any, key: string, value: any) => any) | ParseOptions): any {
	return parseAndEvaluate(text, toParseOptions(reviverOrOptions));
}

/**
 * Parse jsonv text to a positioned AST for tooling (linters, formatters,
 * editors) without evaluating it.
 *
 * Unlike {@link Parser.parse}, every list is always present: `comments` is
 * collected by default (pass `preserveComments: false` to skip it, which
 * yields an empty array) and `errors` is an empty array when the input parsed
 * cleanly. Nothing is thrown for invalid input: lexical errors (an
 * unterminated string, an invalid escape, a year-gated literal) and parse
 * errors are both collected into `errors` as {@link ParseError} objects.
 *
 * Without `tolerant: true`, only the first error is collected: lexing stops at
 * the first lexical error, so `tokens` and `comments` hold what was lexed
 * before it, and a lexical error takes precedence over parse errors (it is
 * the error `parseWithOptions` would throw). With `tolerant: true`, the lexer
 * skips unreadable text and keeps going, and every lexical and parse error is
 * collected in source order.
 *
 * `program` is always a `Program`, never `null`: on error it is the partial
 * program recovered from the tokens that could be read. A value the lexer
 * could not read is a `Literal` with `value: null` whose `raw` is the
 * unreadable text; it has no entry in `tokens`.
 *
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
	const result = new Parser(text, { ...options, preserveComments: options.preserveComments ?? true }).parseCollectingLexerErrors();

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
