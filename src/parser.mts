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
	MemberExpression
} from "./ast-types.mjs";
import type { ParseOptions } from "./api-types.mjs";
import { Lexer } from "./lexer/lexer.mjs";
import type { Token } from "./lexer/lexer-types.mjs";
import { TokenType, getFeatureYear } from "./lexer/lexer-types.mjs";

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
	private tokens: Token[] = [];
	private current: number = 0;
	private errors: ParseError[] = [];
	private evaluationStack: Set<string> = new Set(); // Track references being evaluated (circular detection)

	constructor(source: string, options: ParseOptions = {}) {
		const targetYear = getFeatureYear(options.year ?? new Date().getFullYear()) as 2011 | 2015 | 2020 | 2021;

		this.lexer = new Lexer(source, {
			year: targetYear,
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
	 * Parse the input and return AST
	 */
	parse(): ParseResult {
		// Tokenize the input
		this.tokens = this.lexer.tokenize();
		this.current = 0;

		// Parse the root value
		const body = this.parseValue();

		// Expect EOF
		if (!this.isAtEnd()) {
			this.addError("Unexpected token after root value", this.peek());
		}

		const program: Program = {
			type: "Program",
			body
		};

		return {
			program,
			errors: this.errors.length > 0 ? this.errors : undefined
		};
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
	 * Skip any comment tokens
	 */
	private skipComments(): void {
		while (!this.isAtEnd() && (this.peek().type === TokenType.LINE_COMMENT || this.peek().type === TokenType.BLOCK_COMMENT)) {
			this.advance();
		}
	}

	/**
	 * Parse an object expression
	 */
	private parseObject(): ObjectExpression {
		const start = this.expect(TokenType.LBRACE);
		const properties: Property[] = [];

		this.skipComments(); // Skip comments after opening brace

		while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
			properties.push(this.parseProperty());

			this.skipComments(); // Skip comments after property

			// Handle trailing comma
			if (this.check(TokenType.COMMA)) {
				this.advance();
				this.skipComments(); // Skip comments after comma
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
		let key: Expression | string;
		let computed = false;

		if (keyToken.type === TokenType.STRING) {
			// Quoted key
			const literal = this.parseLiteral();
			key = literal.value as string;
		} else if (keyToken.type === TokenType.IDENTIFIER) {
			// Unquoted key
			this.advance();
			key = keyToken.value as string;
		} else if (keyToken.type === TokenType.NUMBER || keyToken.type === TokenType.BIGINT) {
			// Numeric key (JSON5 allows numbers as keys, including BigInt)
			const literal = this.parseLiteral();
			key = String(literal.value);
		} else if (
			keyToken.type === TokenType.TRUE ||
			keyToken.type === TokenType.FALSE ||
			keyToken.type === TokenType.NULL ||
			keyToken.type === TokenType.INFINITY ||
			keyToken.type === TokenType.NAN
		) {
			// Keywords as keys (JSON5 allows reserved words as unquoted keys)
			this.advance();
			key = keyToken.raw;
		} else {
			this.addError(`Expected property key, got ${getTokenTypeName(keyToken.type)}`, keyToken);
			this.advance();
			key = "error";
		}

		this.expect(TokenType.COLON);
		const value = this.parseValue();

		return {
			type: "Property",
			key,
			value,
			computed,
			loc: keyToken.loc
		};
	}

	/**
	 * Parse an array expression
	 */
	private parseArray(): ArrayExpression {
		const start = this.expect(TokenType.LBRACKET);
		const elements: (Expression | null)[] = [];

		this.skipComments(); // Skip comments after opening bracket

		while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
			elements.push(this.parseValue());

			this.skipComments(); // Skip comments after element

			// Handle trailing comma
			if (this.check(TokenType.COMMA)) {
				this.advance();
				this.skipComments(); // Skip comments after comma
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
			const expr = this.parseValue();
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
			loc: token.loc
		};
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
					const key = typeof prop.key === "string" ? prop.key : String((prop.key as Literal).value);
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
				const expr = node.expressions[i];
				let value: any;

				if (expr.type === "Identifier") {
					value = rootObj[expr.name];
				} else if (expr.type === "MemberExpression") {
					value = this.resolveMemberExpr(expr, rootObj);
				} else {
					value = undefined;
				}

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
			throw new Error(`Unresolved reference: ${value.path} (circular reference or undefined)`);
		}

		if (value && typeof value === "object" && value !== null) {
			for (const key in value) {
				this.checkUnresolved(value[key], path ? `${path}.${key}` : key);
			}
		}
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
		throw new SyntaxError(`${firstError.message} at line ${firstError.loc.start.line}, column ${firstError.loc.start.column}`);
	}

	return parser.evaluate(result.program);
}

/**
 * Parse with explicit options
 */
export function parseWithOptions(text: string, options?: ParseOptions): any {
	const parser = new Parser(text, options);
	const result = parser.parse();

	if (result.errors && result.errors.length > 0 && !options?.tolerant) {
		const firstError = result.errors[0];
		throw new SyntaxError(`${firstError.message} at line ${firstError.loc.start.line}, column ${firstError.loc.start.column}`);
	}

	return parser.evaluate(result.program);
}
