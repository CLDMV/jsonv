/**
 * Lexer/Tokenizer for @cldmv/jsonv
 *
 * Hand-written lexer that tokenizes JSON, JSON5, and jsonv input according to
 * the specified ES year's feature set.
 */

import type { Position } from "../ast-types.mjs";
import { TokenType, type Token, type LexerOptions, LexerError, getFeatureYear } from "./lexer-types.mjs";

/**
 * Lexer class for tokenizing jsonv input
 */
export class Lexer {
	private input: string;
	private pos: number = 0;
	private line: number = 1;
	private column: number = 0;
	private tokens: Token[] = [];
	private options: Required<LexerOptions>;
	private templateDepth: number = 0; // Track nesting depth of template interpolations

	/**
	 * Create a new lexer instance
	 * @param input - Input string to tokenize
	 * @param options - Lexer configuration options
	 */
	constructor(input: string, options: LexerOptions = {}) {
		this.input = input;

		// Normalize options with defaults
		const targetYear = options.year ?? new Date().getFullYear();
		const featureYear = getFeatureYear(targetYear);

		this.options = {
			preserveComments: options.preserveComments ?? false,
			year: featureYear,
			allowNumericSeparators: options.allowNumericSeparators ?? featureYear >= 2021,
			allowBigInt: options.allowBigInt ?? featureYear >= 2020,
			allowTemplateLiterals: options.allowTemplateLiterals ?? featureYear >= 2015,
			allowHexLiterals: options.allowHexLiterals ?? featureYear >= 2011, // JSON5
			allowBinaryOctalLiterals: options.allowBinaryOctalLiterals ?? featureYear >= 2015,
			strictOctal: options.strictOctal ?? false,
			mode: options.mode ?? "jsonv"
		};
	}

	/**
	 * Tokenize the entire input and return array of tokens
	 * @returns Array of tokens
	 */
	public tokenize(): Token[] {
		this.tokens = [];
		this.pos = 0;
		this.line = 1;
		this.column = 0;

		while (!this.isAtEnd()) {
			this.skipWhitespace();
			if (this.isAtEnd()) break;

			const token = this.nextToken();
			if (token) {
				// Filter comments unless preserveComments is enabled
				if (token.type === TokenType.LINE_COMMENT || token.type === TokenType.BLOCK_COMMENT) {
					if (this.options.preserveComments) {
						this.tokens.push(token);
					}
				} else {
					this.tokens.push(token);
				}
			}
		}

		// Add EOF token
		this.tokens.push(this.createToken(TokenType.EOF, null, ""));

		return this.tokens;
	}

