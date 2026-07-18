# StegoSend

StegoSend 是一个自部署的图片隐写 Web 工具。它在浏览器本地把文本或单个文件加密后嵌入图片，并从生成的 PNG 中恢复内容。

图片、口令和秘密内容不会上传到服务器。Docker 容器只提供静态页面。

## 功能

- 文本或单文件载荷，最大 5 MiB
- PNG、JPEG、WebP 载体，统一输出无损 PNG
- AES-256-GCM 认证加密
- PBKDF2-HMAC-SHA-256，600,000 次迭代
- RGB 通道 1-bit LSB 隐写与密钥化槽位顺序
- 浏览器 Web Worker 处理加密与像素循环
- 中文响应式界面、键盘操作和读屏器支持
- 非 root、只读 Docker 容器和严格安全响应头
- 不包含账户、数据库、遥测或外部 CDN

## Docker 部署

```bash
git clone https://github.com/noaul/iknow.git
cd iknow
docker compose up -d --build
```

打开 [http://localhost:8080](http://localhost:8080)。

如果 8080 已占用：

```bash
PORT=18080 docker compose up -d --build
```

PowerShell：

```powershell
$env:PORT = '18080'
docker compose up -d --build
```

检查状态：

```bash
docker compose ps
curl http://localhost:8080/healthz
```

停止服务：

```bash
docker compose down
```

## HTTPS 反向代理

生产环境应通过 HTTPS 提供页面。以下为宿主机 Nginx 示例：

```nginx
server {
    listen 443 ssl http2;
    server_name stego.example.com;

    ssl_certificate /etc/letsencrypt/live/stego.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stego.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

容器已返回 CSP、`nosniff`、`frame-ancestors 'none'`、严格 referrer policy 和 permissions policy。反向代理不应删除这些响应头。

## 使用限制

| 项目 | 限制 |
| --- | --- |
| 载体文件 | PNG、JPEG、WebP，最大 30 MiB |
| 图片尺寸 | 最大 25,000,000 像素 |
| 秘密内容 | 文本或单文件，最大 5 MiB |
| 文件名 | UTF-8 编码后最大 255 字节 |
| 新建口令 | NFC 规范化后 12 至 1,024 个 UTF-8 字节 |
| 输出 | 静态 PNG |

必须发送下载得到的原始 PNG。社交平台、图片优化服务、截图、缩放、裁剪、滤镜和格式转换都可能破坏隐藏内容。

LSB 隐写只能避免肉眼直接看到内容，统计分析仍可能判断图片经过修改。它不是匿名通信协议，也不能替代经过审计的端到端加密通信工具。

## 工作原理

1. 载荷被序列化，并在确实节省空间时使用 gzip 压缩。
2. 每次生成随机 16 字节盐和 12 字节 AES-GCM IV。
3. PBKDF2 派生独立的 256 位加密材料和 256 位布局材料。
4. AES-256-GCM 加密载荷，公开协议头作为附加认证数据。
5. 42 字节公开头写入连续 RGB 最低位。
6. 密文通过布局密钥派生的互质步长分散写入其余 RGB 最低位。
7. Alpha 通道和 RGB 高 7 位保持不变。

协议 magic 为 `STG2`，当前版本为 `1`。错误口令与被破坏的密文统一返回认证失败，应用不会输出部分明文。

## 浏览器兼容性

持续测试 Chromium、Firefox 和 WebKit。浏览器缺少 Worker `OffscreenCanvas` 时，Canvas 像素输入/PNG 输出会回退到主线程；加密和 LSB 像素循环仍在 Worker 内执行。

## 本地开发

要求 Node.js 22 或更高版本。

```bash
npm ci
npm run dev
```

质量门禁：

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run e2e
```

## 升级与备份

```bash
git pull --ff-only
docker compose up -d --build
```

StegoSend 不保存业务数据，因此没有数据库或上传目录需要备份。只需保存自己的 Compose 环境配置、反向代理配置和 TLS 证书。

安全边界和漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## License

[MIT](LICENSE)
