# Haravan MCP — Tổng Quan Dự Án (PDR)

*Product Development Requirements — Phiên bản 0.1.0*

---

## Tầm nhìn

Haravan MCP là cầu nối giữa AI assistants (Claude, Cursor, Trae) và Haravan e-commerce stores, cho phép AI hiểu và vận hành cửa hàng trực tuyến thông qua Model Context Protocol (MCP).

**Vấn đề giải quyết**: Chủ shop Haravan phải tự đăng nhập admin, dò từng tab, export Excel rồi phân tích thủ công. Với Haravan MCP, họ chỉ cần hỏi bằng ngôn ngữ tự nhiên: *"Tuần này bán bao nhiêu?"*, *"Sản phẩm nào sắp hết hàng?"*, *"Khách nào sắp mất?"*

---

## Kiến trúc 2 lớp

```
┌──────────────────────────────────────────────┐
│              CLAUDE SKILL LAYER              │
│  (SKILL.md — AI reasoning, insights, UX)     │
│                                              │
│  • Decision tree: câu hỏi → tool nào         │
│  • Simple aggregation: group by, filter      │
│  • Insight generation: metric + action       │
│  • Output formatting: bảng, biểu đồ text    │
└──────────────────┬───────────────────────────┘
                   │ MCP Protocol (stdio/HTTP)
┌──────────────────▼───────────────────────────┐
│              MCP SERVER LAYER                │
│  (Node.js — heavy lifting)                   │
│                                              │
│  Smart Tools (7):                            │
│  • Pagination 100+ pages                     │
│  • Rate limiting (leaky bucket 4 req/s)      │
│  • RFM quintile scoring (full population)    │
│  • Batch inventory calls (200+ API calls)    │
│                                              │
│  Base Tools (63):                            │
│  • 1:1 mapping với Haravan REST API          │
│  • Detail view, CRUD, search                 │
└──────────────────┬───────────────────────────┘
                   │ HTTPS + Bearer Token
┌──────────────────▼───────────────────────────┐
│           HARAVAN REST API                   │
│  apis.haravan.com                            │
│  Rate: 80 bucket, 4 req/s leak              │
│  Pagination: 50/page (max)                   │
└──────────────────────────────────────────────┘
```

### Tại sao 2 lớp?

| Việc | MCP Server | Claude Skill |
|------|-----------|-------------|
| Fetch 2000 đơn hàng (40 pages) | ✅ Server pagination + throttle | ❌ Claude không thể loop API |
| RFM scoring 9000 khách | ✅ Quintile cần full population | ❌ Không fit context window |
| Group by kênh bán hàng | ❌ Quá đơn giản cho server | ✅ Claude đọc orders_by_source |
| Viết insight "Doanh thu tăng 12% nhờ..." | ❌ Server không hiểu context | ✅ Claude AI reasoning |
| Format bảng + emoji + tiếng Việt | ❌ Server trả JSON | ✅ Claude format markdown |

---

## Tool Catalog

### Smart Tools (7) — Server-side aggregation

| Tool | Chức năng | API calls tiết kiệm |
|------|-----------|---------------------|
| `hrv_orders_summary` | Tổng DT, đơn, AOV, status/source/cancel breakdown, so sánh kỳ trước | ~40 pages → 1 response |
| `hrv_top_products` | Top N sản phẩm theo DT, variant breakdown | ~40 pages → 1 response |
| `hrv_order_cycle_time` | Median/p90 time-to-confirm/close, đơn stuck | ~40 pages → 1 response |
| `hrv_customer_segments` | RFM 8 segments với action suggestions | ~100 pages → 1 response |
| `hrv_inventory_health` | Phân loại variant: out_of_stock/low/dead/healthy | 100+ inventory calls → 1 response |
| `hrv_stock_reorder_plan` | DSR, days_of_stock, reorder_qty per variant | 200+ inventory calls → 1 response |
| `hrv_inventory_imbalance` | Cross-location imbalance + transfer suggestions | 100+ inventory calls → 1 response |

### Base Tools (63) — Haravan API 1:1

| Category | Tools | Ví dụ |
|----------|-------|-------|
| Orders (13) | list, count, get, create, update, confirm, close, open, cancel, assign, transactions | Tra cứu đơn #12345 |
| Products (11) | list, count, get, create, update, delete, variants CRUD | Tạo sản phẩm mới |
| Customers (14) | list, search, count, get, create, update, delete, groups, addresses CRUD | Tìm khách theo SĐT |
| Inventory (5) | adjustments list/count/get, adjust_or_set, locations | Set tồn kho SKU-001 = 50 |
| Shop (6) | shop_get, locations, users, shipping_rates | Thông tin cửa hàng |
| Content (11) | pages, blogs, articles, script_tags CRUD | Tạo landing page |
| Webhooks (3) | list, subscribe, unsubscribe | Đăng ký webhook |

---

## Presets

| Preset | Tools | Use case |
|--------|-------|---------|
| `preset.default` | 17 | Claude AI assistant — smart + drill-down |
| `preset.smart` | 7 | Chỉ smart tools — dashboard/analytics |
| `preset.light` | 7 | Read-only minimal |
| `preset.products` | 11 | Quản lý sản phẩm |
| `preset.orders` | 13 | Quản lý đơn hàng |
| `preset.customers` | 14 | Quản lý khách hàng |
| `preset.inventory` | 7 | Quản lý tồn kho |
| `preset.content` | 11 | Quản lý nội dung |
| `preset.webhooks` | 3 | Developer webhook |

---

## Authentication

### Private Token (đơn giản)
1. Haravan Admin → Apps → Private apps → Create
2. Chọn permissions → Copy Token
3. `haravan-mcp mcp -t <token>`

### OAuth 2.0 (đầy đủ)
1. `haravan-mcp login -a <app_id> -s <app_secret>`
2. Browser mở → Authorize → Callback → Token stored tại `~/.haravan-mcp/`
3. `haravan-mcp mcp -a <app_id> --oauth`

---

## Roadmap

| Phase | Nội dung | Status |
|-------|---------|--------|
| v0.1.0 | Core: 70 tools, 2 transports, OAuth, presets | ✅ Done |
| v0.2.0 | Caching layer, webhook invalidation | 📋 Planned |
| v0.3.0 | Advanced smart tools (demand forecast, basket analysis) | 📋 Planned |
| v1.0.0 | Production-ready, npm publish | 📋 Planned |

---

---

## Tác giả

**Nguyễn Ngọc Tuấn**
Founder — Transform Group | Lark Platinum Partner
[Facebook](https://www.facebook.com/khongphaituan)

---

*English version: See [README.md](../README.md) for English quick start.*
