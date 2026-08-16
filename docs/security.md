# 安全评测与防护基线

> 适用范围：AI日程管理与个性化规划系统 v0.1.0（Next.js 前端 + FastAPI/Python 后端）。本文件记录输入安全评测方法、运行方式与当前结论。

## 评测范围

- 注入样本：HTML/script 标签、事件属性、SQL 片段、危险协议字符串
- 边界输入：超长文本、控制字符、纯符号
- 渲染安全：React 默认转义，项目内未使用 `dangerouslySetInnerHTML`、`document.write`、`eval`
- 链接协议：Obsidian 跳转只接受 `obsidian://`，参数使用 `encodeURIComponent`
- 密钥泄漏：扫描已跟踪文件中的 API key（含 `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`）、微信推送凭据（`WECOM_WEBHOOK_URL` / `PUSHPLUS_TOKEN` / `SERVERCHAN_KEY`）、高熵 token、私钥块与带值环境变量

## 运行方式

```bash
npm test                # 单元测试，含 src/lib/security.test.ts 危险输入样本
cd backend && .venv/bin/python -m pytest -q   # 后端测试，含 Python NLP 拒答与清洗样本
npm run scan:secrets    # 密钥与危险 API 扫描，发现泄漏时退出码非 0
```

## 当前结论

- 危险输入不会让前端解析流程崩溃或执行；自然语言解析与 AI 调用已迁移到 FastAPI/Python 后端，后端按白名单清洗时间、日期与类目
- AI 请求体只包含用户文本与服务商选择，输入长度受限（2000 字），FastAPI 后端调用 OpenAI / DeepSeek 后按白名单清洗结果
- Obsidian 协议白名单与 URL 编码生效
- 密钥扫描未发现已跟踪文件中的凭据；真实 `.env` 文件未被 Git 跟踪
- 渲染路径未发现危险 API

## 已知残余风险

- 本地存储模式无服务端校验，数据可信边界为浏览器本地
- Supabase 云同步依赖 Email Auth 登录；RLS 已按 `auth.uid()` 启用，未登录客户端无法访问云端数据
- NLP 拒答规则已评测（见 T-010）：无意义输入不再生成默认时间块，QuickAdd 显示明确拒绝原因
- 启用 OpenAI / DeepSeek 后，用户输入的自然语言文本会发送到对应第三方服务；API Key 只保存在 FastAPI 后端环境变量，不写入浏览器与 Git
- 定时提醒使用 Supabase service role key 读取云端数据，并把提醒内容发送到微信通道；service role key 与微信凭据只保存在 FastAPI 后端环境变量，`reminder_log` 仅后端可写
