"""pytest 全局隔离：本机测试日志绝不直发到 Axiom。

本机 .env.local 同样配置了 Axiom 凭据（与生产同一个 dataset），而测试用例会
故意制造失败事件（如 test_scan_reminders_logs_fetch_error 的 reminder.scan.error）
并经 log_shipper 直发，导致生产监控收到假告警。这里用环境变量关闭直发——
环境变量优先级高于 .env.local，故 Settings() 默认即停发。

需要验证直发逻辑的用例（test_log_shipper.py）自行显式传 log_ship_enabled=True，
并 monkeypatch 掉 httpx.post，不受影响。
"""

from __future__ import annotations

import os

os.environ["LOG_SHIP_ENABLED"] = "false"