	/**
	 * Get the next token from input
	 * @returns Next token or null if at end
	 */
	private nextToken(): Token | null {
		if (this.isAtEnd()) return null;

		const ch = this.peek();

		// Comments
		if (ch === "/" && this.peekNext() === "/") {
			// Bug fix #6: Reject comments in JSON mode
			if (this.options.mode === "json") {
				throw this.createError("Comments not allowed in JSON mode", "COMMENTS_NOT_ALLOWED");
			}
			return this.scanLineComment();
		}
		if (ch === "/" && this.peekNext() === "*") {
			// Bug fix #6: Reject comments in JSON mode
			if (this.options.mode === "json") {
				throw this.createError("Comments not allowed in JSON mode", "COMMENTS_NOT_ALLOWED");
			}
			return this.scanBlockComment();
		}

		// Strings
		if (ch === '"') {
			return this.scanString('"');
		}
		if (ch === "'") {
			return this.scanString("'");
		}

		// Template literals (ES2015+)
		if (ch === "`" && this.options.allowTemplateLiterals) {
			return this.scanTemplateLiteral();
		}

		// Numbers
		if (this.isDigit(ch) || (ch === "." && this.isDigit(this.peekNext()))) {
			return this.scanNumber();
		}

		// Negative numbers or minus sign
		// Bug fix #7: Handle negative Infinity and NaN
		if (ch === "-") {
			const next = this.peekNext();
			// Check if followed by number, decimal point, Infinity, or NaN
			if (this.isDigit(next) || (next === "." && this.isDigit(this.peekAhead(2)))) {
				return this.scanNumber();
			}
			// Special case: -Infinity or -NaN
			if (next === "I" || next === "N") {
				// Consume the minus sign
				this.advance();
				// Scan Infinity or NaN
				const keyword = this.scanIdentifierOrKeyword();
				// Negate the value
				if (keyword.type === TokenType.INFINITY) {
					return this.createToken(TokenType.NUMBER, -Infinity, "-" + keyword.raw);
				} else if (keyword.type === TokenType.NAN) {
					return this.createToken(TokenType.NUMBER, NaN, "-" + keyword.raw);
				}
				// If it wasn't Infinity or NaN, we have a problem
				throw this.createError(`Unexpected identifier after minus: ${keyword.value}`, "UNEXPECTED_TOKEN");
			}
		}

		// Plus sign (JSON5 allows +5)
		if (ch === "+") {
			const next = this.peekNext();
			if (this.isDigit(next) || (next === "." && this.isDigit(this.peekAhead(2)))) {
				return this.scanNumber();
			}
		}

		// Punctuation
		if (ch === "{") {
			return this.createToken(TokenType.LBRACE, "{", this.advance());
		}
		if (ch === "}") {
			// If we're inside a template interpolation, this closes it
			// Continue scanning the template instead of returning RBRACE
			if (this.templateDepth > 0) {
				this.advance(); // consume }
				return this.scanTemplateMiddleOrTail();
			}
			return this.createToken(TokenType.RBRACE, "}", this.advance());
		}
		if (ch === "[") {
			return this.createToken(TokenType.LBRACKET, "[", this.advance());
		}
		if (ch === "]") {
			return this.createToken(TokenType.RBRACKET, "]", this.advance());
		}
		if (ch === ":") {
			return this.createToken(TokenType.COLON, ":", this.advance());
		}
		if (ch === ",") {
			return this.createToken(TokenType.COMMA, ",", this.advance());
		}

		// Dot (for member expressions like obj.prop)
		// Only if NOT followed by digit (which would make it part of a number)
		if (ch === ".") {
			const next = this.peekNext();
			if (!this.isDigit(next)) {
				return this.createToken(TokenType.DOT, ".", this.advance());
			}
			// Otherwise fall through to number scanning
		}

		// Keywords and identifiers
		if (this.isIdentifierStart(ch)) {
			// Bug fix #4: Reject numeric literals starting with underscore
			if (ch === "_" && this.isDigit(this.peekNext())) {
				throw this.createError("Numeric literal cannot start with underscore", "INVALID_SEPARATOR");
			}
			return this.scanIdentifierOrKeyword();
		}

		// Unknown character
		throw this.createError(`Unexpected character: '${ch}'`, "UNEXPECTED_CHARACTER");
	}

	/**
	 * Scan a line comment (// ...)
	 */
	private scanLineComment(): Token {
		const start = this.pos;
		this.advance(); // /
		this.advance(); // /

		let value = "";
		while (!this.isAtEnd() && this.peek() !== "\n") {
			value += this.advance();
		}

		const raw = this.input.slice(start, this.pos);
		return this.createToken(TokenType.LINE_COMMENT, value, raw);
	}

	/**
	 * Scan a block comment (/* ... *\/)
	 */
	private scanBlockComment(): Token {
		const start = this.pos;
		const startLine = this.line;
		const startCol = this.column;

		this.advance(); // /
		this.advance(); // *

		let value = "";
		while (!this.isAtEnd()) {
			if (this.peek() === "*" && this.peekNext() === "/") {
				this.advance(); // *
				this.advance(); // /
				break;
			}
			value += this.advance();
		}

		// Check for unterminated comment
		if (this.isAtEnd() && (this.input[this.pos - 1] !== "/" || this.input[this.pos - 2] !== "*")) {
			throw new LexerError(
				"Unterminated block comment",
				{
					start: { line: startLine, column: startCol, offset: start },
					end: this.getCurrentPosition()
				},
				"UNTERMINATED_COMMENT"
			);
		}

		const raw = this.input.slice(start, this.pos);
		return this.createToken(TokenType.BLOCK_COMMENT, value, raw);
	}

