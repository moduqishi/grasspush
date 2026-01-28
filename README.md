<div align="center">

# GrassPush Notification Gateway

**企业级 · Serverless · 固定 IP 穿透**

![Version](https://img.shields.io/github/v/release/moduqishi/grasspush?style=flat-square&color=4ade80)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Cloudflare-f38020?logo=cloudflare&style=flat-square)
![Framework](https://img.shields.io/badge/framework-Next.js-000000?logo=next.js&style=flat-square)
![Status](https://img.shields.io/badge/status-active-success?style=flat-square)

[特性概览](#-核心特性) • [架构设计](#-架构设计) • [部署教程](#-部署教程-step-by-step) • [配置文档](#-环境变量详解) • [API 文档](#-api-接口)

</div>

---

**GrassPush** 是一个专为解决复杂网络环境下的消息推送而设计的现代化网关。它基于 **Cloudflare Workers** 生态构建，拥有极致的冷启动速度和无限的扩展能力。特别针对 **企业微信 (WeCom)** 等对 IP 白名单有严格要求的平台，独创了 Serverless Relay 架构。

## ✨ 核心特性

*   **⚡ 极致 Serverless**：全栈运行在边缘节点 (Cloudflare Pages + Workers)，全球访问低延迟，且拥有极高免费额度。
*   **🛡️ 企业微信深度优化**：
    *   **Relay 穿透技术**：通过 Vercel 中转服务，完美解决 Serverless 环境无法提供固定 IP 的痛点。
    *   **一键域名认证**：内置验证文件托管功能，无需服务器即可通过企业微信域名归属权验证。
*   **📝 富文本 Markdown**：原生支持 Markdown 渲染，让报警通知、日报推送更加美观易读。
*   **🔒 银行级安全**：密钥、Token 等敏感数据采用 AES-256 加密存储于 D1 数据库。
*   **🤖 自动化运维**：支持 GitHub Actions 自动化构建与部署。

---

## 🏗️ 架构设计

系统采用 **控制面 (Control Plane)** 与 **数据面 (Data Plane)** 分离的设计。

```mermaid
graph LR
    User[用户/监控系统] -->|POST 消息| Edge(Cloudflare Workers)
    
    subgraph "GrassPush Core"
        Edge -->|Auth & Route| Service[业务逻辑]
        Service -->|Load Config| D1[(Cloudflare D1)]
    end
    
    subgraph "分发通道"
        Service -->|Direct| Webhook[通用 Webhook]
        Service -->|relay://协议| Vercel[Vercel Relay 中转]
    end
    
    subgraph "目标平台"
        Vercel -->|固定 IP 代理| WeCom[企业微信 API]
    end
```

---

## 📚 部署教程 (Step-by-Step)

我们提供两种部署方式：**Cloudflare 托管 (推荐新手)** 和 **GitHub Actions (推荐极客)**。

### 前置准备

在开始之前，请确保你已经准备好：
1.  **Cloudflare 账号** (用于部署主应用)
2.  **GitHub 账号** (用于代码托管)
3.  **Vercel 账号** (可选，仅当需要企业微信固定 IP 时)

---

### 第一阶段：固定 IP 中转服务 (可选)

> ⚠️ 如果你的企业微信应用配置了 IP 白名单，这是**必须**的步骤。否则可跳过。

我们利用 Vercel 原生 Node.js 环境作为代理跳板。

1.  **一键部署**  
    点击下方按钮，将中转代码 Fork 并部署到你的 Vercel 账户：  
    [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmoduqishi%2Fgrasspush&root-directory=vercel-proxy)

2.  **配置代理**  
    部署完成后，在 Vercel 项目页面进入 **Settings** -> **Environment Variables**，添加：
    *   `DEFAULT_PROXY_URL`: 你的 HTTP 代理地址 (例如 `http://user:pass@1.2.3.4:7890`)

3.  **获取地址**  
    记录下 Vercel 分配的域名，例如 `https://grasspush-relay.vercel.app`。

---

### 第二阶段：数据库初始化

GrassPush 使用 Cloudflare D1 数据库存储渠道配置。

1.  **Fork 仓库**：将本项目 Fork 到你的 GitHub。
2.  **创建数据库**：
    在本地终端登录 Cloudflare 并创建数据库：
    ```bash
    # 登录
    npx wrangler login
    
    # 创建数据库 (记下控制台返回的 database_id)
    npx wrangler d1 create push-db
    ```
3.  **初始化表结构**：
    ```bash
    # 执行 SQL 迁移
    npx wrangler d1 execute push-db --file=./drizzle/0000_initial.sql --remote
    npx wrangler d1 execute push-db --file=./drizzle/0011_add_wecom_proxy_fields.sql --remote
    ```

---

### 第三阶段：部署主应用 (GitHub Actions 方案)

这是最专业的部署方式，支持自动化流程。

1.  **配置 Secrets**
    在 GitHub 仓库中，进入 **Settings** -> **Secrets and variables** -> **Actions**，添加以下 Secrets：

    | Secret Name | 描述 | 获取方式 |
    | :--- | :--- | :--- |
    | `CLOUDFLARE_API_TOKEN` | CF API 令牌 | Cloudflare基本资料 -> API Tokens -> 创建 (需 Workers 编辑权限) |
    | `CLOUDFLARE_ACCOUNT_ID` | CF 账户 ID | Cloudflare 首页右下角 Account ID |
    | `D1_DATABASE_NAME` | 数据库名称 | 填写 `push-db` (或你创建时的名字) |
    | `PROJECT_NAME` | Pages 项目名 | 填写 `grasspush` (或自定义) |
    | `AUTH_SECRET` | 认证密钥 | 运行 `openssl rand -base64 32` 生成 |
    | `AUTH_GITHUB_ID` | GitHub OAuth ID | (可选) 开启 GitHub 登录时需要 |
    | `AUTH_GITHUB_SECRET` | GitHub OAuth Secret | (可选) 开启 GitHub 登录时需要 |
    | `DISABLE_REGISTER` | 禁止注册 | 设为 `true` 可关闭公开注册 |

2.  **触发部署**
    *   **手动触发**：进入 Actions -> Select `Deploy` workflow -> Run workflow。
    *   **自动触发**：推送标签 (e.g., `git tag v1.0.0 && git push origin v1.0.0`) 会自动触发部署。

---

## 🔧 环境变量详解

以下是项目支持的所有环境变量配置：

| 变量名 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `DB` | ✅ | - | D1 数据库绑定名称 (在 Cloudflare 后台绑定) |
| `AUTH_SECRET` | ✅ | - | NextAuth 加密密钥，用于加密 Session |
| `AUTH_GITHUB_ID` | ❌ | - | GitHub Login Client ID |
| `AUTH_GITHUB_SECRET` | ❌ | - | GitHub Login Client Secret |
| `DISABLE_REGISTER` | ❌ | `false` | 是否关闭新用户注册功能 |

---

## 🔌 API 接口

GrassPush 提供了简洁的 RESTful API。

### 发送消息

**Endpoint**: `POST /api/push/{uuid}`

**Headers**:
*   `Content-Type: application/json`

**Body**:
```json
{
  "title": "生产环境报警",
  "body": "## 数据库 CPU > 90%\n> 请立即检查慢查询日志",
  "url": "https://dashboard.example.com", // (可选) 点击跳转链接
  "level": "warning" // (可选) info, warning, error
}
```

**Response**:
```json
{
  "success": true,
  "message": "Message sent to 2 channels"
}
```

---

## ❓ 常见问题

<details>
<summary><strong>Cloudflare Workers 无法连接我的 SOCKS5 代理？</strong></summary>

Cloudflare Workers 的运行时环境对 TCP连接有特殊限制，不支持标准的 SOCKS5 握手或非标准端口的 HTTP 代理。这是底层限制。
**解决方案**：请使用我们提供的 Vercel Relay 方案 (`relay://` 协议)，Vercel 拥有完整的 Node.js 环境，兼容性完美。
</details>

<details>
<summary><strong>如何更新系统？</strong></summary>

如果你使用了 GitHub Actions 部署，只需 Sync 上游代码到你的仓库，打一个新的 Tag 推送即可自动触发更新。
</details>

---

## 🤝 贡献与支持

欢迎提交 Issue 和 Pull Request！

---

## 🙌 致谢 (Acknowledgments)

本项目基于 [BeilunYang](https://github.com/beilunyang) 的开源项目进行了优化和重构。感谢原作者的无私贡献！

*   **Original Author**: [BeilunYang](https://github.com/beilunyang)
*   **Enhancements**: 增加了固定 IP 中转 (Relay)、企业微信域名自动验证、UI/UX 改进及文档重写。

---

## 📄 License

MIT © [moduqishi](./LICENSE)
