"""Rate limiter 实例，避免 main.py 与 routers 之间的循环导入。"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
