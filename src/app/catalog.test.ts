import { describe, expect, it } from "vitest";
import { validateRegistry } from "@/three/parts";
import { buildOrdersOf } from "./state/stageStore";
import { CATALOG, READY_MODELS, findModel } from "./catalog";

// ============================================================================
// catalog 契约测试：已交付模型的注册表必须零错误，动作/状态/参数必须自洽。
// 新模型（M-B 虎式起）必须过这一关才算"可加载"。
// ============================================================================

describe("catalog 契约", () => {
  it("已交付模型都能通过注册表校验（0 error）", () => {
    for (const model of READY_MODELS) {
      expect(model.registry, `${model.id} 缺少注册表`).toBeDefined();
      const errors = validateRegistry(model.registry!).filter((issue) => issue.level === "error");
      expect(errors.map((issue) => `${issue.code} ${issue.message}`)).toEqual([]);
    }
  });

  it("plan 卡片不得挂注册表（避免半成品被误加载）", () => {
    for (const model of CATALOG.filter((item) => item.status === "planned")) {
      expect(model.registry).toBeUndefined();
    }
  });

  it("动作引用必须自洽：常量存在、状态已声明、分组非空", () => {
    for (const model of READY_MODELS) {
      const constants = Object.keys(model.registry!.constants);
      const stateIds = new Set((model.states ?? []).map((state) => state.id));
      for (const action of model.actions ?? []) {
        expect(action.group.length, `${action.id} 缺分组`).toBeGreaterThan(0);
        if (action.kind === "param") {
          expect(constants, `${action.id} 引用了不存在的常量`).toContain(action.param);
        }
        if (action.kind === "machine-state") {
          expect([...stateIds], `${action.id} 引用了未声明的状态`).toContain(action.state);
        }
      }
      // 状态机的第一个状态是初始状态
      if (model.states?.length) {
        expect(stateIds.has(model.states[0].id)).toBe(true);
      }
    }
  });

  it("构建回放刻度来自注册表 build_order", () => {
    const orders = buildOrdersOf("test");
    expect(orders.length).toBeGreaterThan(0);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("findModel 对未知 id 抛错（防止静默回退）", () => {
    expect(() => findModel("不存在")).toThrow(/未知模型/);
  });
});