	/**
	 * Scan a string literal (double or single quoted)
	 */
	private scanString(quote: '"' | "'"): Token {
		const start = this.pos;
		this.advance(); // opening quote

		let value = "";
		let escaped = false;
		let foundClosingQuote = false;

		while (!this.isAtEnd()) {
			const ch = this.peek();

			if (escaped) {
				// Handle escape sequences
				value += this.parseEscapeSequence();
				escaped = false;
				continue;
			}

			if (ch === "\\") {
				escaped = true;
				this.advance();
				continue;
			}

			if (ch === quote) {
				this.advance(); // closing quote
				foundClosingQuote = true;
				break;
			}

			// JSON5: allow line continuation with backslash
			if (ch === "\n" && !escaped) {
				throw this.createError("Unterminated string", "UNTERMINATED_STRING");
			}

			value += this.advance();
		}

		// Bug fix #2: Throw error if string was never closed
		if (!foundClosingQuote) {
			throw this.createError("Unterminated string", "UNTERMINATED_STRING");
		}

		const raw = this.input.slice(start, this.pos);
		return this.createToken(TokenType.STRING, value, raw);
	}

	/**
	 * Parse escape sequence in string
	 */
	private parseEscapeSequence(): string {
		if (this.isAtEnd()) {
			throw this.createError("Unexpected end of input in escape sequence", "INVALID_ESCAPE");
		}

		const ch = this.advance();

		switch (ch) {
			case '"':
				return '"';
			case "'":
				return "'";
			case "\\":
				return "\\";
			case "/":
				return "/";
			case "b":
				return "\b";
			case "f":
				return "\f";
			case "n":
				return "\n";
			case "r":
				return "\r";
			case "t":
				return "\t";
			case "v":
				return "\v"; // JSON5
			case "0":
				return "\0"; // JSON5
			case "u":
				return this.parseUnicodeEscape(4);
			case "x":
				return this.parseHexEscape(2); // JSON5
			case "\n":
				// JSON5: Line continuation
				return "";
			case "\r":
				// JSON5: Line continuation (handle CRLF)
				if (this.peek() === "\n") this.advance();
				return "";
			default:
				// JSON5: invalid escape is just the character
				return ch;
		}
	}

	/**
	 * Parse unicode escape sequence (\uXXXX)
	 */
	private parseUnicodeEscape(length: number): string {
		let hex = "";
		for (let i = 0; i < length; i++) {
			if (this.isAtEnd() || !this.isHexDigit(this.peek())) {
				throw this.createError("Invalid unicode escape sequence", "INVALID_UNICODE_ESCAPE");
			}
			hex += this.advance();
		}
		return String.fromCharCode(parseInt(hex, 16));
	}

	/**
	 * Parse hex escape sequence (\xXX)
	 */
	private parseHexEscape(length: number): string {
		let hex = "";
		for (let i = 0; i < length; i++) {
			if (this.isAtEnd() || !this.isHexDigit(this.peek())) {
				throw this.createError("Invalid hex escape sequence", "INVALID_HEX_ESCAPE");
			}
			hex += this.advance();
		}
		return String.fromCharCode(parseInt(hex, 16));
	}

