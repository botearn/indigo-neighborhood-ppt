# 图片生成 Job 架构

## 目标

Indigo 一套 deck 需要 6 个 beat × 4 张图片。图片生成不再依赖一个长时间 HTTP
请求，而是拆成可查询、可取消、可局部重试的后台任务。

## 请求流程

1. 客户端调用 `POST /api/indigo/image-jobs`，服务端创建 Job 并返回 HTTP 202。
2. FastAPI 将缺失图片拆成独立 Celery task，写入 Redis 队列。
3. Fly `worker` process group 以固定并发执行图片任务。
4. 每张图片完成后，worker 将 URL 或错误写回 Redis。
5. 客户端查询 `GET /api/indigo/image-jobs/{job_id}` 获取渐进进度和当前 story。
6. Job 完成后，FastAPI 将最终 story 幂等同步到对应用户历史。

主图任务排在 Mood、设计灵感和空间细节之前，因此前端接入 Job API 后可以优先展示
六张主图。

创建 Job 时，返回的 story 会写入 `image_job_id`。关联历史也立即保存这个 ID，因此
用户关闭或刷新页面后仍能从历史记录恢复正在执行的任务。

## API

### 创建

```http
POST /api/indigo/image-jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "story_unit": {},
  "history_id": "optional-history-id"
}
```

响应为 HTTP 202，状态可能是 `queued`、`running`、`completed` 或 `partial`。

### 查询

```http
GET /api/indigo/image-jobs/{job_id}
Authorization: Bearer <token>
```

Job 严格按用户隔离。响应包含 `total`、`completed`、`failed`、当前 `story` 和单图
错误映射。

### 失败重试与取消

```http
POST /api/indigo/image-jobs/{job_id}/retry
DELETE /api/indigo/image-jobs/{job_id}
```

重试只提交失败目标；取消不会强制杀死正在执行的 provider 请求，但会撤销尚未开始的
Celery task，并拒绝写入晚到结果。

## 可靠性约束

- Redis 是 Job 状态和 task result 的权威存储，默认保留 7 天。
- Celery 使用 late acknowledgement、worker-lost reject 和单任务预取。
- Relay 请求携带稳定 `Idempotency-Key`。
- `429`、网络错误和 `5xx` 使用指数退避重试，默认最多 3 次。
- 旧 `/api/indigo/images` 接口继续可用，并改为可配置的有界并发。
- 当前 SQLite Volume 只挂载给 `web` process；worker 不直接访问 SQLite。

## 自动化部署

本次交付包含 Job API 和 worker 代码，同时让旧同步接口使用有界并发；不会自动启用
付费 Redis 和 worker，因此不影响当前生产部署。

启用异步 Job 前需要：

1. 确认 Redis 和 Fly worker 的费用。
2. 在 GitHub Actions 手动运行 `Provision Image Job Infrastructure`。
3. 输入 `PROVISION`，选择 Redis plan。
4. Workflow 自动创建 Redis，并将 `REDIS_URL` 以 staged secret 写入 Fly。
5. 通过后续基础设施 PR 在 `backend/fly.toml` 启用 Celery `worker` process group。
6. 由 `Deploy Backend to Fly.io` 自动部署 Web + Worker。

禁止在服务器上手动创建、配置或启动 worker。部署和运行时配置必须经上述 Workflow。

## 后续 PR

- 前端切换到 Job API，逐张显示进度并支持刷新恢复。
- 图片写入 Tigris/S3，避免 provider 临时 URL 或 base64 长期进入历史。
- 增加队列等待、单图延迟、429、重试次数、成功率和成本指标。
