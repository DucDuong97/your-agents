# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-agent AI chat application built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS 4. Features MCP (Model Context Protocol) tool execution, multi-provider LLM support (OpenRouter/OpenAI), PWA with push notifications, and a dual storage model (IndexedDB client-side, MySQL server-side).

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with Turbopack on port 5000 |
| `npm run build` | Production build (standalone mode) |
| `npm run start` | Run production server |
| `npm run lint` | ESLint (next/core-web-vitals + TypeScript) |

No test framework is configured.

## Architecture

### Storage Model
- **Client-side**: IndexedDB (`chatbotDB`) stores chat history and agent configurations (`chats` and `agents` stores) — see `src/lib/db.ts`
- **Server-side**: MySQL via `mysql2/promise` with direct parameterized queries (no ORM) — see `src/lib/server/db.ts`
- Environment-prefixed connection pools supported (e.g., `LOCAL_MYSQL_*`, `PROD_MYSQL_*`)

### MCP Tool System
API routes under `src/app/api/mcp/` implement tool endpoints:
- **sql** — Read-only MySQL queries with LIMIT enforcement and sensitive field masking
- **lms** — Canvas, Brightspace, Blackboard API integrations
- **image** — Image generation/processing
- **browser** — Web scraping/automation
- **sample** — Template for creating new MCP tools

MCP API pattern:
- `GET /api/mcp/*?tool=<name>` for tool listing/execution
- `POST /api/mcp/*` with `{ name, arguments }` JSON body
- Response: `{ ok: boolean, content: [{type: 'text', text: '...'}] }`

### Agentic Flow
`src/hooks/useSkills.ts` orchestrates MCP execution: plans tasks via LLM → invokes tools → collects results → streams final response. Agents (`ChatAgent` type) configure system prompts, model selection, knowledge bases, and which MCP tools are enabled.

### Key Paths
- `src/app/` — Next.js App Router pages and API routes
- `src/components/chat/` — Chat UI components
- `src/hooks/` — Custom hooks (useSkills, useApiKey, useTitleGenerator)
- `src/lib/` — Client utilities (db, openrouter, types, storage, cost/model/prompt utils)
- `src/lib/server/` — Server utilities (db pools, mcp-response helpers, webpush)

### Import Alias
`@/*` maps to `./src/*` (configured in tsconfig.json).

## Environment Variables

**Required for MySQL MCP**: `{ENV}_MYSQL_HOST`, `{ENV}_MYSQL_PORT`, `{ENV}_MYSQL_USER`, `{ENV}_MYSQL_PASSWORD`, `{ENV}_MYSQL_DATABASE` where `{ENV}` is a prefix like `LOCAL` or `PROD`.

**Push notifications**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_APP_URL`.
