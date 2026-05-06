import hashlib
import hmac
import httpx
from fastapi import APIRouter, HTTPException, Request
from app.core.config import settings

router = APIRouter(prefix="/webhook")


def _verify_signature(body: bytes, signature: str) -> bool:
    if not settings.github_webhook_secret:
        return True
    expected = "sha256=" + hmac.new(
        settings.github_webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _send_feishu(card: dict):
    if not settings.feishu_webhook_url:
        raise HTTPException(status_code=500, detail="FEISHU_WEBHOOK_URL not configured")
    async with httpx.AsyncClient() as client:
        resp = await client.post(settings.feishu_webhook_url, json=card, timeout=10)
        resp.raise_for_status()


def _card_push(payload: dict) -> dict:
    repo = payload.get("repository", {}).get("full_name", "")
    pusher = payload.get("pusher", {}).get("name", "unknown")
    branch = payload.get("ref", "").replace("refs/heads/", "")
    commits = payload.get("commits", [])
    compare_url = payload.get("compare", "")

    commit_lines = "\n".join(
        f"· [{c['id'][:7]}] {c['message'].splitlines()[0]}" for c in commits[:5]
    )
    if len(commits) > 5:
        commit_lines += f"\n· ... 共 {len(commits)} 个提交"

    return {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {"tag": "plain_text", "content": f"🚀 {repo} 新推送"},
                "template": "blue",
            },
            "elements": [
                {
                    "tag": "div",
                    "fields": [
                        {"is_short": True, "text": {"tag": "lark_md", "content": f"**推送者**\n{pusher}"}},
                        {"is_short": True, "text": {"tag": "lark_md", "content": f"**分支**\n{branch}"}},
                    ],
                },
                {"tag": "div", "text": {"tag": "lark_md", "content": f"**提交记录**\n{commit_lines}"}},
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "查看对比"},
                            "url": compare_url,
                            "type": "default",
                        }
                    ],
                },
            ],
        },
    }


def _card_pr(payload: dict) -> dict:
    action = payload.get("action", "")
    pr = payload.get("pull_request", {})
    repo = payload.get("repository", {}).get("full_name", "")
    title = pr.get("title", "")
    user = pr.get("user", {}).get("login", "unknown")
    url = pr.get("html_url", "")
    base = pr.get("base", {}).get("ref", "")
    head = pr.get("head", {}).get("ref", "")

    action_text = {
        "opened": "新建了 PR",
        "closed": "合并了 PR" if pr.get("merged") else "关闭了 PR",
        "reopened": "重新打开了 PR",
        "review_requested": "请求了 Review",
    }.get(action, action)

    template = "green" if action == "closed" and pr.get("merged") else "orange"

    return {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {"tag": "plain_text", "content": f"🔀 {repo} · {action_text}"},
                "template": template,
            },
            "elements": [
                {"tag": "div", "text": {"tag": "lark_md", "content": f"**{title}**"}},
                {
                    "tag": "div",
                    "fields": [
                        {"is_short": True, "text": {"tag": "lark_md", "content": f"**提交者**\n{user}"}},
                        {"is_short": True, "text": {"tag": "lark_md", "content": f"**分支**\n`{head}` → `{base}`"}},
                    ],
                },
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "查看 PR"},
                            "url": url,
                            "type": "default",
                        }
                    ],
                },
            ],
        },
    }


@router.post("/github")
async def github_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("x-hub-signature-256", "")
    if not _verify_signature(body, sig):
        raise HTTPException(status_code=401, detail="invalid signature")

    event = request.headers.get("x-github-event", "")
    payload = await request.json()

    if event == "push":
        # ignore branch deletion
        if payload.get("deleted"):
            return {"status": "ignored"}
        card = _card_push(payload)
    elif event == "pull_request":
        action = payload.get("action", "")
        if action not in ("opened", "closed", "reopened", "review_requested"):
            return {"status": "ignored"}
        card = _card_pr(payload)
    else:
        return {"status": "ignored"}

    await _send_feishu(card)
    return {"status": "ok"}
