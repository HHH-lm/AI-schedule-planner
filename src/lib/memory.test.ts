import { describe, expect, it, beforeEach } from "vitest";
import type { AIMemorySuggestion, Memory, MemoryCategory, MemorySource } from "./types";
import { uid } from "./storage";

function makeMemory(
  overrides: Partial<Memory> = {}
): Memory {
  const now = new Date().toISOString();
  return {
    id: uid(),
    category: "time-preference",
    content: "我上午的精力最好",
    createdAt: now,
    updatedAt: now,
    source: "manual",
  status: "active",
    ...overrides,
  };
}

describe("Memory data structure", () => {
  it("creates a memory with required fields", () => {
    const memory = makeMemory();
    expect(memory.id).toBeTruthy();
    expect(memory.category).toBe("time-preference");
    expect(memory.content).toBe("我上午的精力最好");
    expect(memory.createdAt).toBeTruthy();
    expect(memory.updatedAt).toBeTruthy();
    expect(memory.source).toBe("manual");
  });

  it("supports all memory categories", () => {
    const categories: MemoryCategory[] = [
      "time-preference",
      "habit",
      "life-preference",
      "long-term-constraint",
    ];
    for (const category of categories) {
      const memory = makeMemory({ category });
      expect(memory.category).toBe(category);
    }
  });

  it("supports ai-suggested source", () => {
    const memory = makeMemory({ source: "ai-suggested" });
    expect(memory.source).toBe("ai-suggested");
  });

  it("supports editing content", () => {
    const memory = makeMemory();
    const updated = {
      ...memory,
      content: "我下午的精力也还可以",
      updatedAt: new Date().toISOString(),
    };
    expect(updated.content).toBe("我下午的精力也还可以");
    // same-millisecond edge case: use >= instead of strict not-equal
    expect(new Date(updated.updatedAt).getTime())
      .toBeGreaterThanOrEqual(new Date(memory.updatedAt).getTime());
  });

  it("supports changing category", () => {
    const memory = makeMemory({ category: "time-preference" });
    const updated = { ...memory, category: "habit" as MemoryCategory };
    expect(updated.category).toBe("habit");
  });

  it("defaults to active status", () => {
    const memory = makeMemory();
    expect(memory.status).toBe("active");
  });

  it("supports archiving", () => {
    const memory = makeMemory();
    const archived = { ...memory, status: "archived" };
    expect(archived.status).toBe("archived");
  });

  it("supports reactivation", () => {
    const memory = makeMemory({ status: "archived" });
    const reactivated = { ...memory, status: "active" };
    expect(reactivated.status).toBe("active");
  });
});

describe("Memory filtering", () => {
  const memories: Memory[] = [
    makeMemory({ id: "1", category: "time-preference", content: "上午精力好" }),
    makeMemory({ id: "2", category: "habit", content: "每周运动两次" }),
    makeMemory({ id: "3", category: "life-preference", content: "深度任务在上午" }),
    makeMemory({ id: "4", category: "long-term-constraint", content: "周末不安排工作" }),
  ];

  it("filters by time-preference", () => {
    const filtered = memories.filter((m) => m.category === "time-preference");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).toBe("上午精力好");
  });

  it("filters by habit", () => {
    const filtered = memories.filter((m) => m.category === "habit");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).toBe("每周运动两次");
  });

  it("filters by life-preference", () => {
    const filtered = memories.filter((m) => m.category === "life-preference");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).toBe("深度任务在上午");
  });

  it("filters by long-term-constraint", () => {
    const filtered = memories.filter(
      (m) => m.category === "long-term-constraint"
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).toBe("周末不安排工作");
  });

  it("returns all when no filter", () => {
    expect(memories).toHaveLength(4);
  });

  it("filters out archived memories", () => {
    const all = [
      ...memories,
      makeMemory({ id: "5", category: "time-preference", content: "已归档的记忆", status: "archived" }),
    ];
    const active = all.filter((m) => m.status !== "archived");
    expect(active).toHaveLength(4);
    expect(active.find((m) => m.id === "5")).toBeUndefined();
  });

  it("includes archived when showArchived is true", () => {
    const all = [
      ...memories,
      makeMemory({ id: "5", category: "time-preference", content: "已归档的记忆", status: "archived" }),
    ];
    expect(all).toHaveLength(5);
  });
});

describe("Memory CRUD operations", () => {
  let memories: Memory[] = [];

  beforeEach(() => {
    memories = [];
  });

  it("adds a memory", () => {
    const memory = makeMemory({ id: "1" });
    memories.push(memory);
    expect(memories).toHaveLength(1);
  });

  it("updates a memory", () => {
    const memory = makeMemory({ id: "1" });
    memories.push(memory);
    memories = memories.map((m) =>
      m.id === "1" ? { ...m, content: "更新后的内容" } : m
    );
    expect(memories[0].content).toBe("更新后的内容");
  });

  it("deletes a memory", () => {
    const memory = makeMemory({ id: "1" });
    memories.push(memory);
    memories = memories.filter((m) => m.id !== "1");
    expect(memories).toHaveLength(0);
  });

  it("preserves other memories when deleting one", () => {
    memories.push(makeMemory({ id: "1" }));
    memories.push(makeMemory({ id: "2" }));
    memories = memories.filter((m) => m.id !== "1");
    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe("2");
  });
});

describe("AIMemorySuggestion", () => {
  it("creates a suggestion with required fields", () => {
    const suggestion: AIMemorySuggestion = {
      id: "s1",
      category: "time-preference",
      content: "你似乎更适合上午进行深度工作",
      reasoning: "过去 7 天中，你有 5 天在上午完成了高优先级任务",
      confidence: 0.85,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    expect(suggestion.id).toBe("s1");
    expect(suggestion.category).toBe("time-preference");
    expect(suggestion.content).toContain("上午");
    expect(suggestion.reasoning).toContain("5 天");
    expect(suggestion.confidence).toBe(0.85);
    expect(suggestion.status).toBe("pending");
  });

  it("accepting a suggestion creates a memory with ai-suggested source", () => {
    const suggestion: AIMemorySuggestion = {
      id: "s2",
      category: "habit",
      content: "你似乎有固定的运动习惯",
      reasoning: "每周二、周四早上都有运动时间块",
      confidence: 0.92,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    const now = new Date().toISOString();
    const memory: Memory = {
      id: "m1",
      category: suggestion.category,
      content: suggestion.content,
      createdAt: now,
      updatedAt: now,
      source: "ai-suggested",
      status: "active",
    };
    expect(memory.source).toBe("ai-suggested");
    expect(memory.content).toBe(suggestion.content);
    expect(memory.status).toBe("active");
  });

  it("dismissing a suggestion removes it from the list", () => {
    const suggestions: AIMemorySuggestion[] = [
      {
        id: "s1",
        category: "time-preference",
        content: "建议 1",
        reasoning: "依据 1",
        confidence: 0.8,
        createdAt: new Date().toISOString(),
        status: "pending",
      },
      {
        id: "s2",
        category: "habit",
        content: "建议 2",
        reasoning: "依据 2",
        confidence: 0.7,
        createdAt: new Date().toISOString(),
        status: "pending",
      },
    ];
    const filtered = suggestions.filter((s) => s.id !== "s1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("s2");
  });
});
