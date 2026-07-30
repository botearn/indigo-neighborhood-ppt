# 图片生成 Job 架构

## 目标与成本边界

Indigo 一套 deck 需要 6 个 beat × 4 张图片。图片生成使用可查询、可取消、可局部
重试的异步 Job，但 demo 阶段不新增 Redis、独立 worker 或对象存储费用。

任务复用已有资源：

- Fly FastAPI `app` 进程内的固定大小线程池执行图片任务。
- 已有 `/data/indigo.db` SQLite 保存 Job、结果和错误状态。
- 已有 `indigo_data` Volume 的 `/data/image-jobs` 保存压缩 JPEG。

这里的“零新增基础设施”只表示异步能力不再增加 Redis、独立 worker 或对象存储账单。
图片模型调用、现有 Fly `app` 和既有 Volume 仍按原有套餐与用量计费。

## 请求流程

1. 客户端调用 `POST /api/indigo/image-jobs`，服务端持久化 Job 并返回 HTTP 202。
2. FastAPI 将缺失图片提交到进程内线程池，主图优先。
3. 每张图片生成后被压缩为 JPEG，并原子写入 `/data/image-jobs`。
4. SQLite 只保存短图片 URL、状态和错误，不保存 provider base64。
5. 一键与逐步前端查询 `GET /api/indigo/image-jobs/{job_id}`，逐张更新当前 story。
6. Job 完成后，FastAPI 将最终 story 幂等同步到对应用户历史。

创建 Job 时，返回的 story 会写入 `image_job_id`。关联历史也立即保存这个 ID，因此
用户关闭或刷新页面后仍能恢复任务。

## API

```http
POST /api/indigo/image-jobs
GET /api/indigo/image-jobs/{job_id}
POST /api/indigo/image-jobs/{job_id}/retry
DELETE /api/indigo/image-jobs/{job_id}
GET /api/indigo/image-assets/{opaque-name}.jpg
```

除使用不可猜测文件名的图片读取接口外，Job 接口都要求 Bearer token，并按用户隔离。
响应包含 `total`、`completed`、`failed`、当前 `story` 和单图错误映射。

## 可靠性约束

- SQLite 使用 WAL、独立连接和 busy timeout 支持 Web 请求与生成线程并发。
- Relay 请求携带稳定 `Idempotency-Key`。
- `429`、网络错误和 `5xx` 使用指数退避重试，默认最多 3 次。
- 取消不会强杀正在执行的 provider 请求，但拒绝写入晚到结果。
- 应用启动时将残留 `running` Job 恢复为 `queued` 并继续缺失目标。
- 前端连续 5 次轮询失败后暂停自动重试，避免异常接口被无限请求。
- 旧 `/api/indigo/images` 同步接口继续可用，并使用有界并发。

## 休眠行为

Fly `app` 保持原有自动休眠配置。用户生成期间的轮询流量会保持机器活跃；如果用户关闭
页面并触发 Fly 休眠，任务会暂停。用户再次打开页面后，机器启动并从 SQLite 恢复任务。

这个行为保留了异步和刷新恢复能力，也避免为了 demo 支付常驻 worker 费用。它不承诺
无人访问时仍持续执行；需要这种保证时，应重新评估托管队列和 worker 的成本。

## 自动化部署

`Deploy Backend to Fly.io` Workflow 会：

1. 确认已有 `indigo_data` Volume。
2. 自动部署只包含 `app` process 的版本。
3. 确认旧 `worker` 机器已被移除。
4. 自动销毁旧 `indigo-ppt-jobs` Upstash Redis，并暂存删除 `REDIS_URL`。

所有生产变更都由 GitHub Actions 执行，不手工修改服务器运行状态。

## 本地验证

本地只需要 FastAPI，不再需要 Redis 或 Celery：

```bash
cd backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

默认 Job 数据写入 `data/indigo.db`，图片写入 `data/image-jobs`。

## 后续工作

- 为历史图片增加容量统计、删除和保留策略。
- 当单机容量或无人值守执行成为真实需求时，再评估 Tigris/S3 与托管队列。
- 增加队列等待、单图延迟、429、重试次数、成功率和 provider 成本指标。
