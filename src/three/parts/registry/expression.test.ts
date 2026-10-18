import { describe, expect, it } from "vitest";
import { ExpressionError, evaluateExpression, resolveConstants } from "./expression";

describe("registry/expression 表达式求值", () => {
  it("基本四则与优先级", () => {
    expect(evaluateExpression("1+2*3")).toBe(7);
    expect(evaluateExpression("(1+2)*3")).toBe(9);
    expect(evaluateExpression("10/4")).toBe(2.5);
    expect(evaluateExpression("7%4")).toBe(3);
    expect(evaluateExpression("1 + 2 - 3")).toBe(0);
  });

  it("一元符号与幂（右结合，符号优先级低于幂）", () => {
    expect(evaluateExpression("-3")).toBe(-3);
    expect(evaluateExpression("-2^2")).toBe(-4);
    expect(evaluateExpression("2^3^2")).toBe(512);
    expect(evaluateExpression("2^-1")).toBe(0.5);
    expect(evaluateExpression("-(3+1)")).toBe(-4);
  });

  it("函数（三角函数按角度制）", () => {
    expect(evaluateExpression("sqrt(16)")).toBe(4);
    expect(evaluateExpression("sin(30)")).toBeCloseTo(0.5, 10);
    expect(evaluateExpression("cos(60)")).toBeCloseTo(0.5, 10);
    expect(evaluateExpression("min(3,1,2)")).toBe(1);
    expect(evaluateExpression("max(3,1,2)")).toBe(3);
    expect(evaluateExpression("clamp(5,0,3)")).toBe(3);
    expect(evaluateExpression("atan2(1,0)")).toBeCloseTo(90, 10);
    expect(evaluateExpression("sqrt(3^2+4^2)")).toBe(5);
  });

  it("内置常量", () => {
    expect(evaluateExpression("PI")).toBeCloseTo(Math.PI, 12);
    expect(evaluateExpression("TAU/2")).toBeCloseTo(Math.PI, 12);
  });

  it("引用外部常量", () => {
    expect(evaluateExpression("HULL_FRONT-0.05", { HULL_FRONT: 3.1 })).toBeCloseTo(3.05, 12);
    expect(evaluateExpression("2*WHEEL_R", { WHEEL_R: 0.4 })).toBeCloseTo(0.8, 12);
  });

  it("非法表达式给出明确错误", () => {
    expect(() => evaluateExpression("UNKNOWN")).toThrow(ExpressionError);
    expect(() => evaluateExpression("1/0")).toThrow(/除以零/);
    expect(() => evaluateExpression("1+")).toThrow(ExpressionError);
    expect(() => evaluateExpression("(1+2")).toThrow(/右括号/);
    expect(() => evaluateExpression("1 2")).toThrow(ExpressionError);
    expect(() => evaluateExpression("foo(1)")).toThrow(/未知函数/);
    expect(() => evaluateExpression("")).toThrow(/空表达式/);
    expect(() => evaluateExpression("$")).toThrow(/非法字符/);
    expect(() => evaluateExpression("min(1)")).not.toThrow();
    expect(() => evaluateExpression("sqrt()")).toThrow(/参数个数/);
  });

  it("数值原样返回", () => {
    expect(evaluateExpression(3.5)).toBe(3.5);
    expect(() => evaluateExpression(Number.NaN)).toThrow(ExpressionError);
  });
});

describe("registry/expression resolveConstants", () => {
  it("任意顺序互相引用", () => {
    const constants = resolveConstants({
      TRACK_PITCH: "TRACK_PATH_LEN/96",
      TRACK_PATH_LEN: "12.48",
      LINK_OFFSET: "TRACK_PITCH*0.5",
    });
    expect(constants.TRACK_PATH_LEN).toBeCloseTo(12.48, 12);
    expect(constants.TRACK_PITCH).toBeCloseTo(0.13, 12);
    expect(constants.LINK_OFFSET).toBeCloseTo(0.065, 12);
  });

  it("支持嵌套三层引用与函数", () => {
    const constants = resolveConstants({
      A: 2,
      B: "A*3",
      C: "sqrt(B^2+16)",
    });
    expect(constants.C).toBeCloseTo(Math.sqrt(36 + 16), 12);
  });

  it("循环引用报错且给出链路", () => {
    expect(() => resolveConstants({ A: "B+1", B: "A+1" })).toThrow(/循环引用/);
    expect(() => resolveConstants({ A: "A" })).toThrow(/循环引用/);
  });

  it("未定义常量报错", () => {
    expect(() => resolveConstants({ A: "MISSING+1" })).toThrow(/未知常量/);
  });

  it("非有限数报错", () => {
    expect(() => resolveConstants({ A: "sqrt(-1)" })).toThrow(/不是有限数|求值失败/);
  });
});
