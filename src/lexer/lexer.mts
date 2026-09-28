/**
 * Lexer/Tokenizer for @cldmv/jsonv
 *
 * Hand-written lexer that tokenizes JSON, JSON5, and jsonv input according to
 * the specified ES year's feature set.
 */

import type { Position } from "../ast-types.mjs";
import {
	TokenType,
	type Token,
	type LexerOptions,
	LexerError,
	getFeatureYear,
	resolveMode,
	FEATURE_NOT_ALLOWED_IN_MODE,
	MODE_LABELS
} from "./lexer-types.mjs";

/**
 * ECMAScript 5.1 IdentifierStart letters beyond ASCII (UnicodeLetter), as used
 * by JSON5 identifiers.
 */
const UNICODE_ID_START = /[\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}]/u;

/**
 * ECMAScript 5.1 IdentifierPart characters beyond ASCII: UnicodeLetter,
 * UnicodeCombiningMark, UnicodeDigit, UnicodeConnectorPunctuation, ZWNJ, ZWJ.
 */
const UNICODE_ID_PART = /[\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}\u200C\u200D]/u;

/**
 * Lexer class for tokenizing jsonv input
 *
 * Token-level mode rules live here: in `mode: "json"` and `mode: "json5"` the
 * lexer rejects the literal forms, escapes, whitespace and comments that the
 * mode does not allow. Structural rules (trailing commas, key forms,
 * references) are enforced by the parser.
 */
export class Lexer {
	private input: string;
	private pos: number = 0;
	private line: number = 1;
	private column: number = 0;
	private tokens: Token[] = [];
	private options: Required<LexerOptions>;
	/**
	 * One entry per open template interpolation (innermost last), counting the
	 * `{` opened inside that interpolation and not yet closed. A `}` ends the
	 * interpolation only when its entry is 0, i.e. it balances the `${`; any
	 * other `}` inside the interpolation is a plain RBRACE.
	 */
	private interpolationBraces: number[] = [];
	private tokenStart: Position = { line: 1, column: 0, offset: 0 }; // Start of the token currently being scanned
	private readonly jsonOnly: boolean; // mode === "json": RFC 8259 only
	private readonly restricted: boolean; // mode !== "jsonv": no jsonv extensions
	private allowUnescapedLineSeparators: boolean; // U+2028/U+2029 allowed unescaped in plain strings

	/**
	 * Create a new lexer instance
	 * @param input - Input string to tokenize
	 * @param options - Lexer configuration options
	 * @throws {TypeError} When `options.mode` is not `"jsonv"`, `"json5"` or `"json"`
	 */
	constructor(input: string, options: LexerOptions = {}) {
		this.input = input;
		const mode = resolveMode(options.mode);
		this.jsonOnly = mode === "json";
		this.restricted = mode !== "jsonv";

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
			mode
		};

