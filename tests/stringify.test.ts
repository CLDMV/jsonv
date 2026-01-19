/**
 * Comprehensive stringify tests for @cldmv/jsonv
 * Phase 5: Stringify implementation
 */

import { describe, test, expect } from "vitest";
import JSONV from "../src/index.mjs";

describe("stringify() - Basic Serialization", () => {
	test("should stringify primitives", () => {
		expect(JSONV.stringify(null)).toBe("null");
		expect(JSONV.stringify(true)).toBe("true");
		expect(JSONV.stringify(false)).toBe("false");
		expect(JSONV.stringify(42)).toBe("42");
		expect(JSONV.stringify("hello")).toBe('"hello"');
	});

	test("should stringify empty structures", () => {
		expect(JSONV.stringify([])).toBe("[]");
		expect(JSONV.stringify({})).toBe("{}");
	});

	test("should stringify arrays", () => {
		const result = JSONV.stringify([1, 2, 3]);
		expect(result).toBe("[1,2,3]");
	});

	test("should stringify objects", () => {
		const result = JSONV.stringify({ a: 1, b: 2 });
		expect(result).toContain("a:1");
		expect(result).toContain("b:2");
	});

	test("should stringify nested structures", () => {
		const data = {
			user: {
				name: "Alice",
				age: 30
			},
			tags: ["admin", "user"]
		};
		const result = JSONV.stringify(data);
		expect(result).toContain("user:");
		expect(result).toContain("name:");
		expect(result).toContain("Alice");
		expect(result).toContain("tags:");
		expect(result).toContain("admin");
	});
});

describe("stringify() - Indentation", () => {
	test("should indent with spaces (number)", () => {
		const result = JSONV.stringify({ a: 1, b: 2 }, null, 2);
		expect(result).toContain("  ");
		expect(result).toContain("\n");
	});

	test("should indent with custom string", () => {
		const result = JSONV.stringify({ a: 1 }, null, "\t");
		expect(result).toContain("\t");
	});

	test("should limit indent to 10 characters", () => {
		const result = JSONV.stringify({ a: 1 }, null, 20);
		const lines = result.split("\n");
		const indented = lines.find((line) => line.startsWith(" "));
		expect(indented?.match(/^ +/)?.[0].length).toBeLessThanOrEqual(10);
	});

	test("should produce compact output without space param", () => {
		const result = JSONV.stringify({ a: 1, b: 2 });
		expect(result).not.toContain("\n");
	});
});

describe("stringify() - Special Numbers", () => {
	test("should stringify Infinity", () => {
		expect(JSONV.stringify(Infinity)).toBe("Infinity");
		expect(JSONV.stringify(-Infinity)).toBe("-Infinity");
	});

	test("should stringify NaN", () => {
		expect(JSONV.stringify(NaN)).toBe("NaN");
	});

	test("should stringify Infinity as null in JSON mode", () => {
		expect(JSONV.stringifyWithOptions(Infinity, { mode: "json" })).toBe("null");
		expect(JSONV.stringifyWithOptions(-Infinity, { mode: "json" })).toBe("null");
	});

	test("should stringify NaN as null in JSON mode", () => {
		expect(JSONV.stringifyWithOptions(NaN, { mode: "json" })).toBe("null");
	});
});

describe("stringify() - BigInt (ES2020)", () => {
	test("should stringify BigInt with 'n' suffix in native mode", () => {
		const result = JSONV.stringify({ id: 9007199254740992n });
		expect(result).toContain("9007199254740992n");
	});

	test("should stringify BigInt as string in 'string' mode", () => {
		const result = JSONV.stringifyWithOptions({ id: 9007199254740992n }, { bigint: "string" });
		expect(result).toContain('"9007199254740992"');
	});

	test("should stringify BigInt as object in 'object' mode", () => {
		const result = JSONV.stringifyWithOptions({ id: 9007199254740992n }, { bigint: "object" });
		expect(result).toContain('"$bigint"');
		expect(result).toContain('"9007199254740992"');
	});

	test("should stringify BigInt as string in JSON mode", () => {
		const result = JSONV.stringifyWithOptions({ id: 9007199254740992n }, { mode: "json" });
		expect(result).toContain('"9007199254740992"');
		expect(result).not.toContain("n");
	});
});

describe("stringify() - Output Modes", () => {
	test("should use quoted keys in JSON mode", () => {
		const result = JSONV.stringifyWithOptions({ key: "value" }, { mode: "json" });
		expect(result).toContain('"key"');
	});

	test("should use unquoted keys in jsonv mode (default)", () => {
		const result = JSONV.stringify({ key: "value" });
		expect(result).toContain("key:");
		expect(result).not.toContain('"key"');
	});

	test("should use unquoted keys in JSON5 mode", () => {
		const result = JSONV.stringifyWithOptions({ key: "value" }, { mode: "json5" });
		expect(result).toContain("key:");
	});

	test("should quote keys that aren't valid identifiers", () => {
		const result = JSONV.stringify({ "my-key": 1, "2key": 2, "": 3 });
		expect(result).toContain('"my-key"');
		expect(result).toContain('"2key"');
		expect(result).toContain('""');
	});
});