	/**
	 * Scan a template literal (backtick string)
	 */
	/**
	 * Scan a template literal or template head
	 * Handles both plain templates and templates with interpolation
	 */
	private scanTemplateLiteral(): Token {
		const start = this.pos;
		this.advance(); // opening backtick

		let value = "";

		while (!this.isAtEnd()) {
			const ch = this.peek();

			// Check for interpolation start
			if (ch === "$" && this.peekNext() === "{") {
				const raw = this.input.slice(start, this.pos + 2); // Include ${
				this.advance(); // $
				this.advance(); // {
				this.templateDepth++; // Enter template interpolation mode
				return this.createToken(TokenType.TEMPLATE_HEAD, value, raw);
			}

			// Check for closing backtick
			if (ch === "`") {
				this.advance(); // closing backtick
				const raw = this.input.slice(start, this.pos);
				return this.createToken(TokenType.TEMPLATE_LITERAL, value, raw);
			}

			// Handle escape sequences
			if (ch === "\\") {
				this.advance(); // backslash
				if (!this.isAtEnd()) {
					value += this.parseEscapeSequence();
				}
				continue;
			}

			// Regular character
			value += this.advance();
		}

		throw this.createError("Unterminated template literal", "UNTERMINATED_TEMPLATE");
	}

	/**
	 * Continue scanning a template after an interpolation expression
	 * Called after the parser consumes the interpolation expression and encounters }
	 */
	private scanTemplateMiddleOrTail(): Token {
		const start = this.pos;
		let value = "";

		while (!this.isAtEnd()) {
			const ch = this.peek();

			// Check for another interpolation
			if (ch === "$" && this.peekNext() === "{") {
				const raw = this.input.slice(start, this.pos + 2); // Include ${
				this.advance(); // $
				this.advance(); // {
				return this.createToken(TokenType.TEMPLATE_MIDDLE, value, raw);
			}

			// Check for closing backtick
			if (ch === "`") {
				this.advance(); // closing backtick
				const raw = this.input.slice(start, this.pos);
				this.templateDepth--; // Exit template interpolation mode
				return this.createToken(TokenType.TEMPLATE_TAIL, value, raw);
			}

			// Handle escape sequences
			if (ch === "\\") {
				this.advance(); // backslash
				if (!this.isAtEnd()) {
					value += this.parseEscapeSequence();
				}
				continue;
			}

			// Regular character
			value += this.advance();
		}

		throw this.createError("Unterminated template literal", "UNTERMINATED_TEMPLATE");
	}

	/**
	 * Scan a number literal
	 * TODO: Phase 3 - Complete AST metadata tracking with literalType
	 */
	private scanNumber(): Token {
		const start = this.pos;

		// Handle sign
		const isNegative = this.peek() === "-";
		const isPositive = this.peek() === "+";
		if (isNegative || isPositive) {
			this.advance();
		}

		// Check for hex, binary, octal
		if (this.peek() === "0" && !this.isAtEnd()) {
			const next = this.peekNext();

			// Hexadecimal (0x or 0X)
			if (next === "x" || next === "X") {
				if (!this.options.allowHexLiterals) {
					throw this.createError("Hexadecimal literals not allowed in this year", "INVALID_LITERAL");
				}
				this.advance(); // 0
				this.advance(); // x

				return this.scanHexNumber(start, isNegative);
			}

			// Binary (0b or 0B)
			if (next === "b" || next === "B") {
				if (!this.options.allowBinaryOctalLiterals) {
					throw this.createError("Binary literals not allowed in this year", "INVALID_LITERAL");
				}
				this.advance(); // 0
				this.advance(); // b

				return this.scanBinaryNumber(start, isNegative);
			}

			// Octal (0o or 0O)
			if (next === "o" || next === "O") {
				if (!this.options.allowBinaryOctalLiterals) {
					throw this.createError("Octal literals not allowed in this year", "INVALID_LITERAL");
				}
				this.advance(); // 0
				this.advance(); // o

				return this.scanOctalNumber(start, isNegative);
			}

			// Legacy octal (0755)
			if (this.isDigit(next)) {
				if (this.options.strictOctal) {
					throw this.createError("Legacy octal literals require 0o prefix in strict mode", "INVALID_OCTAL");
				}
				this.advance(); // 0

				return this.scanLegacyOctalNumber(start, isNegative);
			}
		}

		// Decimal number
		return this.scanDecimalNumber(start, isNegative);
	}

