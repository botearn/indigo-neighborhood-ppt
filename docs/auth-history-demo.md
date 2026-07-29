# 登录与历史 Demo 收尾说明

## 当前范围

本阶段实现的是 demo 级账号与生成历史闭环：

- 邮箱密码注册、登录、退出。
- 前端用 Bearer token 保持登录态，刷新后通过 `/api/auth/me` 校验。
- 后端受保护接口通过当前用户隔离访问。
- Fast Lane 和 Guided 生成完成后写入用户历史。
- 首页展示历史列表，支持打开历史记录继续预览或编辑。
- 任一受保护接口返回 401 时，前端清理本地 token 并回到登录页。

## 主要代码位置

- 后端认证存储和历史存储：`backend/app/core/auth.py`
- 后端认证路由：`backend/app/api/auth.py`
- 后端业务路由鉴权与历史写入：`backend/app/api/routes.py`
- 前端 API token 和错误处理：`frontend/src/api.ts`
- 前端登录页：`frontend/src/AuthScreen.tsx`
- 前端登录态、首页历史和退出：`frontend/src/App.tsx`
- 后端回归测试：`backend/tests/test_auth_flow.py`

## 本地验证

已通过：

```bash
cd backend
python3 -m unittest discover -s tests

cd ../frontend
npx tsc -b --pretty false
npm run lint
npm run build
```

覆盖内容：

- 注册、登录、`/api/auth/me`。
- 错误密码返回 401。
- 退出后原 token 失效。
- 未登录访问 `/api/history` 返回 401。
- 历史列表和详情按用户隔离。
- 前端 TypeScript、ESLint 和 Vite production build。
- 本地 dev server 可返回页面，后端 auth smoke test 可完成注册、当前用户查询、退出和退出后 401。
- `npm audit --audit-level=high` 返回 0 vulnerabilities。

当前注意事项：

- Vite build 提示主 chunk 超过 500 kB，当前不阻塞 demo，后续可结合代码分割优化。

## Demo 限制

- 当前 token 存在 `localStorage`，生产前需要评估 HttpOnly cookie 或 refresh token 方案。
- 当前账号与历史默认存在本地 SQLite 文件 `data/indigo.db`，生产前必须确认持久化、迁移和备份策略。
- 当前只在生成完成时保存历史，编辑后的版本保存、回滚、删除、搜索还未实现。
- 当前没有邮箱验证、忘记密码、密码重置、登录限流和审计日志。
- 当前没有角色、组织、总部/区域/门店权限模型。

## 对应 Backlog

- `BL-10` 账号登录与用户会话：demo 闭环待验收。
- `BL-11` 登录 Demo 验收与回归用例：后端与前端基础验证已补，后续可加 Playwright。
- `BL-12` Auth 数据持久化与迁移方案。
- `BL-13` 会话安全加固。
- `BL-14` 密码与账号生命周期。
- `BL-15` 用户角色与数据权限。
- `BL-16` 生成历史与版本管理完善。
- `BL-17` 登录体验与异常文案打磨。
- `BL-18` 审计日志与安全监控。
- `BL-19` 账号数据合规与保留策略。
- `BL-20` Auth 发布验收清单。
- `BL-21` 前端工具链健康检查：本地已恢复，待验收。
