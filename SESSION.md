# SESSION.md

> Coding-Tool 会话工作记忆。项目长期事实源见 `.project-to-act/PROJECT_OVERVIEW.md`。

## 当前目标

- 完成 FastAPI/Python 后端重构：AI 任务解析、任务拆解、时间规划、冲突检测、AI 调用全部迁移到 `backend/`，前端通过 `/api/v1/*` 代理调用（2026-08-10 指示）。

## 文件索引

- 新增：`backend/`（FastAPI 应用与 pytest）、`src/lib/api.ts`、`.project-to-act/tasks/T-013/`
- 修改：`src/components/QuickAdd.tsx`、`src/components/TaskBoard.tsx`、`src/app/page.tsx`、`src/lib/board.ts`、`src/lib/security.test.ts`、`next.config.mjs`、`scripts/dev.sh`、`scripts/scan-secrets.sh`、`package.json`、`.env.example`、`README.md`、`docs/operations.md`、`docs/security.md`、`.project-to-act/` 账本文档
- 删除：前端本地实现 `src/lib/nlp.ts`、`src/lib/ai-parse.ts`、`src/lib/schedule-conflict.ts` 及对应测试、`src/app/api/parse/`
- 未改功能逻辑：拖拽、撤销/重做、Supabase 云同步保持原行为；本地 NLP 规则移到后端作为 API 回退。

## Git 状态

- 当前分支 `main`，T-013 FastAPI 后端重构改动尚未提交。
- 工作区原有未跟踪文件 `DESIGN.md`、用户未提交的 T-011/T-012 相关改动，均未动。

## 决策

- 新增 `backend/` FastAPI 项目：路由 `/api/v1/{parse,breakdown,plan,conflicts/check,health}`，服务层用 Python 实现 NLP、AI 调用、冲突检测、任务拆解与时间规划。
- OpenAI 与 DeepSeek 均按 OpenAI 兼容协议调用；未配置 Key 时由后端本地 NLP 规则回退，前端不再保留解析实现。
- Next.js 通过 `next.config.mjs` rewrites 把 `/api/v1/*` 代理到 `BACKEND_URL`（默认 `http://127.0.0.1:8000`）。
- `scripts/dev.sh` 同时启动 FastAPI（8000）与 Next.js（3000），复用防多实例逻辑。
- 生产构建改用 `next build --turbopack`：Next.js webpack 在含中文/空格的项目路径下触发 Client Manifest 构建错误，Turbopack 可正常构建，且保留无已知 CVE 的 next 15.5.23。
- 任务看板“拆解”与“AI 规划”均调用后端；新增时间块先由后端冲突检测过滤，冲突时弹窗提示。

## 验证结果

- 已通过：`cd backend && .venv/bin/python -m pytest -q`（22 测试）、`npm test`（12 文件 52 测试）、`npm run lint`、`npx tsc --noEmit`、`npm run build`（Turbopack）、`npm run scan:secrets`（5 项 PASS）。
- dev 联动验证：`/api/v1/health` 返回 ok；`/api/v1/parse` 经代理调用 DeepSeek 成功；`/api/v1/breakdown`、`/api/v1/plan`、`/api/v1/conflicts/check` 均返回预期结果。
- 项目定义与长期状态见 `.project-to-act/PROJECT_OVERVIEW.md`；证据见 `.project-to-act/tasks/T-013/evidence/E-T013-001.md`。
