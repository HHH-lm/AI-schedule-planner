"""微信推送通道：企业微信机器人 / PushPlus / Server酱。"""

from __future__ import annotations

import httpx

from app.config import Settings


PUSH_TIMEOUT = 10.0


def push_channel_ready(settings: Settings) -> bool:
    channel = settings.wechat_push_type
    if channel == "wecom":
        return bool(settings.wecom_webhook_url)
    if channel == "pushplus":
        return bool(settings.pushplus_token)
    if channel == "serverchan":
        return bool(settings.serverchan_key)
    return False


async def push_wechat_message(
    message: str,
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None = None,
) -> bool:
    """向配置的微信通道发送文本消息，返回是否发送成功。"""
    channel = settings.wechat_push_type
    if channel == "wecom":
        if not settings.wecom_webhook_url:
            return False
        url = settings.wecom_webhook_url
        payload: dict[str, object] = {
            "msgtype": "text",
            "text": {"content": message},
        }
        as_form = False
    elif channel == "pushplus":
        if not settings.pushplus_token:
            return False
        url = "https://www.pushplus.plus/send"
        payload = {
            "token": settings.pushplus_token,
            "title": "AI 日程提醒",
            "content": message,
        }
        as_form = False
    elif channel == "serverchan":
        if not settings.serverchan_key:
            return False
        url = f"https://sctapi.ftqq.com/{settings.serverchan_key}.send"
        payload = {"title": "AI 日程提醒", "desp": message}
        as_form = True
    else:
        return False

    async with httpx.AsyncClient(timeout=PUSH_TIMEOUT, transport=transport) as client:
        response = await client.post(url, data=payload if as_form else None, json=None if as_form else payload)
    if channel == "pushplus":
        # PushPlus 即使 HTTP 200，也可能返回业务错误码（如 905 未实名认证），
        # 必须按 code 判断，否则会误写去重记录且微信永远收不到。
        try:
            body = response.json()
        except ValueError:
            return False
        return response.status_code < 400 and isinstance(body, dict) and body.get("code") == 200
    return response.status_code < 400
