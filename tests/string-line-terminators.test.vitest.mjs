/**
 *
 *	@Project: @cldmv/jsonv
 *	@Filename: /tests/string-line-terminators.test.vitest.mjs
 *	@Date: 2026-09-28T19:25:58+00:00 (1790623558)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T12:20:39-07:00 (1790968839)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Tests for GitHub issue #60: line terminators inside plain (single- and
 * double-quoted) strings follow ECMAScript, JSON5 and JSON.
 *
 * - An unescaped LF, CR or CRLF is a positioned "Unterminated string" error in
 *   every year and mode; the error points at the terminator (the CR of a CRLF).
 * - U+2028 and U+2029 are allowed unescaped in `jsonv` mode from year 2019 on
 *   (the ES2019 JSON superset) and rejected before it. `json5` mode follows the
 *   JSON5 spec and `json` mode follows RFC 8259; both allow them in every year.
 * - A backslash followed by LF, CR, CRLF, U+2028 or U+2029 is a line continuation
 *   and contributes nothing to the value.
 *
 * Wherever the running engine implements the rule being tested, the expected
 * accept/reject decision and value come from Node: `new Function` for
 * ECMAScript (ES2019+ grammar) and `JSON.parse` for RFC 8259. Node cannot parse
 * as a pre-2019 engine, so the pre-2019 U+2028/U+2029 rejections are checked
 * against the ES2018 grammar (where both are LineTerminators, which a string
 * literal cannot contain) rather than against the engine.
 */

import { describe, test, expect } from "vitest";
import JSONV, { parseWithOptions, parseToAst, stringify, stringifyWithOptions, JsonvSyntaxError } from "../src/index.mjs";
import { TokenType } from "../src/parser.mjs";
import { Lexer } from "../src/lexer/lexer.mjs";
import { LexerError } from "../src/lexer/lexer-types.mjs";
import * as api2011 from "../src/years/2011.mjs";
import * as api2015 from "../src/years/2015.mjs";
import * as api2020 from "../src/years/2020.mjs";
import * as api2021 from "../src/years/2021.mjs";

/** LF, CR and CRLF: never allowed unescaped in a plain string. */
const HARD_TERMINATORS = { LF: "\n", CR: "\r", CRLF: "\r\n" };

/** U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR. */
const SEPARATORS = { LS: "\u2028", PS: "\u2029" };

const ALL_TERMINATORS = { ...HARD_TERMINATORS, ...SEPARATORS };

/** Years around the ES2019 boundary, the feature years, and the default (current year). */
const YEARS = [2011, 2015, 2018, 2019, 2020, 2021, 2025, undefined];

const QUOTES = { double: '"', single: "'" };

/** Build the parse options for a year/mode pair, leaving `year` unset for the default. */
const optionsFor = (year, mode) => (year === undefined ? { mode } : { year, mode });

/**
 * Evaluate a source text as an ECMAScript expression in Node.
 * @returns {{ ok: true, value: unknown } | { ok: false }}
 */
function ecmascript(source) {
	try {
		return { ok: true, value: new Function(`return ${source};`)() };
	} catch (err) {
		expect(err).toBeInstanceOf(SyntaxError);
		return { ok: false };
	}
}

/**
 * Parse a source text as RFC 8259 JSON with Node's `JSON.parse`.
 * @returns {{ ok: true, value: unknown } | { ok: false }}
 */
function rfc8259(source) {
	try {
		return { ok: true, value: JSON.parse(source) };
	} catch (err) {
		expect(err).toBeInstanceOf(SyntaxError);
		return { ok: false };
	}
}

/**
 * Parse with jsonv.
 * @returns {{ ok: true, value: unknown } | { ok: false, error: Error }}
 */
function jsonv(source, options) {
	try {
		return { ok: true, value: parseWithOptions(source, options) };
	} catch (error) {
		return { ok: false, error };
	}
}

/** Line and column (0-based) of an offset, counting \n, \r\n, lone \r, U+2028 and U+2029 as one break each. */
function positionAt(text, offset) {
	let line = 1;
	let column = 0;
	for (let i = 0; i < offset; i++) {
		const ch = text[i];
		if (ch === "\r" && text[i + 1] === "\n") {
			column++;
		} else if (ch === "\n" || ch === "\r" || ch === "\u2028" || ch === "\u2029") {
			line++;
			column = 0;
		} else {
			column++;
		}
	}
	return { line, column, offset };
}

/** Assert that parsing `text` fails with a positioned "Unterminated string" at `offset`. */
function expectUnterminatedAt(text, options, offset) {
	const result = jsonv(text, options);
	expect(result.ok).toBe(false);
	const err = result.error;
	expect(err).toBeInstanceOf(JsonvSyntaxError);
	expect(err).toBeInstanceOf(LexerError);
	expect(err.message).toContain("Unterminated string");
	expect(err.code).toBe("UNTERMINATED_STRING");
	const expected = positionAt(text, offset);
	expect({ line: err.line, column: err.column, offset: err.offset }).toEqual(expected);
	expect(err.loc.start).toEqual(expected);
}

