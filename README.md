# AI Chat Application

A modern chat application that allows you to have conversations with AI models through OpenRouter or OpenAI APIs. All API calls are made directly from the client, ensuring your data stays private.

## Features

- **Client-side API Calls**: All API calls are made directly from your browser to OpenRouter or OpenAI
- **User-provided API Keys**: Use your own OpenRouter or OpenAI API key
- **Multiple AI Models**: Choose from a variety of AI models from different providers
- **Local Storage**: Chat history and settings are stored in your browser's localStorage
- **Dark Mode Support**: Comfortable UI for both light and dark themes
- **Responsive Design**: Works on desktop and mobile devices

## Privacy Features

- **Client-side API Calls**: All API requests are made directly from your browser to OpenRouter or OpenAI
- **Local Data Storage**: Your API keys and chat history are stored in your browser's localStorage
- **No Server Processing**: The server only serves static files and doesn't process any user data

## Prerequisites

- Node.js 20.x or 22.x (LTS recommended; Node 23+ is not supported by `web-push`)
- An OpenRouter API key (get one at [OpenRouter](https://openrouter.ai))

## Getting Started

1. Clone the repository:

```bash
git clone <repository-url>
cd chat-bot
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:5000](http://localhost:5000) in your browser to see the application.

## Push Notifications (PWA)

This app uses **Web Push (VAPID)** for notifications. You must provide VAPID keys via environment variables.

1. Generate VAPID keys:

```bash
npm run generate-vapid-keys
```

2. Create `.env.local` (copy from `env.example`) and paste your keys:

```bash
cp env.example .env.local
```

Set:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public key)
- `VAPID_PRIVATE_KEY` (private key)
- `VAPID_SUBJECT` (optional; defaults to `mailto:dmd@steadyapp.dev`)

3. Restart the dev server after changing `.env.local`.

## MySQL MCP server (HTTP/SSE)

This repo includes a small **read-only MySQL MCP server** at [`mcp/sql.js`](mcp/sql.js). It’s intended for local agent/tooling integrations and binds to localhost by default.

### Environment variables

MySQL connection (required):
- `MYSQL_HOST`
- `MYSQL_PORT` (default: `3306`)
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`

MCP server:
- `MCP_HOST` (default: `127.0.0.1`)
- `MCP_PORT` (default: `7071`)
- `MCP_MAX_ROWS` (default: `1000`) — applied to `SELECT`/`WITH ... SELECT` queries that don’t already include `LIMIT`

### Run

1. Install deps (adds the MCP SDK):

```bash
npm install
```

2. Ensure your env vars are set (e.g. in `.env.local`, or exported in your shell).

3. Start the MCP server:

```bash
npm run mcp:mysql
```

### Endpoints

Once running, it serves:
- `GET /` health JSON
- `GET /sse` to establish the SSE stream
- `POST /messages?sessionId=...` to send MCP messages for that SSE session

### Tool

The server exposes one tool:
- `mysql_query`: executes **read-only** SQL (`SELECT`/`SHOW`/`DESCRIBE`/`EXPLAIN`, and `WITH ... SELECT`). Writes and multi-statement queries are blocked.

It also exposes:
- `mysql_list_tables`: lists tables in the configured database
- `mysql_describe_table`: describes a table’s columns (by table name)

## Usage

1. When you first open the application, you'll be prompted to enter your API key and select a provider (OpenRouter or OpenAI)
2. Enter your API key and customize the system prompt if desired
3. Select an AI model from the dropdown
4. Start chatting with the AI!

## Data Storage

All data is stored locally in your browser using localStorage. This includes:
- Chat history
- System prompt
- Selected model
- API keys (stored securely in your browser only)

No data is sent to the server or stored in a database.

## Technologies Used

- Next.js
- React
- TypeScript
- Tailwind CSS

## License

MIT