	/**
	 * Scan hexadecimal number (0xFFn or 0xFF_AAn)
	 */
	private scanHexNumber(start: number, isNegative: boolean): Token {
		let digits = "";
		let hasDigits = false;

		while (!this.isAtEnd()) {
			const ch = this.peek();

			if (this.isHexDigit(ch)) {
				digits += this.advance();
				hasDigits = true;
			} else if (ch === "_") {
				// Bug fix #5: Check if numeric separators are allowed for this year
				if (!this.options.allowNumericSeparators) {
					throw this.createError("Numeric separators not allowed in this year", "INVALID_SEPARATOR");
				}
				this.advance();
				// Validate separator rules
				if (!hasDigits || !this.isHexDigit(this.peek())) {
					throw this.createError("Invalid numeric separator position", "INVALID_SEPARATOR");
				}
			} else {
				break;
			}
		}

		if (!hasDigits) {
			throw this.createError("Hex literal must have at least one digit", "INVALID_HEX");
		}

		// Check for BigInt suffix
		const hasBigIntSuffix = this.peek() === "n";
		if (hasBigIntSuffix) {
			if (!this.options.allowBigInt) {
				throw this.createError("BigInt literals not allowed in this year", "INVALID_BIGINT");
			}
			this.advance(); // n
		}

		const raw = this.input.slice(start, this.pos);
		const numValue = parseInt(digits, 16);

		if (hasBigIntSuffix) {
			const bigintValue = BigInt((isNegative ? "-" : "") + "0x" + digits);
			return this.createToken(TokenType.BIGINT, bigintValue, raw);
		} else {
			const value = isNegative ? -numValue : numValue;
			return this.createToken(TokenType.NUMBER, value, raw);
		}
	}

	/**
	 * Scan binary number (0b1010n or 0b1111_0000n)
	 */
	private scanBinaryNumber(start: number, isNegative: boolean): Token {
		let digits = "";
		let hasDigits = false;

		while (!this.isAtEnd()) {
			const ch = this.peek();

			if (ch === "0" || ch === "1") {
				digits += this.advance();
				hasDigits = true;
			} else if (ch === "_") {
				// Bug fix #5: Check if numeric separators are allowed for this year
				if (!this.options.allowNumericSeparators) {
					throw this.createError("Numeric separators not allowed in this year", "INVALID_SEPARATOR");
				}
				this.advance();
				// Validate separator rules
				if (!hasDigits || (this.peek() !== "0" && this.peek() !== "1")) {
					throw this.createError("Invalid numeric separator position", "INVALID_SEPARATOR");
				}
			} else {
				break;
			}
		}

		if (!hasDigits) {
			throw this.createError("Binary literal must have at least one digit", "INVALID_BINARY");
		}

		// Check for BigInt suffix
		const hasBigIntSuffix = this.peek() === "n";
		if (hasBigIntSuffix) {
			if (!this.options.allowBigInt) {
				throw this.createError("BigInt literals not allowed in this year", "INVALID_BIGINT");
			}
			this.advance(); // n
		}

		const raw = this.input.slice(start, this.pos);
		const numValue = parseInt(digits, 2);

		if (hasBigIntSuffix) {
			const bigintValue = BigInt((isNegative ? "-" : "") + "0b" + digits);
			return this.createToken(TokenType.BIGINT, bigintValue, raw);
		} else {
			const value = isNegative ? -numValue : numValue;
			return this.createToken(TokenType.NUMBER, value, raw);
		}
	}

