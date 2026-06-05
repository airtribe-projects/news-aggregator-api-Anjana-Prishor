# News Aggregator API

A simple Node.js and Express REST API for user authentication, personalized news preferences, and news retrieval.

## Requirements

- Node.js 18 or newer
- npm

## Setup

1. Install dependencies:

```bash
npm install
```

2. Optional environment variables:

- `JWT_SECRET` - secret key for signing JWT tokens
- `NEWS_API_KEY` - API key for external news provider (uses mock news if not set)

## Run

```bash
node app.js
```

The server listens on port `3000` by default.

## Test

```bash
npm test
```

## API Endpoints

### POST /users/signup

Request body:

```json
{
  "name": "User Name",
  "email": "user@example.com",
  "password": "password123",
  "preferences": ["topic1", "topic2"]
}
```

### POST /users/login

Request body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response includes a JWT token:

```json
{
  "token": "..."
}
```

### GET /users/preferences

Requires `Authorization: Bearer <token>` header.

Returns current user preferences.

### PUT /users/preferences

Requires `Authorization: Bearer <token>` header.

Request body:

```json
{
  "preferences": ["topic1", "topic2", "topic3"]
}
```

### GET /news

Requires `Authorization: Bearer <token>` header.

Returns personalized news articles based on saved preferences.

## Notes

- The API uses in-memory storage for users and preferences.
- If `NEWS_API_KEY` is not configured, the `/news` endpoint returns fallback mock news.

