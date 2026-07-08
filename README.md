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

如果部署平台重启后会清空本地文件，需要改成云数据库或对象存储。第一版会把最新数据保存在服务器的 `data/latest.json`。

## 使用方式

1. 你打开网站链接。
2. 点击右上角 `后台 / Admin`。
3. 输入后台密码。
4. 上传 Excel。
5. 系统提示发布成功。
6. 网管打开同一个链接或刷新页面，即可看到最新数据。
