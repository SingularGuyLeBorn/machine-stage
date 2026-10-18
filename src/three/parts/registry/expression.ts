import type { Expr } from "./types";

// ============================================================================
// registry/expression —— 常量表达式求值（单一真值源的传播机制）
//
// constants 的值可以是数值或表达式字符串："HULL_FRONT-0.05"、"TRACK_PATH_LEN/96"。
// 求值器是手写递归下降解析器（不使用 eval / new Function）：
//   表达式 := 项 (('+'|'-') 项)*
//   项     := 一元 (('*'|'/'|'%') 一元)*
//   一元   := ('-'|'+') 一元 | 幂
//   幂     := 基本 ('^' 一元)?          // 右结合
//   基本   := 数字 | 标识符 | 函数'('参数表')' | '(' 表达式 ')'
// 三角函数按**角度**制（工程语境：火炮仰角、倾角直接写度数）。
// ============================================================================

export class ExpressionError extends Error {
  constructor(
    message: string,
    public readonly expression: string,
  ) {
    super(`表达式 "${expression}" 求值失败：${message}`);
    this.name = "ExpressionError";
  }
}

const DEG = Math.PI / 180;

interface FnSpec {
  minArgs: number;
  maxArgs: number;
  fn: (args: number[]) => number;
}

const FUNCTIONS: Record<string, FnSpec> = {
  sqrt: { minArgs: 1, maxArgs: 1, fn: ([a]) => Math.sqrt(a) },
  abs: { minArgs: 1, maxArgs: 1, fn: ([a]) => Math.abs(a) },
  floor: { minArgs: 1, maxArgs: 1, fn: ([a]) => Math.floor(a) },
  ceil: { minArgs: 1, maxArgs: 1, fn: ([a]) => Math.ceil(a) },
  round: { minArgs: 1, maxArgs: 1, fn: ([a]) => Math.round(a) },
  sin: { minArgs: 1, maxArgs: 1, fn: ([a]) => Math.sin(a * DEG) },
  cos: { minArgs: 1, maxArgs: 1, fn: ([a]) => Math.cos(a * DEG) },
  tan: { minArgs: 1, maxArgs: 1, fn: ([a]) => Math.tan(a * DEG) },
  atan2: { minArgs: 2, maxArgs: 2, fn: ([y, x]) => Math.atan2(y, x) / DEG },
  pow: { minArgs: 2, maxArgs: 2, fn: ([a, b]) => Math.pow(a, b) },
  min: { minArgs: 1, maxArgs: Infinity, fn: (args) => Math.min(...args) },
  max: { minArgs: 1, maxArgs: Infinity, fn: (args) => Math.max(...args) },
  clamp: { minArgs: 3, maxArgs: 3, fn: ([v, lo, hi]) => Math.min(Math.max(v, lo), hi) },
  hypot: { minArgs: 1, maxArgs: Infinity, fn: (args) => Math.hypot(...args) },
  lerp: { minArgs: 3, maxArgs: 3, fn: ([a, b, t]) => a + (b - a) * t },
};

const BUILTIN_CONSTANTS: Record<string, number> = {
  PI: Math.PI,
  TAU: Math.PI * 2,
  E: Math.E,
  DEG: DEG,
  RAD: 180 / Math.PI,
};

const MAX_TOKENS = 512;
const MAX_DEPTH = 32;