	/**
	 * Scan octal number with 0o prefix (0o755n or 0o755_644n)
	 */
	private scanOctalNumber(start: number, isNegative: boolean): Token {
		let digits = "";
		let hasDigits = false;

		while (!this.isAtEnd()) {
			const ch = this.peek();

			if (ch >= "0" && ch <= "7") {
				digits += this.advance();
				hasDigits = true;
			} else if (ch === "_") {
				// Bug fix #5: Check if numeric separators are allowed for this year
				if (!this.options.allowNumericSeparators) {
					throw this.createError("Numeric separators not allowed in this year", "INVALID_SEPARATOR");
				}
				this.advance();
				// Validate separator rules
				const next = this.peek();
				if (!hasDigits || next < "0" || next > "7") {
					throw this.createError("Invalid numeric separator position", "INVALID_SEPARATOR");
				}
			} else {
				break;
			}
		}

		if (!hasDigits) {
			throw this.createError("Octal literal must have at least one digit", "INVALID_OCTAL");
		}

		// Check for BigInt suffix
		const hasBigIntSuffix = this.peek() === "n";
		if (hasBigIntSuffix) {
			if (!this.options.allowBigInt) {
				throw this.createError("BigInt literals not allowed in this year", "INVALID_BIGINT");
			}
			this.advance(); // n
		}

		const raw = this.input.slice(start, this.pos);
		const numValue = parseInt(digits, 8);

		if (hasBigIntSuffix) {
			const bigintValue = BigInt((isNegative ? "-" : "") + "0o" + digits);
			return this.createToken(TokenType.BIGINT, bigintValue, raw);
		} else {
			const value = isNegative ? -numValue : numValue;
			return this.createToken(TokenType.NUMBER, value, raw);
		}
	}

	/**
	 * Scan legacy octal number without 0o prefix (0755n)
	 */
	private scanLegacyOctalNumber(start: number, isNegative: boolean): Token {
		let digits = "";

		while (!this.isAtEnd()) {
			const ch = this.peek();

			if (ch >= "0" && ch <= "7") {
				digits += this.advance();
			} else if (this.isDigit(ch)) {
				// Invalid octal digit (8 or 9) - treat as decimal
				return this.scanDecimalNumber(start, isNegative);
			} else {
				break;
			}
		}

		// Check for BigInt suffix
		const hasBigIntSuffix = this.peek() === "n";
		if (hasBigIntSuffix) {
			if (!this.options.allowBigInt) {
				throw this.createError("BigInt literals not allowed in this year", "INVALID_BIGINT");
			}
			this.advance(); // n
		}

		const raw = this.input.slice(start, this.pos);
		const numValue = parseInt("0" + digits, 8);

		if (hasBigIntSuffix) {
			const bigintValue = BigInt((isNegative ? "-" : "") + "0o" + digits);
			return this.createToken(TokenType.BIGINT, bigintValue, raw);
		} else {
			const value = isNegative ? -numValue : numValue;
			return this.createToken(TokenType.NUMBER, value, raw);
		}
	}