describe("plain-string line terminators (issue #60)", () => {
	test("the issue #60 reproduction: a raw CR in a string is rejected at the CR", () => {
		const text = '{ s: "a\rb" }';
		expect(ecmascript(`(${text})`).ok).toBe(false);
		expectUnterminatedAt(text, {}, text.indexOf("\r"));
	});

	describe("unescaped LF, CR and CRLF are rejected in every year and mode", () => {
		for (const [name, lt] of Object.entries(HARD_TERMINATORS)) {
			for (const [quoteName, q] of Object.entries(QUOTES)) {
				for (const mode of ["jsonv", "json5", "json"]) {
					// JSON has no single-quoted strings, so that combination is a different error.
					if (mode === "json" && q === "'") continue;

					test.each(YEARS)(`${name} in a ${quoteName}-quoted string, ${mode} mode, year %s`, (year) => {
						const source = `${q}a${lt}b${q}`;
						// The engine agrees the string is invalid.
						expect(ecmascript(source).ok).toBe(false);
						if (mode === "json") expect(rfc8259(source).ok).toBe(false);

						expectUnterminatedAt(source, optionsFor(year, mode), 2);
					});
				}
			}
		}
	});

	describe("the error points at the terminator inside a multi-line document", () => {
		for (const [docName, docLt] of Object.entries(HARD_TERMINATORS)) {
			for (const [name, lt] of Object.entries(HARD_TERMINATORS)) {
				test(`${name} in a string of a ${docName} document`, () => {
					const text = `{${docLt}  a: 1,${docLt}  s: "xy${lt}z",${docLt}}`;
					expect(ecmascript(`(${text})`).ok).toBe(false);
					const offset = text.indexOf(`y${lt}`) + 1;
					expectUnterminatedAt(text, { year: 2021 }, offset);
					expect(jsonv(text, { year: 2021 }).error.line).toBe(3);
				});
			}
		}

		test("a CRLF is reported at its CR, not at the LF", () => {
			const text = "'ab\r\ncd'";
			const { error } = jsonv(text, {});
			expect(error.offset).toBe(3);
			expect(text[error.offset]).toBe("\r");
			expect(error.line).toBe(1);
			expect(error.column).toBe(3);
		});

		test("a string after a valid multi-line template still reports the right line", () => {
			const text = "{ t: `x\r\ny`,\r\n  s: 'p\rq' }";
			expectUnterminatedAt(text, { year: 2015 }, text.indexOf("p\r") + 1);
			expect(jsonv(text, { year: 2015 }).error.line).toBe(3);
		});
	});

	describe("U+2028 and U+2029 by year and mode", () => {
		for (const [name, sep] of Object.entries(SEPARATORS)) {
			for (const [quoteName, q] of Object.entries(QUOTES)) {
				const source = `${q}a${sep}b${q}`;

				describe(`${name} in a ${quoteName}-quoted string`, () => {
					test.each(YEARS)("jsonv mode, year %s: allowed from 2019 on", (year) => {
						const result = jsonv(source, optionsFor(year, "jsonv"));
						if (year !== undefined && year < 2019) {
							// ES2018 and earlier: U+2028/U+2029 are LineTerminators, which a
							// string literal cannot contain.
							expect(result.ok).toBe(false);
							expectUnterminatedAt(source, optionsFor(year, "jsonv"), 2);
						} else {
							// ES2019+: the running engine implements this grammar.
							const engine = ecmascript(source);
							expect(engine.ok).toBe(true);
							expect(result).toEqual({ ok: true, value: engine.value });
						}
					});

					test.each(YEARS)("json5 mode, year %s: allowed (JSON5 spec)", (year) => {
						expect(jsonv(source, optionsFor(year, "json5"))).toEqual({ ok: true, value: `a${sep}b` });
					});

					if (q === '"') {
						test.each(YEARS)("json mode, year %s: allowed (RFC 8259, as JSON.parse)", (year) => {
							const engine = rfc8259(source);
							expect(engine.ok).toBe(true);
							expect(jsonv(source, optionsFor(year, "json"))).toEqual({ ok: true, value: engine.value });
						});
					}
				});
			}
		}

		test("the year module APIs follow the same rule", () => {
			const source = '{ s: "a\u2028b\u2029c" }';
			// The 2011 module parses as jsonv at year 2011 (ES5 rules), which rejects
			// them; json5 mode, where the JSON5 spec allows them, is one option away.
			expect(() => api2011.parse(source)).toThrow(JsonvSyntaxError);
			expect(api2011.parse(source, { mode: "json5" })).toEqual({ s: "a\u2028b\u2029c" });
			expect(() => api2011.parseWithOptions(source, { mode: "jsonv" })).toThrow(JsonvSyntaxError);
			expect(() => api2015.parse(source)).toThrow(JsonvSyntaxError);
			expect(api2020.parse(source)).toEqual({ s: "a\u2028b\u2029c" });
			expect(api2021.parse(source)).toEqual({ s: "a\u2028b\u2029c" });
			expect(JSONV.parse(source)).toEqual({ s: "a\u2028b\u2029c" });
			expect(api2015.parseWithOptions(source, { mode: "json5" })).toEqual({ s: "a\u2028b\u2029c" });
		});

		test("a separator in a string still counts as a line break for later positions", () => {
			const text = '{ s: "a\u2028b",\n  t: }';
			try {
				parseWithOptions(text, { year: 2021 });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(JsonvSyntaxError);
				expect({ line: err.line, column: err.column }).toEqual({ line: 3, column: 5 });
			}
		});

		test("the string token keeps the separator in value and raw", () => {
			const source = "'a\u2028b\u2029c'";
			const [token] = parseToAst(source, { year: 2019 }).tokens;
			expect(token.type).toBe(TokenType.STRING);
			expect(token.value).toBe("a\u2028b\u2029c");
			expect(token.raw).toBe(source);
			expect(token.loc.end).toEqual(positionAt(source, source.length));
		});
	});

	describe("line continuations stay valid with every terminator", () => {
		for (const [name, lt] of Object.entries(ALL_TERMINATORS)) {
			for (const [quoteName, q] of Object.entries(QUOTES)) {
				const source = `${q}a\\${lt}b${q}`;

				for (const mode of ["jsonv", "json5"]) {
					test.each(YEARS)(`backslash + ${name} in a ${quoteName}-quoted string, ${mode} mode, year %s`, (year) => {
						const engine = ecmascript(source);
						expect(engine).toEqual({ ok: true, value: "ab" });
						expect(jsonv(source, optionsFor(year, mode))).toEqual({ ok: true, value: engine.value });
					});
				}

				test(`backslash + ${name} in a ${quoteName}-quoted string: token raw and positions`, () => {
					const text = `[${source}, 1]`;
					const { tokens } = parseToAst(text, { year: 2021 });
					const str = tokens.find((t) => t.type === TokenType.STRING);
					expect(str.value).toBe("ab");
					expect(str.raw).toBe(source);
					expect(str.loc.start).toEqual(positionAt(text, 1));
					expect(str.loc.end).toEqual(positionAt(text, 1 + source.length));
					const one = tokens.find((t) => t.type === TokenType.NUMBER);
					expect(one.loc.start).toEqual(positionAt(text, text.indexOf("1]")));
					expect(one.loc.start.line).toBe(2);
				});
			}
		}

		test("several continuations and an escaped CR/LF in one string match the engine", () => {
			const source = "'one\\\r\ntwo\\\rthree\\\nfour\\\u2028five\\\u2029six\\r\\n'";
			const engine = ecmascript(source);
			expect(engine.ok).toBe(true);
			expect(parseWithOptions(source, { year: 2011 })).toBe(engine.value);
			expect(parseWithOptions(source)).toBe("onetwothreefourfivesix\r\n");
		});
	});

	describe("direct Lexer usage", () => {
		test("tokenize() throws a LexerError at a raw CR", () => {
			const lexer = new Lexer('"a\rb"', { year: 2015 });
			try {
				lexer.tokenize();
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(LexerError);
				expect(err.code).toBe("UNTERMINATED_STRING");
				expect(err.loc.start).toEqual({ line: 1, column: 2, offset: 2 });
			}
		});

		test("the lexer applies the ES2019 rule to the year it is given", () => {
			expect(() => new Lexer('"a\u2028b"', { year: 2018 }).tokenize()).toThrow("Unterminated string");
			expect(new Lexer('"a\u2028b"', { year: 2019 }).tokenize()[0].value).toBe("a\u2028b");
			expect(new Lexer('"a\u2028b"', { year: 2018, mode: "json5" }).tokenize()[0].value).toBe("a\u2028b");
			expect(new Lexer('"a\u2028b"').tokenize()[0].value).toBe("a\u2028b");
		});
	});

	describe("stringify escapes U+2028 and U+2029", () => {
		const value = { s: "a\u2028b\u2029c" };

		test.each(["jsonv", "json5", "json"])("%s output escapes them and round-trips under every year", (mode) => {
			const text = stringifyWithOptions(value, { mode });
			expect(text).not.toMatch(/[\u2028\u2029]/);
			expect(text).toContain("\\u2028");
			expect(text).toContain("\\u2029");
			for (const year of YEARS) {
				expect(parseWithOptions(text, optionsFor(year, mode))).toEqual(value);
			}
		});

		test("the escaped output is what JSON.parse and the engine read back", () => {
			expect(JSON.parse(stringifyWithOptions(value, { mode: "json" }))).toEqual(value);
			const text = stringify(value);
			expect(ecmascript(`(${text})`).value).toEqual(value);
			expect(api2015.parse(api2015.stringify(value))).toEqual(value);
		});
	});
});
