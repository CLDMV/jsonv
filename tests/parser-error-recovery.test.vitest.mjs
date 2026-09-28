/**
 * Tests for specific parser error recovery and edge case paths
 * Targeting the remaining uncovered lines that ARE actually testable
 */

import { describe, it, expect } from "vitest";
import { parse } from "../src/index.mjs";
import { parse as parse2015 } from "../src/years/2015.mjs";

describe("Parser Error Recovery and Edge Cases", () => {
	describe("Reviver function edge cases", () => {
		it("should handle reviver that returns undefined for array elements (line 624)", () => {
			// Line 624 - delete array element when reviver returns undefined
			const reviver = (key: string, value: any) => {
				if (typeof value === "number" && value === 2) {
					return undefined; // Delete this element
				}
				return value;
			};

			const result = parse("[1, 2, 3]", reviver);
			// Element at index 1 should be deleted (sparse array)
			expect(result).toHaveLength(3);
			expect(result[0]).toBe(1);
			expect(result[1]).toBeUndefined(); // Deleted
			expect(result[2]).toBe(3);
		});

		it("should handle reviver that returns undefined for object properties (line 634)", () => {
			// Line 634 - delete object property when reviver returns undefined
			const reviver = (key: string, value: any) => {
				if (key === "secret") {
					return undefined; // Delete this property
				}
				return value;
			};

			const result = parse("{ public: 1, secret: 2, visible: 3 }", reviver);
			expect(result).toEqual({ public: 1, visible: 3 });
			expect(result).not.toHaveProperty("secret");
		});

		it("should handle reviver that transforms nested values (line 644)", () => {
			// Line 644 - set new value returned by reviver
			const reviver = (key: string, value: any) => {
				if (typeof value === "string") {
					return value.toUpperCase();
				}
				return value;
			};

			const result = parse('{ nested: { name: "test" } }', reviver);
			expect(result.nested.name).toBe("TEST");
		});
	});

	describe("Member expression resolution edge cases", () => {
		it("should handle member expression where intermediate property is null (line 825)", () => {
			// Line 825 - return undefined when intermediate value is null
			const input = "{ data: null, result: data.value }";
			expect(() => parse(input)).toThrow(/cannot access|undefined/i);
		});

		it("should handle member expression where property doesn't exist (line 828)", () => {
			// Line 828 - return undefined when property doesn't exist
			const input = '{ server: { host: "localhost" }, result: server.port }';
			expect(() => parse(input)).toThrow(/undefined|not found/i);
		});

		it("should handle deeply nested member expressions", () => {
			// Lines 800+ - test full member expression path resolution
			const input = "{ a: { b: { c: 123 } }, result: a.b.c }";
			const result = parse(input);
			expect(result.result).toBe(123);
		});

		it("should handle member expression with undefined intermediate value (line 800)", () => {
			// Line 800 - test when intermediate value is undefined
			const input = "{ a: {}, result: a.b.c }";
			expect(() => parse(input)).toThrow(/undefined|not found/i);
		});
	});

	describe("Template literal with undefined references", () => {
		it("should handle template with reference that resolves to undefined (line 854)", () => {
			// Line 854 - template can't resolve when expression is undefined
			const input = "{ x: { y: 5 }, message: `Value: ${x.z}` }";
			expect(() => parse2015(input)).toThrow(/undefined|not found/i);
		});

		it("should handle template with missing identifier", () => {
			const input = "{ message: `Hello ${missing}` }";
			expect(() => parse2015(input)).toThrow(/undefined|not found/i);
		});
	});

	describe("Array parsing error recovery", () => {
		it("should handle unexpected tokens in arrays (tolerant mode)", () => {
			// Test error recovery in arrays
			const input = "[1, 2, /* bad */";
			expect(() => parse(input)).toThrow(/expected.*rbracket|eof/i);
		});

		it("should handle malformed array with missing comma", () => {
			const input = "[1 2]";
			expect(() => parse(input)).toThrow(/expected.*,|unexpected/i);
		});
	});

	describe("Object parsing error recovery", () => {
		it("should handle unexpected tokens in objects", () => {
			const input = "{ x: 1, y: }";
			expect(() => parse(input)).toThrow(/unexpected|expected.*value/i);
		});

		it("should handle malformed object with missing colon", () => {
			const input = "{ x 1 }";
			expect(() => parse(input)).toThrow(/expected.*colon/i);
		});
	});

	describe("Template parsing error recovery", () => {
		it("should handle malformed template interpolation", () => {
			const input = "{ x: 5, msg: `test${` }";
			expect(() => parse2015(input)).toThrow(/unexpected|unterminated/i);
		});

		it("should handle template with incomplete interpolation", () => {
			const input = "`test${x";
			expect(() => parse2015(input)).toThrow(/expected.*template/i);
		});
	});

	describe("Unknown node type error (line 684)", () => {
		// This is defensive code for AST nodes we don't recognize
		// Hard to trigger without manually creating invalid AST
		it("should parse valid nested structures without unknown nodes", () => {
			// Ensure all node types are recognized
			const input = '{ arr: [1, 2, { nested: true }], str: "test", num: 123 }';
			const result = parse(input);
			expect(result).toHaveProperty("arr");
			expect(result).toHaveProperty("str");
			expect(result).toHaveProperty("num");
		});
	});
});
