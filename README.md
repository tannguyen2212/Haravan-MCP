# Haravan MCP

Haravan E-commerce OpenAPI MCP Server — Kết nối AI assistants với Haravan stores.

MCP (Model Context Protocol) server cho phép AI assistants (Claude, Cursor, Trae) tương tác trực tiếp với Haravan APIs: quản lý sản phẩm, đơn hàng, khách hàng, tồn kho, webhooks và nhiều hơn.

*[English](#english) below.*

---

## Bắt đầu nhanh

### Sử dụng với Claude / Cursor / Trae

Thêm vào file cấu hình MCP:

```json
{
  "mcpServers": {
    "haravan-mcp": {
      "command": "npx",
      "args": ["-y", "haravan-mcp", "mcp", "-t", "<your_access_token>"]
    }
  }
}
```

### Sử dụng với Docker (HTTP mode)

```bash
# Clone repo
git clone <repo-url> && cd HaravanMCP

# Cấu hình token
cp docker/.env.example docker/.env
# Sửa docker/.env → điền HARAVAN_ACCESS_TOKEN

# Chạy
docker compose -f docker/docker-compose.yml up -d

# MCP endpoint: http://localhost:4567/mcp
# Health check: http://localhost:4567/health
```

### Sử dụng với OAuth 2.0

```bash
# Bước 1: Login
npx haravan-mcp login -a <app_id> -s <app_secret>

# Bước 2: Cấu hình MCP
{
  "mcpServers": {
    "haravan-mcp": {
      "command": "npx",
      "args": ["-y", "haravan-mcp", "mcp", "-a", "<app_id>", "--oauth"]
    }
  }
}
```

---

## Kiến trúc 2 lớp

```
Claude Skill Layer (AI reasoning, insights, formatting)
         │
         │ MCP Protocol
         ▼
MCP Server Layer (pagination, rate limiting, aggregation)
         │
         │ HTTPS + Bearer Token
         ▼
Haravan REST API (apis.haravan.com)
```

**Smart Tools (7)**: Server-side pagination + aggregation cho data lớn
**Base Tools (63)**: 1:1 mapping với Haravan API cho detail/CRUD

---

## Smart Tools

| Tool | Chức năng |
|------|-----------|
| `hrv_orders_summary` | Tổng DT, AOV, status/source/cancel breakdown, so sánh kỳ trước |
| `hrv_top_products` | Top N sản phẩm theo doanh thu + variant breakdown |
| `hrv_order_cycle_time` | Median/p90 time-to-confirm/close, đơn stuck |
| `hrv_customer_segments` | RFM 8 segments + action suggestions |
| `hrv_inventory_health` | Phân loại: out_of_stock / low / dead / healthy |
| `hrv_stock_reorder_plan` | DSR + reorder point + suggested qty per variant |
| `hrv_inventory_imbalance` | Cross-location imbalance + transfer suggestions |

---

## Base Tools (63 tổng)

| Category | Tools | Mô tả |
|----------|-------|-------|
| Customers | 14 | CRUD khách hàng + địa chỉ |
| Orders | 13 | CRUD đơn hàng + transactions |
| Products | 11 | CRUD sản phẩm + variants |
| Inventory | 5 | Kiểm kho + locations |
| Shop | 6 | Shop info, kho, nhân viên |
| Content | 11 | Pages, blogs, articles, script tags |
| Webhooks | 3 | Subscribe/unsubscribe |

---

## Presets

```bash
# Smart tools only (dashboard/analytics)
haravan-mcp mcp -t <token> --tools "preset.smart"

# Default (smart + detail drill-down)
haravan-mcp mcp -t <token> --tools "preset.default"

# Full CRUD cho specific resources
haravan-mcp mcp -t <token> --tools "preset.products,preset.orders"

# Tất cả tools
haravan-mcp mcp -t <token> --tools "all"

# Mix presets + individual tools
haravan-mcp mcp -t <token> --tools "preset.smart,haravan_webhooks_list"
```

| Preset | Tools | Use case |
|--------|-------|---------|
| `preset.default` | 17 | AI assistant — smart + drill-down |
| `preset.smart` | 7 | Dashboard, analytics |
| `preset.light` | 7 | Read-only minimal |
| `preset.products` | 11 | Product management |
| `preset.orders` | 13 | Order management |
| `preset.customers` | 14 | Customer management |
| `preset.inventory` | 7 | Inventory management |
| `preset.content` | 11 | Content management |
| `preset.webhooks` | 3 | Webhook management |

---

## CLI Commands

```bash
haravan-mcp mcp -t <token>                   # Start server (stdio)
haravan-mcp mcp -t <token> -m http -p 3000   # Start server (HTTP)
haravan-mcp mcp -t <token> --tools "preset.smart"  # Custom tools

haravan-mcp login -a <app_id> -s <secret>    # OAuth login
haravan-mcp whoami                            # Show stored tokens
haravan-mcp logout -a <app_id>               # Remove token
haravan-mcp logout --all                      # Remove all tokens

haravan-mcp tools                             # List all tools
haravan-mcp tools --presets                   # Show presets
haravan-mcp tools --project products          # Filter by category
```

---

## Development

```bash
npm install          # Install dependencies
npm run build        # Build TypeScript
npm run dev -- mcp -t <token>   # Dev mode
npm test             # Run tests
npm run format       # Prettier format
```

---

## Tài liệu

| Doc | Nội dung |
|-----|---------|
| [docs/project-overview-pdr.md](docs/project-overview-pdr.md) | Tổng quan dự án, tầm nhìn, roadmap |
| [docs/system-architecture.md](docs/system-architecture.md) | Kiến trúc: transport, middleware, auth flow |
| [docs/code-standards.md](docs/code-standards.md) | Quy chuẩn code, cấu trúc thư mục, patterns |
| [docs/design-guidelines.md](docs/design-guidelines.md) | Tư duy thiết kế MCP + Claude Skill |
| [docs/deployment-guide.md](docs/deployment-guide.md) | Docker, Cloudflare Tunnel, troubleshooting |
| [docs/codebase-summary.md](docs/codebase-summary.md) | Tóm tắt codebase, dependencies, data flow |

---

## Environment Variables

| Variable | Mô tả |
|----------|-------|
| `HARAVAN_ACCESS_TOKEN` | Private app token |
| `HARAVAN_APP_ID` | OAuth App ID |
| `HARAVAN_APP_SECRET` | OAuth App Secret |

---

## Tác giả

**Nguyễn Ngọc Tuấn**
Founder — Transform Group | Lark Platinum Partner
[Facebook](https://www.facebook.com/khongphaituan)

## License

MIT

---

<a name="english"></a>
## English

### What is Haravan MCP?

An MCP (Model Context Protocol) server that connects AI assistants (Claude, Cursor, Trae) to Haravan e-commerce stores. Manage products, orders, customers, inventory, and more through natural language.

### Architecture

Two-layer design:
- **MCP Server** (7 smart tools): Server-side pagination, rate limiting, aggregation for large datasets
- **Claude Skill** (SKILL.md): AI reasoning, insights, formatting — handles simple analysis from smart tool outputs

### Quick Start

```json
{
  "mcpServers": {
    "haravan-mcp": {
      "command": "npx",
      "args": ["-y", "haravan-mcp", "mcp", "-t", "<your_token>"]
    }
  }
}
```

### Docker

```bash
docker compose -f docker/docker-compose.yml up -d
# MCP endpoint: http://localhost:4567/mcp
```

### Documentation

All docs are in Vietnamese (default) with English summaries at the bottom of each file. See [docs/](docs/) directory.
