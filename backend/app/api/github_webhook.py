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


def _stat_col(content: str) -> dict:
    return {
        "tag": "column",
        "width": "weighted",
        "weight": 1,
        "vertical_align": "center",
        "elements": [{"tag": "div", "text": {"tag": "lark_md", "content": content}}],
    }


def _card_push(payload: dict) -> dict:
    pusher = payload.get("pusher", {}).get("name", "unknown")
    branch = payload.get("ref", "").replace("refs/heads/", "")
    commits = payload.get("commits", [])
    compare_url = payload.get("compare", "")
    head_commit = payload.get("head_commit") or {}
    forced = payload.get("forced", False)

    head_msg = ""
    if commits:
        head_msg = commits[-1].get("message", "").splitlines()[0]

    n = len(commits)
    suffix = f" (+{n - 1})" if n > 1 else ""

    files: set[str] = set()
    for c in commits:
        files.update(c.get("added", []))
        files.update(c.get("modified", []))
        files.update(c.get("removed", []))
    n_files = len(files)

    title_prefix = "⚠️ Force-push" if forced else "🚀"
    title = f"{title_prefix} {branch} · {head_msg}{suffix}" if head_msg else f"{title_prefix} {branch} · {n} commits"
    if len(title) > 90:
        title = title[:87] + "..."

    elements: list = [{
        "tag": "column_set",
        "flex_mode": "stretch",
        "horizontal_spacing": "default",
        "columns": [
            _stat_col(f"👤 **{pusher}**"),
            _stat_col(f"📦 {n} commits"),
            _stat_col(f"⌁ {n_files} files"),
        ],
    }]

    if n > 1:
        commit_lines = "\n".join(
            f"· `{c['id'][:7]}` {c['message'].splitlines()[0]}" for c in commits[-5:][::-1]
        )
        if n > 5:
            commit_lines += f"\n· ... 共 {n} 个提交"
        elements.append({"tag": "div", "text": {"tag": "lark_md", "content": commit_lines}})

    elements.append({
        "tag": "note",
        "elements": [{"tag": "lark_md", "content": f"pushed to `{branch}`"}],
    })

    actions = [{
        "tag": "button",
        "text": {"tag": "plain_text", "content": "查看对比"},
        "url": compare_url,
        "type": "primary",
    }]
    head_url = head_commit.get("url")
    if head_url:
        actions.append({
            "tag": "button",
            "text": {"tag": "plain_text", "content": "最新提交"},
            "url": head_url,
            "type": "default",
        })
    elements.append({"tag": "action", "actions": actions})

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
    pr_title = pr.get("title", "")
    pr_number = pr.get("number", "")
    user = pr.get("user", {}).get("login", "unknown")
    url = pr.get("html_url", "")
    base = pr.get("base", {}).get("ref", "")
    head = pr.get("head", {}).get("ref", "")
    additions = pr.get("additions", 0)
    deletions = pr.get("deletions", 0)
    changed_files = pr.get("changed_files", 0)
    comments = pr.get("comments", 0) + pr.get("review_comments", 0)
    reviewers = [r.get("login", "") for r in pr.get("requested_reviewers", []) if r.get("login")]

    icon, verb, template = {
        "opened": ("📬", "opened", "orange"),
        "reopened": ("📬", "reopened", "orange"),
        "review_requested": ("👀", "review requested", "orange"),
    }.get(action, ("🔀", action, "grey"))

    if action == "closed":
        if pr.get("merged"):
            icon, verb, template = "✅", "merged", "green"
        else:
            icon, verb, template = "🚫", "closed", "grey"

    title = f"{icon} #{pr_number} {verb} · {pr_title}"
    if len(title) > 90:
        title = title[:87] + "..."

    elements: list = [
        {
            "tag": "column_set",
            "flex_mode": "stretch",
            "horizontal_spacing": "default",
            "columns": [
                _stat_col(f"👤 **{user}**"),
                _stat_col(f"`{head}` → `{base}`"),
            ],
        },
        {
            "tag": "column_set",
            "flex_mode": "stretch",
            "horizontal_spacing": "default",
            "columns": [
                _stat_col(f"💬 {comments}"),
                _stat_col(f"📄 {changed_files} files"),
                _stat_col(f"<font color='green'>+{additions}</font> / <font color='red'>−{deletions}</font>"),
            ],
        },
    ]

    if reviewers:
        mentions = " ".join(f"@{r}" for r in reviewers)
        elements.append({
            "tag": "div",
            "text": {"tag": "lark_md", "content": f"**Reviewers:** {mentions}"},
        })

    elements.append({
        "tag": "action",
        "actions": [
            {
                "tag": "button",
                "text": {"tag": "plain_text", "content": "查看 PR"},
                "url": url,
                "type": "primary",
            },
            {
                "tag": "button",
                "text": {"tag": "plain_text", "content": "Files changed"},
                "url": f"{url}/files",
                "type": "default",
            },
        ],
    })

    return {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {"tag": "plain_text", "content": title},
                "template": template,
            },
            "elements": elements,
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