	/**
	 * Scan decimal number (123.45, 1e10, 123n, 1_000_000)
	 */
	private scanDecimalNumber(start: number, isNegative: boolean): Token {
		let numStr = "";
		let hasDigits = false;
		let hasDecimalPoint = false;
		let hasExponent = false;

		// Integer part
		while (!this.isAtEnd()) {
			const ch = this.peek();

			if (this.isDigit(ch)) {
				numStr += this.advance();
				hasDigits = true;
			} else if (ch === "_") {
				// Bug fix #5: Check if numeric separators are allowed for this year
				if (!this.options.allowNumericSeparators) {
					throw this.createError("Numeric separators not allowed in this year", "INVALID_SEPARATOR");
				}
				this.advance();
				// Validate separator rules
				if (!hasDigits || !this.isDigit(this.peek())) {
					throw this.createError("Invalid numeric separator position", "INVALID_SEPARATOR");
				}
			} else {
				break;
			}
		}

		// Decimal point
		if (this.peek() === ".") {
			hasDecimalPoint = true;
			numStr += this.advance();

			// Fractional part
			while (!this.isAtEnd()) {
				const ch = this.peek();

				if (this.isDigit(ch)) {
					numStr += this.advance();
					hasDigits = true;
				} else if (ch === "_") {
					// Bug fix #5: Check if numeric separators are allowed for this year
					if (!this.options.allowNumericSeparators) {
						throw this.createError("Numeric separators not allowed in this year", "INVALID_SEPARATOR");
					}
					this.advance();
					// Validate separator rules
					if (!this.isDigit(this.peek())) {
						throw this.createError("Invalid numeric separator position", "INVALID_SEPARATOR");
					}
				} else {
					break;
				}
			}
		}

		// Exponent
		if (this.peek() === "e" || this.peek() === "E") {
			hasExponent = true;
			numStr += this.advance();

			// Optional exponent sign
			if (this.peek() === "+" || this.peek() === "-") {
				numStr += this.advance();
			}

			// Exponent digits
			let hasExpDigits = false;
			while (!this.isAtEnd()) {
				const ch = this.peek();

				if (this.isDigit(ch)) {
					numStr += this.advance();
					hasExpDigits = true;
				} else if (ch === "_") {
					// Bug fix #5: Check if numeric separators are allowed for this year
					if (!this.options.allowNumericSeparators) {
						throw this.createError("Numeric separators not allowed in this year", "INVALID_SEPARATOR");
					}
					this.advance();
					// Validate separator rules
					if (!hasExpDigits || !this.isDigit(this.peek())) {
						throw this.createError("Invalid numeric separator position", "INVALID_SEPARATOR");
					}
				} else {
					break;
				}
			}

			if (!hasExpDigits) {
				throw this.createError("Exponent must have at least one digit", "INVALID_EXPONENT");
			}
		}

		// Check for BigInt suffix (not allowed with decimal point or exponent)
		const hasBigIntSuffix = this.peek() === "n";
		if (hasBigIntSuffix) {
			if (!this.options.allowBigInt) {
				throw this.createError("BigInt literals not allowed in this year", "INVALID_BIGINT");
			}
			if (hasDecimalPoint || hasExponent) {
				throw this.createError("BigInt cannot have decimal point or exponent", "INVALID_BIGINT");
			}
			this.advance(); // n
		}

		const raw = this.input.slice(start, this.pos);

		if (hasBigIntSuffix) {
			const bigintValue = BigInt((isNegative ? "-" : "") + numStr);
			return this.createToken(TokenType.BIGINT, bigintValue, raw);
		} else {
			const value = parseFloat((isNegative ? "-" : "") + numStr);
			return this.createToken(TokenType.NUMBER, value, raw);
		}
	}

	/**
	 * Scan an identifier or keyword
	 */
	private scanIdentifierOrKeyword(): Token {
		const start = this.pos;
		let value = "";

		// Read identifier characters
		while (!this.isAtEnd() && this.isIdentifierPart(this.peek())) {
			value += this.advance();
		}

		const raw = this.input.slice(start, this.pos);

		// Check for keywords
		switch (value) {
			case "true":
				return this.createToken(TokenType.TRUE, true, raw);
			case "false":
				return this.createToken(TokenType.FALSE, false, raw);
			case "null":
				return this.createToken(TokenType.NULL, null, raw);
			case "Infinity":
				return this.createToken(TokenType.INFINITY, Infinity, raw);
			case "NaN":
				return this.createToken(TokenType.NAN, NaN, raw);
			default:
				return this.createToken(TokenType.IDENTIFIER, value, raw);
		}
	}

	/**
	 * Skip whitespace characters
	 */
	private skipWhitespace(): void {
		while (!this.isAtEnd() && this.isWhitespace(this.peek())) {
			this.advance();
		}
	}

