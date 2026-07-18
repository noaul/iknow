# Security Policy

## Supported Version

当前维护 `0.1.x`。请先在最新补丁版本复现问题。

## Reporting a Vulnerability

请使用 GitHub 仓库的私密安全报告功能：

https://github.com/noaul/iknow/security/advisories/new

报告应包含受影响版本、浏览器、复现步骤、预期影响和最小化测试文件。不要在公开 Issue 中发布可利用细节、真实秘密内容或口令。

## Security Model

StegoSend 提供：

- AES-256-GCM 内容保密性与完整性
- 每条消息独立的随机盐和 IV
- 浏览器本地处理
- 不含业务 API、账户、数据库、上传和遥测
- 有界 KDF 参数、图片尺寸和载荷长度

StegoSend 不提供：

- 对专业隐写分析的不可检测性
- 对平台压缩、裁剪、截图或重新编码的鲁棒性
- 网络匿名性或流量隐藏
- 端点设备被控制后的保护
- 口令找回

## Password Guidance

- 使用至少四个随机单词或密码管理器生成的长口令。
- 通过与图片不同的渠道传递口令。
- 不要重复使用账户密码。
- 弱口令可能遭到离线字典攻击；PBKDF2 只能增加攻击成本。

## Deployment Guidance

- 生产环境必须启用 HTTPS。
- 使用固定镜像版本并定期重建。
- 保留容器的非 root、只读、`cap_drop: ALL` 和 `no-new-privileges` 设置。
- 不要在反向代理中移除 CSP 和其他安全响应头。
- 不要向页面注入分析脚本、广告、在线字体或第三方 JavaScript。
- 静态文件被篡改后，攻击者可以读取用户输入；应保护镜像供应链和部署主机。

## Failure Messages

错误口令和载荷损坏在 AES-GCM 层无法可靠区分，因此统一显示“口令错误或图片已损坏”。这是有意的安全行为。

如果普通图片显示“没有可识别的隐藏信息”，说明未发现 `STG2` 协议头。社交平台处理后的图片通常会得到这一结果或认证失败。
