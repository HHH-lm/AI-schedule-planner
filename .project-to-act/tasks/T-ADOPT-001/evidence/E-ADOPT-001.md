# 证据 E-ADOPT-001：既有项目采用

- 时间：2026-08-08T10:51:25Z
- 验证方法：
  - `python3 <project-to-act>/scripts/init_project_management.py --project-root <项目根> --check`，退出 0，结果 `managed`
  - `python3 <project-to-act>/scripts/init_project_management.py --project-root <项目根> --validate`，退出 0，结果 `valid: true`
  - `python3 <develop-ai-agents>/scripts/manage_lifecycle.py --project-root <项目根> init --project-id ai-schedule-system --project-name "AI日程管理与个性化规划系统"`，退出 0，创建 revision 0
  - `python3 <develop-ai-agents>/scripts/manage_lifecycle.py --project-root <项目根> adopt --stage 5 --task-id T-ADOPT-001 --evidence E-ADOPT-001 --summary ...`，退出 0，revision 1，currentStage 5，status ready
  - `find src -type f | wc -l`，结果 18
  - `git log --oneline -15`，结果：当前分支 main 没有任何提交
- 代码版本或文件哈希：
  - `package.json`：`bcaf8b37dc1a30c282b449d7a36ac3ebd409498e85686298e95253bddf3e9e4f`
  - `src/lib/nlp.ts`：`e12ad5c9310d2061cb3b9a98515cb391d09ea93e5a19eeaf3bd69f2dcb1df6de`
  - `src/lib/types.ts`：`c48caf5c45554bb5d0f961b3a213a63562f8cbde941781ab9b5d1da61a709dc6`
  - `src/lib/storage.ts`：`82d288c597350b1c13f6fd947fbba250e4a8fc6b0b11fa3a798d66490f184c49`
  - `src/lib/report.ts`：`a6edddeb88156192956fafe02bb53a3553360d57797cab368fd5ca194c91b7ee`
  - `src/app/page.tsx`：`5c1597efb0860660de81b70f224e8f00fc5e5769b76dd0102d30ed6991917ed2`
- 结果摘要：项目为 Next.js 应用，package.json 版本 0.1.0，18 个源文件，无任何测试文件；Git 无提交；阶段 0-4 标记 legacy_unverified，阶段 5 采用为 ready。
- 证据位置：`.project-to-act/tasks/T-ADOPT-001/evidence/E-ADOPT-001.md`
- 有效期：2026-08-15，或下次 src/package.json 文件哈希变化时失效。