describe("stringify() - Trailing Commas", () => {
	test("should add trailing comma in arrays (jsonv mode)", () => {
		const result = JSONV.stringify([1, 2, 3], null, 2);
		expect(result).toContain(",\n]");
	});

	test("should add trailing comma in objects (jsonv mode)", () => {
		const result = JSONV.stringify({ a: 1, b: 2 }, null, 2);
		expect(result).toContain(",\n}");
	});

	test("should NOT add trailing comma in JSON mode", () => {
		const result = JSONV.stringifyWithOptions([1, 2, 3], { mode: "json", space: 2 });
		expect(result).not.toMatch(/,\n\s*\]/);
	});
});

describe("stringify() - Replacer Function", () => {
	test("should apply replacer function", () => {
		const data = { a: 1, b: 2, c: 3 };
		const result = JSONV.stringify(data, (key, value) => {
			if (key === "b") return undefined;
			return value;
		});
		expect(result).toContain("a:");
		expect(result).not.toContain("b:");
		expect(result).toContain("c:");
	});

	test("should transform values with replacer", () => {
		const data = { value: 42 };
		const result = JSONV.stringify(data, (_key, value) => {
			if (typeof value === "number") return value * 2;
			return value;
		});
		expect(result).toContain("84");
	});

	test("should call replacer with correct 'this' context", () => {
		const data = { a: 1, b: 2 };
		const contexts: any[] = [];
		JSONV.stringify(data, function (this: any, key, value) {
			contexts.push(this);
			return value;
		});
		expect(contexts.length).toBeGreaterThan(0);
	});
});

describe("stringify() - Replacer Array", () => {
	test("should filter properties with replacer array", () => {
		const data = { a: 1, b: 2, c: 3 };
		const result = JSONV.stringify(data, ["a", "c"]);
		expect(result).toContain("a:");
		expect(result).not.toContain("b:");
		expect(result).toContain("c:");
	});

	test("should work with numeric property names", () => {
		const data = { 1: "one", 2: "two", 3: "three" };
		const result = JSONV.stringify(data, [1, 3]);
		expect(result).toContain('"1"');
		expect(result).not.toContain('"2"');
		expect(result).toContain('"3"');
	});
});

describe("stringify() - Edge Cases", () => {
	test("should handle undefined as root value", () => {
		expect(JSONV.stringify(undefined)).toBe("undefined");
	});

	test("should skip undefined values in objects", () => {
		const result = JSONV.stringify({ a: 1, b: undefined, c: 3 });
		expect(result).toContain("a:");
		expect(result).not.toContain("b:");
		expect(result).toContain("c:");
	});

	test("should skip function values", () => {
		const result = JSONV.stringify({
			a: 1,
			fn: () => {},
			b: 2
		});
		expect(result).toContain("a:");
		expect(result).not.toContain("fn:");
		expect(result).toContain("b:");
	});

	test("should skip symbol values", () => {
		const result = JSONV.stringify({ a: 1, sym: Symbol("test"), b: 2 });
		expect(result).toContain("a:");
		expect(result).not.toContain("sym:");
		expect(result).toContain("b:");
	});

	test("should throw on circular references", () => {
		const obj: any = { a: 1 };
		obj.self = obj;
		expect(() => JSONV.stringify(obj)).toThrow(/circular/i);
	});

	test("should handle Date objects", () => {
		const date = new Date("2026-01-16T00:00:00Z");
		const result = JSONV.stringify({ date });
		expect(result).toContain("2026-01-16");
	});

	test("should handle arrays with undefined", () => {
		const result = JSONV.stringify([1, undefined, 3]);
		expect(result).toContain("undefined");
	});
});

describe("stringify() - Quote Styles", () => {
	test("should use double quotes by default", () => {
		const result = JSONV.stringify({ str: "hello" });
		expect(result).toContain('"hello"');
	});

	test("should use single quotes when specified", () => {
		const result = JSONV.stringifyWithOptions({ str: "hello" }, { singleQuote: true });
		expect(result).toContain("'hello'");
	});

	test("should escape quotes in strings", () => {
		const result = JSONV.stringify({ str: 'say "hello"' });
		expect(result).toContain('\\"');
	});

	test("should escape single quotes when using single quote mode", () => {
		const result = JSONV.stringifyWithOptions({ str: "it's" }, { singleQuote: true });
		expect(result).toContain("\\'");
	});
});

