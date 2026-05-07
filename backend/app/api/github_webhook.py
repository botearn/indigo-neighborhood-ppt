import hashlib
import hmac
from fastapi import APIRouter, HTTPException, Request
from app.core.config import settings
from app.integrations.feishu import send_card

router = APIRouter(prefix="/webhook")


def _verify_signature(body: bytes, signature: str) -> bool:
    if not settings.github_webhook_secret:
        return True
    expected = "sha256=" + hmac.new(
        settings.github_webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _card_push(payload: dict) -> dict:
    repo_name = payload.get("repository", {}).get("name", "")
    pusher = payload.get("pusher", {}).get("name", "unknown")
    branch = payload.get("ref", "").replace("refs/heads/", "")
    commits = payload.get("commits", [])
    compare_url = payload.get("compare", "")
    forced = payload.get("forced", False)

    head_msg = ""
    if commits:
        head_msg = commits[-1].get("message", "").splitlines()[0]

    n = len(commits)
    suffix = ""
    if n > 1:
        suffix = f" (+{n - 1})"

    title_prefix = "⚠️ Force-push" if forced else "🚀"
    title = f"{title_prefix} {repo_name}/{branch} · {head_msg}{suffix}" if head_msg else f"{title_prefix} {repo_name}/{branch} · {n} commits"
    if len(title) > 90:
        title = title[:87] + "..."

    elements: list = []
    if n > 1:
        commit_lines = "\n".join(
            f"· `{c['id'][:7]}` {c['message'].splitlines()[0]}" for c in commits[-5:][::-1]
        )
        if n > 5:
            commit_lines += f"\n· ... 共 {n} 个提交"
        elements.append({"tag": "div", "text": {"tag": "lark_md", "content": commit_lines}})

    elements.append({
        "tag": "note",
        "elements": [{"tag": "lark_md", "content": f"由 **{pusher}** 推送 · `{branch}`"}],
    })

    elements.append({
        "tag": "action",
        "actions": [
            {
                "tag": "button",
                "text": {"tag": "plain_text", "content": "查看对比"},
                "url": compare_url,
                "type": "default",
            }
        ],
    })

    return {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {"tag": "plain_text", "content": title},
                "template": "red" if forced else "blue",
            },
            "elements": elements,
        },
    }


def _card_pr(payload: dict) -> dict:
    action = payload.get("action", "")
    pr = payload.get("pull_request", {})
    repo_name = payload.get("repository", {}).get("name", "")
    pr_title = pr.get("title", "")
    pr_number = pr.get("number", "")
    user = pr.get("user", {}).get("login", "unknown")
    url = pr.get("html_url", "")
    base = pr.get("base", {}).get("ref", "")
    head = pr.get("head", {}).get("ref", "")

    icon, verb, template = {
        "opened": ("📬", "opened", "orange"),
        "reopened": ("📬", "reopened", "orange"),
        "review_requested": ("👀", "review requested", "yellow"),
    }.get(action, ("🔀", action, "grey"))

    if action == "closed":
        if pr.get("merged"):
            icon, verb, template = "✅", "merged", "green"
        else:
            icon, verb, template = "🚫", "closed", "grey"

    title = f"{icon} {repo_name} #{pr_number} {verb} · {pr_title}"
    if len(title) > 90:
        title = title[:87] + "..."

    return {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {"tag": "plain_text", "content": title},
                "template": template,
            },
            "elements": [
                {
                    "tag": "note",
                    "elements": [{"tag": "lark_md", "content": f"**{user}** · `{head}` → `{base}`"}],
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

    await send_card(card)
    return {"status": "ok"}
