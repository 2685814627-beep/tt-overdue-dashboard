# TT 超期包裹看板在线版

这个版本支持：

- 有链接的人都能查看看板。
- 负责人进入后台上传 Excel。
- 上传一次后，其他人刷新同一个链接即可看到最新发布数据。

## 本地测试

```bash
cd tt-online-web
ADMIN_PASSWORD=8888 npm start
```

打开：

```text
http://localhost:3000
```

后台密码默认是：

```text
8888
```

## 上线部署

这是一个普通 Node.js 网站，可以部署到 Render、Railway、Vercel Node 服务、公司服务器等。

需要设置环境变量：

```text
ADMIN_PASSWORD=你的后台密码
```

推荐使用 Supabase 保存数据。配置 Supabase 后，Render 重启或休眠也不会丢数据。

需要在 Render 设置：

```text
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service_role key
SUPABASE_TABLE=dashboard_snapshots
```

Supabase 建表 SQL 在：

```text
supabase.sql
```

配置后，每次上传会按“数据日期”保存一份每日快照，趋势图会读取这些历史快照。

如果没有配置 Supabase，系统会退回本地文件 `data/latest.json`，但 Render 免费版重启后可能丢数据。

## 使用方式

1. 你打开网站链接。
2. 点击右上角 `后台 / Admin`。
3. 输入后台密码。
4. 上传 Excel。
5. 系统提示发布成功。
6. 网管打开同一个链接或刷新页面，即可看到最新数据。