describe("stringify() - String Escaping", () => {
	test("should escape control characters", () => {
		const result = JSONV.stringify({ str: "line1\nline2\ttab" });
		expect(result).toContain("\\n");
		expect(result).toContain("\\t");
	});

	test("should escape backslashes", () => {
		const result = JSONV.stringify({ path: "C:\\Users\\test" });
		expect(result).toContain("\\\\");
	});

	test("should handle unicode characters", () => {
		const result = JSONV.stringify({ emoji: "🚀" });
		expect(result).toContain("🚀");
	});

	test("should escape low control codes", () => {
		const result = JSONV.stringify({ ctrl: "\x01\x02\x03" });
		expect(result).toMatch(/\\u000[123]/);
	});
});

describe("rawJSON() and isRawJSON()", () => {
	test("should create raw JSON objects", () => {
		const raw = JSONV.rawJSON('{"key":"value"}');
		expect(JSONV.isRawJSON(raw)).toBe(true);
	});

	test("should return false for non-raw objects", () => {
		expect(JSONV.isRawJSON({})).toBe(false);
		expect(JSONV.isRawJSON(null)).toBe(false);
		expect(JSONV.isRawJSON(undefined)).toBe(false);
		expect(JSONV.isRawJSON("string")).toBe(false);
	});

	test("should serialize raw JSON as-is", () => {
		const raw = JSONV.rawJSON('{"nested":{"key":"value"}}');
		const result = JSONV.stringify({ data: raw });
		expect(result).toContain('{"nested":{"key":"value"}}');
	});

	test("should throw on invalid JSON in rawJSON", () => {
		expect(() => JSONV.rawJSON("{invalid}")).toThrow(/valid JSON/);
		expect(() => JSONV.rawJSON("not json at all")).toThrow(/valid JSON/);
	});

	test("should allow valid JSON in rawJSON", () => {
		expect(() => JSONV.rawJSON("null")).not.toThrow();
		expect(() => JSONV.rawJSON("true")).not.toThrow();
		expect(() => JSONV.rawJSON("42")).not.toThrow();
		expect(() => JSONV.rawJSON('"string"')).not.toThrow();
		expect(() => JSONV.rawJSON("[]")).not.toThrow();
		expect(() => JSONV.rawJSON("{}")).not.toThrow();
	});
});

describe("Round-trip Tests", () => {
	test("should round-trip basic objects", () => {
		const original = { a: 1, b: "hello", c: true, d: null };
		const text = JSONV.stringify(original);
		const parsed = JSONV.parse(text);
		expect(parsed).toEqual(original);
	});

	test("should round-trip nested structures", () => {
		const original = {
			user: {
				name: "Alice",
				age: 30,
				active: true
			},
			tags: ["admin", "user", "moderator"]
		};
		const text = JSONV.stringify(original);
		const parsed = JSONV.parse(text);
		expect(parsed).toEqual(original);
	});

	test("should round-trip special numbers", () => {
		const original = { inf: Infinity, ninf: -Infinity, nan: NaN };
		const text = JSONV.stringify(original);
		const parsed = JSONV.parse(text);
		expect(parsed.inf).toBe(Infinity);
		expect(parsed.ninf).toBe(-Infinity);
		expect(Number.isNaN(parsed.nan)).toBe(true);
	});

	test("should round-trip BigInt", () => {
		const original = { id: 9007199254740992n, count: 42n };
		const text = JSONV.stringify(original);
		const parsed = JSONV.parse(text);
		expect(parsed.id).toBe(9007199254740992n);
		expect(parsed.count).toBe(42n);
	});

	test("should round-trip arrays with trailing commas", () => {
		const original = [1, 2, 3, 4, 5];
		const text = JSONV.stringify(original);
		const parsed = JSONV.parse(text);
		expect(parsed).toEqual(original);
	});

	test("should round-trip empty structures", () => {
		expect(JSONV.parse(JSONV.stringify([]))).toEqual([]);
		expect(JSONV.parse(JSONV.stringify({}))).toEqual({});
	});

	test("should round-trip deeply nested structures", () => {
		const original = {
			level1: {
				level2: {
					level3: {
						level4: {
							value: "deep"
						}
					}
				}
			}
		};
		const text = JSONV.stringify(original);
		const parsed = JSONV.parse(text);
		expect(parsed).toEqual(original);
	});
});

describe("Edge Cases - Circular and Complex", () => {
	test("should detect circular references in arrays", () => {
		const arr: any[] = [1, 2];
		arr.push(arr);
		expect(() => JSONV.stringify(arr)).toThrow(/circular/i);
	});

	test("should detect indirect circular references", () => {
		const obj1: any = { name: "obj1" };
		const obj2: any = { name: "obj2", ref: obj1 };
		obj1.ref = obj2;
		expect(() => JSONV.stringify(obj1)).toThrow(/circular/i);
	});

	test("should handle same object referenced multiple times (not circular)", () => {
		const shared = { value: 42 };
		const obj = {
			a: shared,
			b: shared
		};
		// This should NOT throw - same object can appear multiple times
		// as long as it's not circular
		const result = JSONV.stringify(obj);
		expect(result).toContain("value:42");
	});
});
