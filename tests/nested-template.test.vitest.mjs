/**
 * Tests for GitHub issue #49: a template literal nested inside another
 * template's interpolation must evaluate like any other interpolated
 * expression instead of failing with
 * "Unresolved reference: <template> (circular reference or undefined)".
 */

import { describe, test, expect } from "vitest";
import JSONV, { parse, parseWithOptions, JsonvReferenceError, JsonvSyntaxError } from "../src/index.mjs";
import JSONV2015 from "../src/years/2015.mjs";
import JSONV2020 from "../src/years/2020.mjs";
import JSONV2021 from "../src/years/2021.mjs";

/**
 * Run `fn` and return the error it throws, failing the test if it does not throw.
 * @param {() => unknown} fn
 * @returns {any}
 */
function thrown(fn) {
	try {
		fn();
	} catch (err) {
		return err;
	}
	return expect.fail("expected a throw");
}

describe("nested template literals (issue #49)", () => {
	describe("evaluation", () => {
		test("the issue's reproduction evaluates to the concatenated string", () => {
			expect(parseWithOptions("{ a: 1, t: `a${ `b${a}c` }d` }", { year: 2015 })).toEqual({ a: 1, t: "ab1cd" });
		});

		test("one level deep", () => {
			expect(parseWithOptions("{ name: 'x', t: `<${ `[${name}]` }>` }", { year: 2015 })).toEqual({ name: "x", t: "<[x]>" });
		});

		test("two levels deep", () => {
			expect(parseWithOptions("{ v: 7, t: `1${ `2${ `3${v}4` }5` }6` }", { year: 2015 })).toEqual({ v: 7, t: "1237456" });
		});

		test("a nested template with no interpolation of its own", () => {
			expect(parseWithOptions("{ t: `a${ `b` }c` }", { year: 2015 })).toEqual({ t: "abc" });
		});

		test("a nested template alongside a plain reference in the same template", () => {
			expect(parseWithOptions("{ host: 'h', port: 80, url: `${host}:${ `${port}` }/` }", { year: 2015 })).toEqual({
				host: "h",
				port: 80,
				url: "h:80/"
			});
		});

		test("a nested template that references another key through a member expression", () => {
			const input = "{ db: { host: 'localhost', port: 5432 }, url: `pg://${ `${db.host}:${db.port}` }/app` }";
			expect(parseWithOptions(input, { year: 2015 })).toEqual({
				db: { host: "localhost", port: 5432 },
				url: "pg://localhost:5432/app"
			});
		});

		test("a nested template that references a key whose value is itself a template", () => {
			const input = "{ base: `b${ `-${n}` }`, n: 3, t: `[${ `${base}!` }]` }";
			expect(parseWithOptions(input, { year: 2015 })).toEqual({ base: "b-3", n: 3, t: "[b-3!]" });
		});

		test("a nested template inside a forward reference", () => {
			const input = "{ t: `x${ `y${later}` }z`, later: 'L' }";
			expect(parseWithOptions(input, { year: 2015 })).toEqual({ t: "xyLz", later: "L" });
		});

		test("a nested template whose forward reference is itself a reference (resolved on a later pass)", () => {
			const input = "{ t: `x${ `y${mid}` }z`, mid: last, last: 9 }";
			expect(parseWithOptions(input, { year: 2015 })).toEqual({ t: "xy9z", mid: 9, last: 9 });
		});

		test("a key that forward-references a value built from a nested template", () => {
			const input = "{ copy: t, t: `a${ `b${n}` }`, n: 2 }";
			expect(parseWithOptions(input, { year: 2015 })).toEqual({ copy: "ab2", t: "ab2", n: 2 });
		});

		test("a nested template in an array element", () => {
			const input = "{ a: 1, list: [`x${ `y${a}` }z`, `${ `${ `${a}` }` }`] }";
			expect(parseWithOptions(input, { year: 2015 })).toEqual({ a: 1, list: ["xy1z", "1"] });
		});

		test("literal interpolations evaluate to their value", () => {
			expect(parseWithOptions("{ t: `${'s'}|${1}|${true}|${null}|${ `${2}` }` }", { year: 2015 })).toEqual({ t: "s|1|true|null|2" });
		});

		test("an array interpolation is rejected at the array literal (issue #50)", () => {
			const input = "{ t: `a${ `b${ [1] }` }` }";
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvSyntaxError);
			expect(err.code).toBe("UNSUPPORTED_INTERPOLATION");
			expect(err.message).toBe(`Array literals are not supported in template interpolation at line 1, column ${input.indexOf("[")}`);
			expect(err.offset).toBe(input.indexOf("["));
		});

		test("in tolerant mode a rejected array interpolation is reported in the aggregate syntax error (issue #59)", () => {
			const input = "{ t: `a${ `b${ [1] }` }` }";
			const err = thrown(() => parseWithOptions(input, { year: 2015, tolerant: true }));
			expect(err).toBeInstanceOf(JsonvSyntaxError);
			expect(err).not.toBeInstanceOf(JsonvReferenceError);
			expect(err.errors.map((e) => e.code)).toEqual(["UNSUPPORTED_INTERPOLATION"]);
			expect(err.errors[0].offset).toBe(input.indexOf("[1]"));
		});

		test("a nested template as the top-level value of a root array", () => {
			expect(parseWithOptions("[`a${ `b` }c`]", { year: 2015 })).toEqual(["abc"]);
		});
	});

	describe("every parse entry point", () => {
		const input = "{ a: 1, t: `a${ `b${a}c` }d` }";
		const expected = { a: 1, t: "ab1cd" };

		test("parse (main entry)", () => {
			expect(parse(input)).toEqual(expected);
		});

		test("default export parse", () => {
			expect(JSONV.parse(input)).toEqual(expected);
		});

		test.each([2015, 2020, 2021, 2025])("parseWithOptions with year %i", (year) => {
			expect(parseWithOptions(input, { year })).toEqual(expected);
		});

		test.each([
			["2015", JSONV2015],
			["2020", JSONV2020],
			["2021", JSONV2021]
		])("year module %s parse and parseWithOptions", (_year, api) => {
			expect(api.parse(input)).toEqual(expected);
			expect(api.parseWithOptions(input)).toEqual(expected);
		});

		test("a reviver sees the evaluated nested template", () => {
			const seen = [];
			parse(input, function (key, value) {
				seen.push([key, value]);
				return value;
			});
			expect(seen).toContainEqual(["t", "ab1cd"]);
		});
	});

	describe("unresolved and circular references through a nested template", () => {
		test("an undefined reference inside a nested template throws JsonvReferenceError at the outer template", () => {
			const input = "{\n  t: `a${ `b${missing}` }`\n}";
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.message).toBe("Unresolved reference: <template> (circular reference or undefined)");
			expect(err.code).toBe("UNRESOLVED_REFERENCE");
			expect(err.line).toBe(2);
			expect(err.column).toBe(input.split("\n")[1].indexOf("`"));
			expect(err.offset).toBe(input.indexOf("`"));
		});

		// Cycles are reported by name, at the reference that closes the cycle (issue #54)
		test("a self-reference through a nested template is detected as circular", () => {
			const input = "{ t: `a${ `b${t}` }` }";
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.message).toBe("Circular reference: t -> t");
			expect(err.code).toBe("UNRESOLVED_REFERENCE");
			expect(err.line).toBe(1);
			expect(err.column).toBe(input.indexOf("${t}") + 2);
			expect(err.offset).toBe(input.indexOf("${t}") + 2);
		});

		test("a two-key cycle through a nested template points at the interpolated reference that closes it", () => {
			const input = "{\n  a: b,\n  b: `x${ `y${a}` }`\n}";
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.message).toBe("Circular reference: a -> b -> a");
			expect(err.line).toBe(3);
			expect(err.column).toBe(input.split("\n")[2].indexOf("${a}") + 2);
			expect(err.offset).toBe(input.indexOf("${a}") + 2);
		});

		test("a cycle whose first key holds the nested template points at the reference that closes it", () => {
			const input = "{\n  a: `x${ `y${b}` }`,\n  b: a\n}";
			const err = thrown(() => parse(input));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.message).toBe("Circular reference: a -> b -> a");
			expect(err.line).toBe(3);
			expect(err.column).toBe(input.split("\n")[2].indexOf("a"));
			expect(err.offset).toBe(input.lastIndexOf("a"));
		});

		test("a cycle through a nested template in an array element is detected", () => {
			const input = "{ list: [`${ `${x}` }`], x: y, y: x }";
			const err = thrown(() => parseWithOptions(input, { year: 2015 }));
			expect(err).toBeInstanceOf(JsonvReferenceError);
			expect(err.message).toBe("Circular reference: x -> y -> x");
			expect(err.column).toBe(input.lastIndexOf("x"));
			expect(err.offset).toBe(input.lastIndexOf("x"));
		});
	});
});
