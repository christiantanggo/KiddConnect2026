# Tavari AI Phone Agent

Self-serve AI phone answering service with Voximplant and OpenAI Realtime API.

## Features

- ✅ Real-time AI phone conversations
- ✅ Self-serve onboarding
- ✅ Voximplant integration
- ✅ OpenAI Realtime API
- ✅ Stripe billing
- ✅ Usage tracking and limits

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

3. Run database migrations:
```bash
npm run migrate
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

**Local dev ports** (when running multiple projects): backend **5003**, frontend **3003** — single source of truth in [`config/dev-ports.json`](config/dev-ports.json). Details: [`PORTS.md`](PORTS.md). On macOS/Linux use `npm run dev:unix` for the API if you don’t use PowerShell.

## Environment Variables

Create a `.env` file with the following variables:

```env
# Server
PORT=3000
NODE_ENV=development

# Database (Postgres - Supabase or Railway)
DATABASE_URL=postgresql://user:password@localhost:5432/tavari_db

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Voximplant
VOXIMPLANT_ACCOUNT_ID=your-account-id
VOXIMPLANT_APPLICATION_ID=your-application-id
VOXIMPLANT_API_KEY=your-api-key
VOXIMPLANT_ACCOUNT_NAME=your-account-name

# Stripe
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Project Structure

```
├── server.js              # Main server entry point
├── config/                # Configuration files
├── routes/                # API routes
├── middleware/            # Express middleware
├── models/                # Database models
├── services/              # Business logic services
├── utils/                 # Utility functions
└── scripts/               # Migration and utility scripts
```

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

2. **Set up database:**
   - Create a PostgreSQL database (Supabase or Railway)
   - Update `DATABASE_URL` in `.env`
   - Run migrations: `npm run migrate`

3. **Configure services:**
   - Get OpenAI API key from https://platform.openai.com
   - Set up Voximplant account and get credentials
   - Set up Stripe account and create products: `node scripts/create-stripe-products.js`

4. **Start development:**
   ```bash
   # Backend
   npm run dev
   
   # Frontend (in another terminal)
   cd frontend && npm run dev
   ```

## API Endpoints

### Core
- `GET /health` - Health check
- `GET /api` - API info

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Setup
- `POST /api/setup/step1-5` - Save setup steps
- `POST /api/setup/finalize` - Complete onboarding

### Agents
- `GET /api/agents` - Get AI agent config
- `PUT /api/agents` - Update AI agent config

### Calls
- `GET /api/calls` - List call sessions
- `POST /api/calls/webhook` - Voximplant webhook

### Messages
- `GET /api/messages` - List messages

### Usage
- `GET /api/usage/status` - Get usage status

### Billing
- `POST /api/billing/checkout` - Create checkout session
- `GET /api/billing/portal` - Get billing portal URL

See `PROJECT_SUMMARY.md` for complete API documentation.

## Documentation

- `PROJECT_SUMMARY.md` - Complete project overview
- `DEPLOYMENT.md` - Deployment guide and production checklist
- `DEPLOYMENT_AUTOMATION.md` - Automatic deployment setup (GitHub → Railway/Vercel)
- `.github/workflows/README.md` - GitHub Actions workflows documentation

## License

ISC

