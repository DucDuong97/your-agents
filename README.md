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

- Node.js 18.17.0 or later
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

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

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
