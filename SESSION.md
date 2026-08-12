# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 架构分离：将 AI 决定与程序决定分开实现（2026-08-12 指示）

## 文件索引

### 新增模块
- `backend/app/services/slot_finder.py` — 候选空闲时段生成器（Rule Engine 组件）
- `backend/app/services/scheduling_engine.py` — 调度引擎（任务分配 + 记忆排序）
- `backend/app/services/validator.py` — 规划校验器（每日工作量、截止日期、时间合理性）

### 重构模块
- `backend/app/services/conflict.py` — 提取共享 `overlaps()` / `overlaps_with_any()` 函数，消除 planner.py 和 planner_v2.py 中的重复代码
- `backend/app/services/planner_v2.py` — 重构为 AI 理解层 + SchedulingEngine 调度
- `backend/app/services/planner.py` — 使用共享 `overlaps_with_any()` 替代私有 `_overlaps()`

### 新增测试
- `backend/tests/test_slot_finder.py` — 13 个测试
- `backend/tests/test_scheduling_engine.py` — 13 个测试
- `backend/tests/test_validator.py` — 9 个测试
- `backend/tests/test_conflict.py` — 更新 4 个测试

## Git 状态

- 当前分支 `main`，架构分离相关文件未提交。

## 架构变更

### 新架构流程

```
Planning Request
    ↓
┌─ LLM 理解层 ──┐   ┌─ Rule Engine ────────┐
│ planner_v2.py   │   │ slot_finder.py       │
│ 理解用户目标     │   │ 找空闲时间           │
│ 拆解任务         │   │ conflict.py          │
│ 输出任务理解     │   │ 检测冲突             │
│（类别/偏好/备注） │   │ validator.py         │
│ 生成解释         │   │ 检查每日工作量       │
└────────────────┘   │ 检查截止日期          │
    ↓                 │ 检查时间合理性        │
    └──┬──────────────┴──────────────────┘
       ↓
 Scheduling Engine（scheduling_engine.py）
  - 根据记忆偏好对候选时段打分排序
  - 按优先级分配任务到最优空闲时段
  - 调用 Validator 校验最终规划
       ↓
   Final Plan
       ↓
   Validator（validator.py）
```

### AI 职责（planner_v2.py 的 LLM 路径）
- 理解用户目标
- 输出任务理解（category, preferred_time, focus_level, notes）
- 生成规划解释（可选）
- 不再直接生成时间块

### Python 职责（新模块）
- slot_finder: 找空闲时间
- conflict: 检测冲突
- scheduling_engine: 根据记忆排序 + 分配任务
- validator: 检查每日工作量、截止日期、时间合理性

## 验证结果

- 全部 75 个测试通过（36 个原有 + 39 个新增）
- 原有 API 向后兼容

## 交接要点

- 项目定义与长期状态见 `.project-to-act/PROJECT_OVERVIEW.md`
- 架构分离已完成，AI 路径和本地 fallback 路径均使用 SchedulingEngine
- LLM 不再直接生成时间块，只输出任务理解
- 下一步可优化：scheduling_engine 的评分函数增加更多记忆维度