type Token =
  | { kind: "number"; value: number; pos: number }
  | { kind: "ident"; value: string; pos: number }
  | { kind: "op"; value: string; pos: number }
  | { kind: "lparen"; pos: number }
  | { kind: "rparen"; pos: number }
  | { kind: "comma"; pos: number };

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      let j = i;
      while (j < expression.length && /[0-9._]/.test(expression[j])) j++;
      const raw = expression.slice(i, j).replace(/_/g, "");
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new ExpressionError(`无法识别的数字 "${raw}"`, expression);
      tokens.push({ kind: "number", value, pos: i });
      i = j;
      continue;
    }
    if (ch === "." && i + 1 < expression.length && /[0-9]/.test(expression[i + 1])) {
      let j = i;
      while (j < expression.length && /[0-9._]/.test(expression[j])) j++;
      const value = Number(expression.slice(i, j).replace(/_/g, ""));
      tokens.push({ kind: "number", value, pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < expression.length && /[A-Za-z0-9_]/.test(expression[j])) j++;
      tokens.push({ kind: "ident", value: expression.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(ch)) {
      tokens.push({ kind: "op", value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", pos: i });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma", pos: i });
      i++;
      continue;
    }
    throw new ExpressionError(`非法字符 "${ch}"（位置 ${i}）`, expression);
  }
  if (tokens.length === 0) throw new ExpressionError("空表达式", expression);
  if (tokens.length > MAX_TOKENS) throw new ExpressionError("表达式过长（>512 token）", expression);
  return tokens;
}

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly expression: string,
    private readonly constants: Record<string, number>,
  ) {}

  parse(): number {
    const value = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new ExpressionError(`多余的内容（位置 ${this.peek()?.pos ?? "?"}）`, this.expression);
    }
    return this.ensureFinite(value, "结果");
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new ExpressionError("表达式意外结束", this.expression);
    this.pos++;
    return token;
  }

  private ensureFinite(value: number, what: string): number {
    if (!Number.isFinite(value)) throw new ExpressionError(`${what}不是有限数（${value}）`, this.expression);
    return value;
  }

  private enter(): void {
    if (++this.depth > MAX_DEPTH) throw new ExpressionError("嵌套过深", this.expression);
  }

  private leave(): void {
    this.depth--;
  }

  private parseExpression(): number {
    this.enter();
    let value = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
        this.next();
        const rhs = this.parseTerm();
        value = token.value === "+" ? value + rhs : value - rhs;
      } else break;
    }
    this.leave();
    return value;
  }

  private parseTerm(): number {
    this.enter();
    let value = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token?.kind === "op" && (token.value === "*" || token.value === "/" || token.value === "%")) {
        this.next();
        const rhs = this.parseUnary();
        if (token.value === "*") value = value * rhs;
        else if (token.value === "/") {
          if (rhs === 0) throw new ExpressionError("除以零", this.expression);
          value = value / rhs;
        } else {
          if (rhs === 0) throw new ExpressionError("模零", this.expression);
          value = value % rhs;
        }
      } else break;
    }
    this.leave();
    return value;
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token?.kind === "op" && (token.value === "-" || token.value === "+")) {
      this.next();
      const value = this.parseUnary();
      return token.value === "-" ? -value : value;
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    const token = this.peek();
    if (token?.kind === "op" && token.value === "^") {
      this.next();
      this.enter();
      const exponent = this.parseUnary();
      this.leave();
      return this.ensureFinite(Math.pow(base, exponent), "幂运算");
    }
    return base;
  }

  private parsePrimary(): number {
    this.enter();
    const token = this.next();
    try {
      if (token.kind === "number") return token.value;
      if (token.kind === "lparen") {
        const value = this.parseExpression();
        const closing = this.peek();
        if (!closing || closing.kind !== "rparen") throw new ExpressionError("缺少右括号", this.expression);
        this.next();
        return value;
      }
      if (token.kind === "ident") {
        const nextToken = this.peek();
        if (nextToken?.kind === "lparen") {
          const spec = FUNCTIONS[token.value];
          if (!spec) throw new ExpressionError(`未知函数 "${token.value}"`, this.expression);
          this.next();
          const args: number[] = [];
          if (this.peek()?.kind !== "rparen") {
            for (;;) {
              args.push(this.parseExpression());
              const separator = this.peek();
              if (separator?.kind === "comma") {
                this.next();
                continue;
              }
              break;
            }
          }
          const closing = this.peek();
          if (!closing || closing.kind !== "rparen") throw new ExpressionError("缺少右括号", this.expression);
          this.next();
          if (args.length < spec.minArgs || args.length > spec.maxArgs) {
            throw new ExpressionError(
              `函数 "${token.value}" 参数个数为 ${args.length}，要求 ${spec.minArgs}..${spec.maxArgs}`,
              this.expression,
            );
          }
          return this.ensureFinite(spec.fn(args), `函数 ${token.value}`.concat("的返回值"));
        }
        if (Object.prototype.hasOwnProperty.call(this.constants, token.value)) {
          return this.ensureFinite(this.constants[token.value], `常量 ${token.value}`);
        }
        if (Object.prototype.hasOwnProperty.call(BUILTIN_CONSTANTS, token.value)) {
          return BUILTIN_CONSTANTS[token.value];
        }
        throw new ExpressionError(`未知常量 "${token.value}"`, this.expression);
      }
      throw new ExpressionError(`意外的符号（位置 ${token.pos}）`, this.expression);
    } finally {
      this.leave();
    }
  }
}

/** 单表达式求值（constants 为已解析的数值表；内置 PI/TAU/E/DEG/RAD 与函数）。 */
export function evaluateExpression(expr: Expr, constants: Record<string, number> = {}): number {
  if (typeof expr === "number") {
    if (!Number.isFinite(expr)) throw new ExpressionError("数值非法", String(expr));
    return expr;
  }
  const tokens = tokenize(expr);
  return new Parser(tokens, expr, constants).parse();
}

/** 在给定 constants 表的上下文里求值一组表达式（含对彼此的引用）。 */
export function evaluateVec3(
  vec: [Expr, Expr, Expr] | undefined,
  constants: Record<string, number>,
): [number, number, number] {
  if (!vec) return [0, 0, 0];
  return [
    evaluateExpression(vec[0], constants),
    evaluateExpression(vec[1], constants),
    evaluateExpression(vec[2], constants),
  ];
}

/**
 * 解析整张 constants 表（支持常量互相引用，与书写顺序无关；检测循环引用）。
 * 返回纯数值表，供装配器派生所有零件位置。
 */
export function resolveConstants(raw: Record<string, Expr>): Record<string, number> {
  const resolved: Record<string, number> = {};
  const resolving = new Set<string>();
  const order: string[] = [];

  const resolve = (name: string): number => {
    if (Object.prototype.hasOwnProperty.call(resolved, name)) return resolved[name];
    if (resolving.has(name)) {
      throw new Error(`常量循环引用：${[...order, name].join(" → ")}`);
    }
    const rawValue = raw[name];
    if (rawValue === undefined) throw new Error(`常量 "${name}" 未定义`);
    resolving.add(name);
    order.push(name);
    let value: number;
    try {
      value = typeof rawValue === "number" ? rawValue : evaluateExpression(rawValue, proxy);
    } finally {
      order.pop();
      resolving.delete(name);
    }
    if (!Number.isFinite(value)) throw new Error(`常量 "${name}" 的求值结果不是有限数`);
    resolved[name] = value;
    return value;
  };

  // proxy：把常量名解析为惰性求值，从而实现任意顺序与循环检测
  const proxy: Record<string, number> = {};
  for (const name of Object.keys(raw)) {
    Object.defineProperty(proxy, name, {
      enumerable: true,
      get: () => resolve(name),
    });
  }
  for (const name of Object.keys(raw)) resolve(name);
  return resolved;
}