	/**
	 * Check if character is whitespace
	 * Per JSON5 spec Section 8 - White Space (Table 3):
	 * - U+0009 Horizontal tab
	 * - U+000A Line feed
	 * - U+000B Vertical tab
	 * - U+000C Form feed
	 * - U+000D Carriage return
	 * - U+0020 Space
	 * - U+00A0 Non-breaking space
	 * - U+2028 Line separator
	 * - U+2029 Paragraph separator
	 * - U+FEFF Byte order mark
	 * - Unicode Zs category (Space Separator)
	 */
	private isWhitespace(ch: string): boolean {
		const code = ch.charCodeAt(0);

		// Common whitespace (fast path)
		if (
			code === 0x20 || // Space
			code === 0x09 || // Horizontal tab
			code === 0x0a || // Line feed
			code === 0x0d || // Carriage return
			code === 0x0b || // Vertical tab
			code === 0x0c // Form feed
		) {
			return true;
		}

		// Additional JSON5 whitespace
		if (
			code === 0x00a0 || // Non-breaking space
			code === 0x2028 || // Line separator
			code === 0x2029 || // Paragraph separator
			code === 0xfeff // Byte order mark
		) {
			return true;
		}

		// Unicode Zs category (Space Separator) - check common ones
		// Full list: https://www.fileformat.info/info/unicode/category/Zs/list.htm
		if (
			code === 0x1680 || // Ogham space mark
			code === 0x2000 || // En quad
			code === 0x2001 || // Em quad
			code === 0x2002 || // En space
			code === 0x2003 || // Em space
			code === 0x2004 || // Three-per-em space
			code === 0x2005 || // Four-per-em space
			code === 0x2006 || // Six-per-em space
			code === 0x2007 || // Figure space
			code === 0x2008 || // Punctuation space
			code === 0x2009 || // Thin space
			code === 0x200a || // Hair space
			code === 0x202f || // Narrow no-break space
			code === 0x205f || // Medium mathematical space
			code === 0x3000 // Ideographic space
		) {
			return true;
		}

		return false;
	}

	/**
	 * Check if character is a digit (0-9)
	 */
	private isDigit(ch: string): boolean {
		return ch >= "0" && ch <= "9";
	}

	/**
	 * Check if character is a hex digit (0-9, a-f, A-F)
	 */
	private isHexDigit(ch: string): boolean {
		return this.isDigit(ch) || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
	}

	/**
	 * Check if character can start an identifier
	 */
	private isIdentifierStart(ch: string): boolean {
		return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || ch === "$";
	}

	/**
	 * Check if character can be part of an identifier
	 */
	private isIdentifierPart(ch: string): boolean {
		return this.isIdentifierStart(ch) || this.isDigit(ch);
	}

	/**
	 * Peek at current character without advancing
	 */
	private peek(): string {
		if (this.isAtEnd()) return "\0";
		return this.input[this.pos];
	}

	/**
	 * Peek at next character without advancing
	 */
	private peekNext(): string {
		if (this.pos + 1 >= this.input.length) return "\0";
		return this.input[this.pos + 1];
	}

	/**
	 * Peek ahead N characters without advancing
	 */
	private peekAhead(n: number): string {
		if (this.pos + n >= this.input.length) return "\0";
		return this.input[this.pos + n];
	}

	/**
	 * Advance position and return current character
	 */
	private advance(): string {
		const ch = this.input[this.pos];
		this.pos++;

		if (ch === "\n") {
			this.line++;
			this.column = 0;
		} else {
			this.column++;
		}

		return ch;
	}

	/**
	 * Check if at end of input
	 */
	private isAtEnd(): boolean {
		return this.pos >= this.input.length;
	}

	/**
	 * Get current position
	 */
	private getCurrentPosition(): Position {
		return {
			line: this.line,
			column: this.column,
			offset: this.pos
		};
	}

	/**
	 * Create a token
	 */
	private createToken(type: TokenType, value: string | number | bigint | boolean | null, raw: string): Token {
		const endPos = this.getCurrentPosition();
		const startPos: Position = {
			line: endPos.line,
			column: endPos.column - raw.length,
			offset: endPos.offset - raw.length
		};

		return {
			type,
			value,
			raw,
			loc: {
				start: startPos,
				end: endPos
			}
		};
	}

	/**
	 * Create a lexer error at current position
	 */
	private createError(message: string, code: string): LexerError {
		return new LexerError(
			message,
			{
				start: this.getCurrentPosition(),
				end: this.getCurrentPosition()
			},
			code
		);
	}
}