		// U+2028 and U+2029 may appear unescaped in a plain string when the target
		// grammar allows them: RFC 8259 JSON and the JSON5 spec always do, and
		// ECMAScript does from ES2019 on (the JSON superset proposal). This uses the
		// requested year, not the feature year, because 2019 has no feature year of
		// its own (getFeatureYear(2019) is 2015).
		this.allowUnescapedLineSeparators = mode === "json" || mode === "json5" || targetYear >= 2019;
	}

	/**
	 * Tokenize the entire input and return array of tokens
	 * @returns Array of tokens
	 * @throws {LexerError} On the first lexical error
	 */
	public tokenize(): Token[] {
		return this.scan(null, false);
	}

	/**
	 * Tokenize the entire input, collecting lexical errors instead of throwing them.
	 *
	 * Without `recover`, lexing stops at the first error: the result holds the
	 * tokens lexed before it and an EOF token at the end of the input. With
	 * `recover`, the lexer skips the unreadable text and keeps going (see
	 * {@link Lexer.resync}); the unreadable text (other than a comment) is
	 * replaced by one `Unknown` token spanning it so the parser can hold its
	 * place without reporting a second error.
	 *
	 * @internal Used by `parseToAst`; `tokenize()` is the public entry point.
	 * @param recover - Keep lexing after an error instead of stopping
	 * @returns The tokens (ending with EOF) and the collected errors in source order
	 */
	public tokenizeCollectingErrors(recover: boolean): { tokens: Token[]; errors: LexerError[] } {
		const errors: LexerError[] = [];
		const tokens = this.scan(errors, recover);
		return { tokens, errors };
	}

	/**
	 * Shared tokenize loop.
	 * @param errors - Sink for lexical errors, or `null` to throw them
	 * @param recover - With a sink, keep lexing after an error instead of stopping
	 */
	private scan(errors: LexerError[] | null, recover: boolean): Token[] {
		this.tokens = [];
		this.pos = 0;
		this.line = 1;
		this.column = 0;
		this.interpolationBraces = [];

		while (!this.isAtEnd()) {
			try {
				this.skipWhitespace();
			} catch (err) {
				// `json` mode rejects whitespace outside RFC 8259's set; collect it
				// like any other lexical error, then skip the offending character.
				if (errors === null || !(err instanceof LexerError)) {
					throw err;
				}
				errors.push(err);
				if (!recover) {
					while (!this.isAtEnd()) this.advance();
					break;
				}
				this.advance();
				continue;
			}
			if (this.isAtEnd()) break;

			let token: Token | null;
			try {
				token = this.nextToken();
			} catch (err) {
				if (errors === null || !(err instanceof LexerError)) {
					throw err;
				}
				errors.push(err);
				if (!recover) {
					// Stop at the first error; the EOF token still sits at the end of the input.
					while (!this.isAtEnd()) this.advance();
					break;
				}
				token = this.resync();
			}
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

		// Add EOF token (zero-width, at the end of the input)
		this.tokenStart = this.getCurrentPosition();
		this.tokens.push(this.createToken(TokenType.EOF, null, ""));

		return this.tokens;
	}

	/**
	 * Skip past the text that caused a lexical error so lexing can continue.
	 *
	 * The skip depends on the character the failed token started with:
	 * - a quote: the rest of the string, through its closing quote or up to the end of the line;
	 * - a backtick, or the `}` resuming a template: the rest of the template, through its closing backtick;
	 * - `//` or `/*`: the whole comment;
	 * - a digit, sign, `.` or identifier character: the rest of the number or identifier;
	 * - anything else: the offending character alone.
	 *
	 * Skipped text other than a comment yields an `Unknown` token spanning it,
	 * so the parser can keep a value's place without reporting a second error;
	 * a skipped comment yields no token.
	 *
	 * @returns The `Unknown` token for the skipped text, or `null` for a comment
	 */
	private resync(): Token | null {
		const start = this.tokenStart;
		const first = this.input[start.offset];
		const openBraces = this.interpolationBraces;
		const inTemplate = first === "`" || (first === "}" && openBraces.length > 0 && openBraces[openBraces.length - 1] === 0);

		if (first === '"' || first === "'" || inTemplate) {
			// Rescan from the token start: the error may have stopped mid-escape.
			this.rewind(start);
			const close = inTemplate ? "`" : first;
			this.advance(); // the opening quote, backtick or }
			while (!this.isAtEnd()) {
				const ch = this.peek();
				if (!inTemplate && this.isLineTerminator(ch)) break;
				this.advance();
				if (ch === "\\") {
					if (!this.isAtEnd()) this.advance();
				} else if (ch === close) {
					break;
				}
			}
			if (first === "}") this.interpolationBraces.pop(); // the skipped segment closed the template
			return this.createToken(TokenType.UNKNOWN, null, this.input.slice(start.offset, this.pos));
		}

		if (first === "/" && (this.input[start.offset + 1] === "/" || this.input[start.offset + 1] === "*")) {
			this.rewind(start);
			const block = this.input[start.offset + 1] === "*";
			this.advance(); // /
			this.advance(); // / or *
			while (!this.isAtEnd()) {
				if (!block && this.isLineTerminator(this.peek())) break;
				if (block && this.peek() === "*" && this.peekNext() === "/") {
					this.advance();
					this.advance();
					break;
				}
				this.advance();
			}
			return null;
		}

		if (this.isIdentifierPart(first) || first === "." || first === "+" || first === "-") {
			if (this.pos === start.offset) this.advance();
			while (!this.isAtEnd() && (this.isIdentifierPart(this.peek()) || this.peek() === ".")) {
				this.advance();
			}
			return this.createToken(TokenType.UNKNOWN, null, this.input.slice(start.offset, this.pos));
		}

		// Skip the offending character alone, keeping a surrogate pair together.
		this.rewind(start);
		const code = this.input.charCodeAt(this.pos);
		this.advance();
		const next = this.input.charCodeAt(this.pos);
		if (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) this.advance();
		return this.createToken(TokenType.UNKNOWN, null, this.input.slice(start.offset, this.pos));
	}

	/**
	 * Move the scan position back to an earlier position.
	 * @param to - Position to resume scanning from
	 */
	private rewind(to: Position): void {
		this.pos = to.offset;
		this.line = to.line;
		this.column = to.column;
	}

	/**
	 * Get the next token from input
	 * @returns Next token or null if at end
	 */
	private nextToken(): Token | null {
		if (this.isAtEnd()) return null;

		// Record where this token starts so createToken() can position tokens
		// that span lines (strings with line continuations) correctly.
		this.tokenStart = this.getCurrentPosition();

		const ch = this.peek();

		// Comments
		if (ch === "/" && this.peekNext() === "/") {
			if (this.jsonOnly) {
				throw this.modeError("Comments");
			}
			return this.scanLineComment();
		}
		if (ch === "/" && this.peekNext() === "*") {
			if (this.jsonOnly) {
				throw this.modeError("Comments");
			}
			return this.scanBlockComment();
		}

		// Strings
		if (ch === '"') {
			return this.scanString('"');
		}
		if (ch === "'") {
			if (this.jsonOnly) {
				throw this.modeError("Single-quoted strings");
			}
			return this.scanString("'");
		}

		// Template literals (ES2015+)
		if (ch === "`") {
			if (this.restricted) {
				throw this.modeError("Template literals");
			}
			if (this.options.allowTemplateLiterals) {
				return this.scanTemplateLiteral();
			}
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
				return this.scanSignedKeyword("-");
			}
		}

		// Plus sign (JSON5 allows +5, +.5, +Infinity and +NaN)
		if (ch === "+") {
			const next = this.peekNext();
			const startsNumber = this.isDigit(next) || (next === "." && this.isDigit(this.peekAhead(2)));
			if (startsNumber || next === "I" || next === "N") {
				if (this.jsonOnly) {
					throw this.modeError("Leading '+' sign");
				}
				return startsNumber ? this.scanNumber() : this.scanSignedKeyword("+");
			}
		}

		// Punctuation
		if (ch === "{") {
			const depth = this.interpolationBraces.length;
			if (depth > 0) {
				this.interpolationBraces[depth - 1]++; // a brace nested inside the interpolation
			}
			return this.createToken(TokenType.LBRACE, "{", this.advance());
		}
		if (ch === "}") {
			const depth = this.interpolationBraces.length;
			if (depth > 0) {
				// The } that balances the `${` closes the interpolation. Continue
				// scanning the template instead of returning RBRACE: the closing }
				// is the first character of the TemplateMiddle/TemplateTail.
				if (this.interpolationBraces[depth - 1] === 0) {
					return this.scanTemplateMiddleOrTail();
				}
				this.interpolationBraces[depth - 1]--; // closes a brace nested inside the interpolation
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

		// Identifiers starting with a \uXXXX escape or a non-ASCII letter (JSON5 IdentifierName)
		if (ch === "\\" || (ch >= "\u0080" && UNICODE_ID_START.test(this.peekCodePoint()))) {
			return this.scanIdentifierOrKeyword();
		}

		// Unknown character
		throw this.createError(`Unexpected character: '${ch}'`, "UNEXPECTED_CHARACTER");
	}

	/**
	 * Scan a signed `Infinity` or `NaN` (`-Infinity`, `+NaN`, ...) as a NUMBER token.
	 * Called with the lexer positioned on the sign.
	 */
	private scanSignedKeyword(sign: "-" | "+"): Token {
		this.advance(); // sign
		const keyword = this.scanIdentifierOrKeyword();
		if (keyword.type !== TokenType.INFINITY && keyword.type !== TokenType.NAN) {
			throw this.createError(`Unexpected identifier after ${sign === "-" ? "minus" : "plus"}: ${keyword.value}`, "UNEXPECTED_TOKEN");
		}
		if (this.jsonOnly) {
			throw this.modeError(keyword.raw);
		}
		const value = keyword.type === TokenType.NAN ? NaN : sign === "-" ? -Infinity : Infinity;
		return this.createToken(TokenType.NUMBER, value, sign + keyword.raw);
	}

	/**
	 * Scan a line comment (// ...)
	 */
	private scanLineComment(): Token {
		const start = this.pos;
		this.advance(); // /
		this.advance(); // /

		let value = "";
		while (!this.isAtEnd() && !this.isLineTerminator(this.peek())) {
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
		return this.createToken(TokenType.BLOCK_COMMENT, value, raw, { line: startLine, column: startCol, offset: start });
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
		let escapeStart: Position | undefined; // Position of the current backslash (json/json5 modes only)

		while (!this.isAtEnd()) {
			const ch = this.peek();

			if (escaped) {
				if (this.restricted) {
					this.checkEscapeForMode(escapeStart!);
				}
				// Handle escape sequences
				value += this.parseEscapeSequence();
				escaped = false;
				continue;
			}

			if (ch === "\\") {
				if (this.restricted) {
					escapeStart = this.getCurrentPosition();
				}
				escaped = true;
				this.advance();
				continue;
			}

			if (ch === quote) {
				this.advance(); // closing quote
				foundClosingQuote = true;
				break;
			}

			// An unescaped line terminator ends the line before the string is closed,
			// as in ECMAScript, JSON5 and JSON. The error points at the terminator
			// (the CR of a CRLF pair). U+2028 and U+2029 are allowed where the target
			// grammar allows them; see the constructor. A backslash followed by a line
			// terminator is a line continuation and is handled by parseEscapeSequence.
			if (this.isLineTerminator(ch) && !(this.allowUnescapedLineSeparators && (ch === "\u2028" || ch === "\u2029"))) {
				throw this.createError("Unterminated string", "UNTERMINATED_STRING");
			}

			if (this.jsonOnly) {
				this.checkJsonStringChar(ch);
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
	 * Reject an unescaped control character (U+0000-U+001F) in a string in `json`
	 * mode, where RFC 8259 requires them to be escaped. Called on the character
	 * about to be consumed. (Raw LF and CR are rejected in every mode as an
	 * unterminated string before this runs.)
	 */
	private checkJsonStringChar(ch: string): void {
		if (ch.charCodeAt(0) < 0x20) {
			throw this.modeError(`Unescaped control character ${this.describeChar(ch)} in strings`, this.getCurrentPosition());
		}
	}

	/**
	 * Reject an escape sequence that the mode does not allow.
	 * Called in `json` and `json5` modes only, with the lexer positioned on the
	 * character after the backslash.
	 *
	 * - JSON (RFC 8259) allows only `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t` and `\uXXXX`.
	 * - JSON5 (ECMAScript 5.1 escapes) disallows `\1`-`\9` and `\0` followed by a digit.
	 *
	 * @param start - Position of the backslash
	 */
	private checkEscapeForMode(start: Position): void {
		const ch = this.peek();
		if (this.jsonOnly) {
			if ('"\\/bfnrtu'.includes(ch)) {
				return;
			}
			if (this.isLineTerminator(ch)) {
				throw this.modeError("Line continuations", start);
			}
			throw this.modeError(`Escape sequence '\\${this.describeChar(ch)}'`, start);
		}
		if ((ch >= "1" && ch <= "9") || (ch === "0" && this.isDigit(this.peekNext()))) {
			throw this.modeError(`Escape sequence '\\${ch}${ch === "0" ? this.peekNext() : ""}'`, start);
		}
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
			case "\u2028":
			case "\u2029":
				// Line continuation: U+2028 and U+2029 are line terminators too
				return "";
			default:
				// JSON5: invalid escape is just the character
				return ch;
		}
	}

	/**
	 * Consume one template character and return its cooked text. A CRLF pair or a
	 * lone CR is a single line terminator whose template value is LF (ECMAScript
	 * TV of a LineTerminatorSequence); every other character is itself.
	 */
	private advanceTemplateCharacter(): string {
		const ch = this.advance();
		if (ch === "\r") {
			if (this.peek() === "\n") this.advance();
			return "\n";
		}
		return ch;
	}

	/**
	 * Raw text of a template token: the source slice from `start` to `end` with
	 * each CRLF pair and lone CR replaced by LF, as in the ECMAScript TRV. Escaped
	 * `\r` (backslash, `r`) is two ordinary characters and is left alone.
	 */
	private templateRaw(start: number, end: number): string {
		return this.input.slice(start, end).replace(/\r\n?/g, "\n");
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
	 * Scan a template literal (no interpolation) or a template head.
	 *
	 * Template tokens carry their delimiters, so the tokens of a template tile its
	 * source with no gaps:
	 * - `TemplateLiteral`: `` `text` `` (both backticks)
	 * - `TemplateHead`: `` `text${ `` (the opening backtick through the `${`)
	 *
	 * `raw` and `loc` cover the delimiters; `value` is the cooked text without them.
	 * As in ECMAScript, a CR or CRLF line terminator becomes LF in both `value`
	 * and `raw`; `loc` still describes the original source.
	 */
	private scanTemplateLiteral(): Token {
		const start = this.pos;
		const startLine = this.line;
		const startCol = this.column;
		this.advance(); // opening backtick

		let value = "";

		while (!this.isAtEnd()) {
			const ch = this.peek();

			// Check for interpolation start
			if (ch === "$" && this.peekNext() === "{") {
				const raw = this.templateRaw(start, this.pos + 2); // Include ${
				this.advance(); // $
				this.advance(); // {
				this.interpolationBraces.push(0); // Enter template interpolation mode
				return this.createToken(TokenType.TEMPLATE_HEAD, value, raw, { line: startLine, column: startCol, offset: start });
			}

			// Check for closing backtick
			if (ch === "`") {
				this.advance(); // closing backtick
				const raw = this.templateRaw(start, this.pos);
				return this.createToken(TokenType.TEMPLATE_LITERAL, value, raw, { line: startLine, column: startCol, offset: start });
			}

			// Handle escape sequences
			if (ch === "\\") {
				this.advance(); // backslash
				if (!this.isAtEnd()) {
					value += this.parseEscapeSequence();
				}
				continue;
			}

			// Regular character (a CR or CRLF line terminator cooks to LF)
			value += this.advanceTemplateCharacter();
		}

		throw this.createError("Unterminated template literal", "UNTERMINATED_TEMPLATE");
	}

	/**
	 * Continue scanning a template after an interpolation expression.
	 * Called with the lexer positioned on the `}` that closes the interpolation.
	 *
	 * The token starts at that `}`, so no character of the template falls between
	 * tokens:
	 * - `TemplateMiddle`: `}text${` (the closing `}` through the next `${`)
	 * - `TemplateTail`: `` }text` `` (the closing `}` through the closing backtick)
	 *
	 * `raw` and `loc` cover the delimiters; `value` is the cooked text without them.
	 * As in ECMAScript, a CR or CRLF line terminator becomes LF in both `value`
	 * and `raw`; `loc` still describes the original source.
	 */
	private scanTemplateMiddleOrTail(): Token {
		const start = this.pos;
		const startLine = this.line;
		const startCol = this.column;
		this.advance(); // the } that closes the interpolation
		let value = "";

		while (!this.isAtEnd()) {
			const ch = this.peek();

			// Check for another interpolation
			if (ch === "$" && this.peekNext() === "{") {
				const raw = this.templateRaw(start, this.pos + 2); // Include ${
				this.advance(); // $
				this.advance(); // {
				return this.createToken(TokenType.TEMPLATE_MIDDLE, value, raw, { line: startLine, column: startCol, offset: start });
			}

			// Check for closing backtick
			if (ch === "`") {
				this.advance(); // closing backtick
				const raw = this.templateRaw(start, this.pos);
				this.interpolationBraces.pop(); // Exit template interpolation mode
				return this.createToken(TokenType.TEMPLATE_TAIL, value, raw, { line: startLine, column: startCol, offset: start });
			}

			// Handle escape sequences
			if (ch === "\\") {
				this.advance(); // backslash
				if (!this.isAtEnd()) {
					value += this.parseEscapeSequence();
				}
				continue;
			}

			// Regular character (a CR or CRLF line terminator cooks to LF)
			value += this.advanceTemplateCharacter();
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
				if (this.jsonOnly) {
					throw this.modeError("Hexadecimal literals");
				}
				if (!this.options.allowHexLiterals) {
					throw this.createError("Hexadecimal literals not allowed in this year", "INVALID_LITERAL");
				}
				this.advance(); // 0
				this.advance(); // x

				return this.scanHexNumber(start, isNegative);
			}

			// Binary (0b or 0B)
			if (next === "b" || next === "B") {
				if (this.restricted) {
					throw this.modeError("Binary literals");
				}
				if (!this.options.allowBinaryOctalLiterals) {
					throw this.createError("Binary literals not allowed in this year", "INVALID_LITERAL");
				}
				this.advance(); // 0
				this.advance(); // b

				return this.scanBinaryNumber(start, isNegative);
			}

			// Octal (0o or 0O)
			if (next === "o" || next === "O") {
				if (this.restricted) {
					throw this.modeError("Octal literals");
				}
				if (!this.options.allowBinaryOctalLiterals) {
					throw this.createError("Octal literals not allowed in this year", "INVALID_LITERAL");
				}
				this.advance(); // 0
				this.advance(); // o

				return this.scanOctalNumber(start, isNegative);
			}

			// Legacy octal (0755)
			if (this.isDigit(next)) {
				if (this.restricted) {
					throw this.modeError("Leading zeros (legacy octal literals)");
				}
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
				if (this.restricted) {
					throw this.modeError("Numeric separators", this.getCurrentPosition());
				}
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
			if (this.restricted) {
				throw this.modeError("BigInt literals", this.getCurrentPosition());
			}
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
				if (this.restricted) {
					throw this.modeError("Numeric separators", this.getCurrentPosition());
				}
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
			if (this.jsonOnly && !hasDigits) {
				throw this.modeError("Leading decimal point", this.getCurrentPosition());
			}
			const dotOffset = this.pos;
			hasDecimalPoint = true;
			numStr += this.advance();

			// Fractional part
			let hasFractionDigits = false;
			while (!this.isAtEnd()) {
				const ch = this.peek();

				if (this.isDigit(ch)) {
					numStr += this.advance();
					hasDigits = true;
					hasFractionDigits = true;
				} else if (ch === "_") {
					if (this.restricted) {
						throw this.modeError("Numeric separators", this.getCurrentPosition());
					}
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

			if (this.jsonOnly && !hasFractionDigits) {
				throw this.modeError("Trailing decimal point", this.positionOnLine(dotOffset));
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
					if (this.restricted) {
						throw this.modeError("Numeric separators", this.getCurrentPosition());
					}
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
			if (this.restricted) {
				throw this.modeError("BigInt literals", this.getCurrentPosition());
			}
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
		let hasEscape = false;

		// Read identifier characters (ASCII fast path; Unicode letters and \uXXXX
		// escapes per the ECMAScript 5.1 IdentifierName grammar used by JSON5)
		while (!this.isAtEnd()) {
			const ch = this.peek();
			if (this.isIdentifierPart(ch)) {
				value += this.advance();
			} else if (ch === "\\") {
				value += this.scanIdentifierEscape(value.length === 0);
				hasEscape = true;
			} else if (ch >= "\u0080" && UNICODE_ID_PART.test(this.peekCodePoint())) {
				const cp = this.peekCodePoint();
				value += this.advance();
				if (cp.length === 2) value += this.advance();
			} else {
				break;
			}
		}

		const raw = this.input.slice(start, this.pos);

		// An identifier spelled with a \uXXXX escape is never a keyword: an escaped `true` is a name
		if (hasEscape) {
			return this.createToken(TokenType.IDENTIFIER, value, raw);
		}

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
	 * Scan a `\uXXXX` escape inside an identifier and return the character it
	 * encodes. The character must itself be a valid identifier start (for the
	 * first character) or identifier part.
	 */
	private scanIdentifierEscape(isFirst: boolean): string {
		const start = this.getCurrentPosition();
		this.advance(); // backslash
		if (this.peek() !== "u") {
			throw new LexerError(
				"Invalid escape in identifier (expected \\uXXXX)",
				{ start, end: this.getCurrentPosition() },
				"INVALID_IDENTIFIER_ESCAPE"
			);
		}
		this.advance(); // u
		const ch = this.parseUnicodeEscape(4);
		const valid = isFirst
			? this.isIdentifierStart(ch) || (ch >= "\u0080" && UNICODE_ID_START.test(ch))
			: this.isIdentifierPart(ch) || (ch >= "\u0080" && UNICODE_ID_PART.test(ch));
		if (!valid) {
			throw new LexerError(
				`Escaped character ${this.describeChar(ch)} is not valid in an identifier`,
				{ start, end: this.getCurrentPosition() },
				"INVALID_IDENTIFIER_ESCAPE"
			);
		}
		return ch;
	}

	/**
	 * Skip whitespace characters
	 */
	private skipWhitespace(): void {
		while (!this.isAtEnd() && this.isWhitespace(this.peek())) {
			if (this.jsonOnly) {
				this.checkJsonWhitespace(this.peek());
			}
			this.advance();
		}
	}

	/**
	 * Reject whitespace outside RFC 8259's set (space, tab, LF, CR) in `json` mode.
	 */
	private checkJsonWhitespace(ch: string): void {
		if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") {
			throw this.modeError(`Whitespace character ${this.describeChar(ch)}`, this.getCurrentPosition());
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
	 * Peek at the full code point (one or two UTF-16 code units) at the current position
	 */
	private peekCodePoint(): string {
		return String.fromCodePoint(this.input.codePointAt(this.pos)!);
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

		// \n, lone \r, U+2028 and U+2029 each end a line; the \r of a \r\n pair
		// is an ordinary column so the pair counts as a single line break.
		if (this.isLineTerminator(ch) && !(ch === "\r" && this.input[this.pos] === "\n")) {
			this.line++;
			this.column = 0;
		} else {
			this.column++;
		}

		return ch;
	}

	/**
	 * Check if character is an ECMAScript line terminator (LF, CR, U+2028, U+2029)
	 */
	private isLineTerminator(ch: string): boolean {
		return ch === "\n" || ch === "\r" || ch === "\u2028" || ch === "\u2029";
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
	private createToken(type: TokenType, value: string | number | bigint | boolean | null, raw: string, startOverride?: Position): Token {
		const endPos = this.getCurrentPosition();
		const startPos: Position = startOverride ?? this.tokenStart;

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
	 * Create the error for a feature the current mode does not allow, e.g.
	 * "Trailing decimal point not allowed in JSON mode", with code
	 * `FEATURE_NOT_ALLOWED_IN_MODE`.
	 *
	 * @param feature - Name of the rejected feature, used as the message subject
	 * @param start - Where the feature starts (default: start of the current token)
	 */
	private modeError(feature: string, start: Position = this.tokenStart): LexerError {
		return new LexerError(
			`${feature} not allowed in ${MODE_LABELS[this.options.mode]} mode`,
			{ start, end: this.getCurrentPosition() },
			FEATURE_NOT_ALLOWED_IN_MODE
		);
	}

	/**
	 * Position of an earlier offset on the current line (used inside a single-line token)
	 */
	private positionOnLine(offset: number): Position {
		return { line: this.line, column: this.column - (this.pos - offset), offset };
	}

	/**
	 * Printable form of a character for error messages: itself when printable
	 * ASCII, otherwise its code point as `U+XXXX`.
	 */
	private describeChar(ch: string): string {
		const code = ch.codePointAt(0)!;
		if (code >= 0x21 && code <= 0x7e) {
			return ch;
		}
		return "U+" + code.toString(16).toUpperCase().padStart(4, "0");
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
