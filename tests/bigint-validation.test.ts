/**
 * Test BigInt validation for unsafe integers
 */

import { describe, it, expect } from "vitest";
import { parseWithOptions } from "../src/parser.mjs";

describe("BigInt validation", () => {
	it("should reject plain integer literals > MAX_SAFE_INTEGER", () => {
		expect(() => parseWithOptions("{ id: 9007199254740993 }", { year: 2020, strictBigInt: true })).toThrow(/outside safe integer range/);
	});

	it("should accept BigInt literals > MAX_SAFE_INTEGER", () => {
		expect(() => {
			const result = parseWithOptions("{ id: 9007199254740993n }", { year: 2020, strictBigInt: true });
			expect(result.id).toBe(9007199254740993n);
		}).not.toThrow();
	});

	it("should allow decimal literals with .0 even if large", () => {
		expect(() => {
			const result = parseWithOptions("{ val: 9007199254740993.0 }", { year: 2020, strictBigInt: true });
			expect(result.val).toBeDefined();
		}).not.toThrow();
	});

	it("should allow decimal literals with fractional part even if large", () => {
		expect(() => {
			const result = parseWithOptions("{ val: 9007199254740993.5 }", { year: 2020, strictBigInt: true });
			expect(result.val).toBeDefined();
		}).not.toThrow();
	});

	it("should allow scientific notation even if evaluates to large integer", () => {
		expect(() => {
			const result = parseWithOptions("{ val: 9.007199254740993e15 }", { year: 2020, strictBigInt: true });
			expect(result.val).toBeDefined();
		}).not.toThrow();
	});

	it("should allow scientific notation with + exponent", () => {
		expect(() => {
			const result = parseWithOptions("{ val: 6.02e+23 }", { year: 2020, strictBigInt: true });
			expect(result.val).toBeDefined();
		}).not.toThrow();
	});

	it("should reject negative plain integers < MIN_SAFE_INTEGER", () => {
		expect(() => parseWithOptions("{ val: -9007199254740993 }", { year: 2020, strictBigInt: true })).toThrow(/outside safe integer range/);
	});

	it("should allow safe integers without BigInt suffix", () => {
		expect(() => {
			const result = parseWithOptions("{ val: 9007199254740991 }", { year: 2020, strictBigInt: true });
			expect(result.val).toBe(9007199254740991);
		}).not.toThrow();
	});

	it("should allow Infinity without validation", () => {
		expect(() => {
			const result = parseWithOptions("{ val: Infinity }", { year: 2020, strictBigInt: true });
			expect(result.val).toBe(Infinity);
		}).not.toThrow();
	});

	it("should document the precision issue for large decimals", () => {
		// This test documents JavaScript's behavior - even .5 loses precision
		const result = parseWithOptions("{ val: 9007199254740993.5 }", { year: 2020, strictBigInt: true });
		// JavaScript rounds this to nearest representable value
		expect(result.val).toBe(9007199254740994); // .5 gets rounded up
	});
});
