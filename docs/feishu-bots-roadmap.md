# 飞书机器人接入路线图

记录可以接入飞书群的通知/机器人方案，按优先级排序。

当前已接入：
- ✅ GitHub Webhook（push / pull_request）→ 飞书卡片通知
  - 后端路由：`POST /webhook/github`
  - 代码位置：[backend/app/api/github_webhook.py](../backend/app/api/github_webhook.py)
  - 环境变量：`FEISHU_WEBHOOK_URL`、`GITHUB_WEBHOOK_SECRET`（可选）

---

## 🟢 强烈推荐

### 1. Render 部署通知
后端部署成功/失败时推送到飞书。

- **接入路径**：Render → Service → Settings → Notifications → 加 Webhook
- **后端实现**：在 `backend/app/api/` 下加 `render_webhook.py`，路由 `POST /webhook/render`
- **价值**：服务挂了立刻知道，不用刷 Render 控制台

### 2. Vercel 部署通知
前端部署状态同步。

- **接入路径**：Vercel → Project Settings → Git → Deploy Hooks / Integrations
- **后端实现**：路由 `POST /webhook/vercel`
- **价值**：前端发布失败立刻可见

### 3. Sentry 错误监控 → 飞书
后端运行时异常自动告警。

- **接入路径**：Sentry 免费版 → Project Settings → Alerts → Webhook（飞书 incoming webhook 直连或经由后端转发）
- **后端集成**：`pip install sentry-sdk[fastapi]`，在 `main.py` 初始化
- **价值**：`/api/generate` 报错第一时间知道，不用等用户投诉

---

## 🟡 视需求添加

### 4. 服务存活监控（UptimeRobot / BetterStack）
定时 ping `/health`，离线告警到飞书。

- **特别提示**：Render 免费版有冷启动，会睡死，这个尤其值得加
- **工具推荐**：UptimeRobot 免费版（5 分钟一次）/ BetterStack（更灵活）

### 5. LLM 成本/用量日报
每天定时跑脚本统计 OpenAI / Gemini / DeepSeek / Fal 用量，推送到飞书。

- **实现方式**：cron job + 各 provider 的 usage API
- **价值**：多个 LLM 同时用，费用容易失控，需要每日观测

### 6. PPT 生成事件机器人（业务向）
每次用户生成 PPT，把 neighborhood / city / 用时 推送到飞书。

- **接入位置**：[backend/app/api/routes.py](../backend/app/api/routes.py) 的 `/api/generate` 路由
- **适用阶段**：早期用户少时观察用户行为最有用

---

## 🔵 进阶玩法

### 7. 飞书机器人当 PPT 生成入口
群里 `@机器人 生成北京朝阳的 PPT` → 调后端 API → 把 .pptx 文件发回群。

- **需要**：飞书自建应用（不是自定义机器人 webhook，是更完整的应用 + 事件订阅）
- **价值**：内部 demo 体验非常炫，老板/同事不用打开网页

### 8. GitHub Actions CI 通知
等之后加测试/CI 后接入，测试失败/通过推送飞书。

---

## 实现复用

所有 Render/Vercel/Sentry 等转发型集成都可以共用现有的 `_send_feishu()` 飞书发送函数（在 [github_webhook.py](../backend/app/api/github_webhook.py) 里），只是构造卡片的逻辑不同。

可以考虑把 `_send_feishu()` 抽到 `backend/app/integrations/feishu.py` 里复用。
