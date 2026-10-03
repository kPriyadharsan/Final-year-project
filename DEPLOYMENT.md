# Production Deployment Guide

This guide details the step-by-step production deployment procedure for the **AI Voice-Controlled Smart Classroom** system across our target cloud architecture:

```
┌─────────────────────────────────┐
│     Vercel (React Frontend)     │
│   https://your-app.vercel.app   │
└────────────────┬────────────────┘
                 │ HTTPS REST / WSS
                 ▼
┌─────────────────────────────────┐
│    Render (Node/Express API)    │
│  https://your-api.onrender.com  │
└────────┬───────────────┬────────┘
         │               │
         ▼               ▼
┌─────────────────┐  ┌─────────────────────────────────┐
│  MongoDB Atlas  │  │   EMQX Cloud (MQTT over TLS)    │
│  (Database)     │  │  mqtts://<host>.emqxsl.com:8883  │
└─────────────────┘  └────────────────┬────────────────┘
                                      │ MQTTs
                                      ▼
                             ┌─────────────────┐
                             │  ESP32 Hardware │
                             │  (Relays/Mic)   │
                             └─────────────────┘
```

---

## 1. Frontend Deployment → Vercel

The frontend is a Vite + React 19 single-page application located in `client/`.

### Vercel Project Settings

| Configuration Field | Value | Notes |
| :--- | :--- | :--- |
| **Framework Preset** | `Vite` | Detected automatically |
| **Root Directory** | `client` | **Must be set to `client`** |
| **Build Command** | `npm run build` | Default Vite build script |
| **Output Directory** | `dist` | Default Vite production bundle directory |
| **Install Command** | `npm install` | |

### Single Page Application (SPA) Routing
Direct navigation to routes like `/login`, `/admin`, `/teacher`, and `/student` will produce a 404 unless rewrites are configured.
This repository includes [`client/vercel.json`](file:///d:/Final%20Year%20Project/WebApp/client/vercel.json):
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Required Vercel Environment Variables

| Variable | Description | Example (No Secrets) |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Public HTTPS URL of the deployed Render backend | `https://smart-classroom-backend.onrender.com` |

> [!IMPORTANT]
> The frontend bundle is public. **NEVER** add `JWT_SECRET`, `MONGODB_URI`, `GEMINI_API_KEY`, or `MQTT_PASSWORD` to Vercel environment variables.

---

## 2. Backend Deployment → Render

The backend is an Express & Socket.IO service located in `server/`.

### Render Service Settings

| Configuration Field | Value | Notes |
| :--- | :--- | :--- |
| **Service Type** | `Web Service` | Required for HTTP + WebSocket traffic |
| **Environment** | `Node` | Node.js 18+ or 20+ |
| **Root Directory** | `server` | **Must be set to `server`** |
| **Build Command** | `npm install` | Installs backend dependencies |
| **Start Command** | `npm start` | Runs `node src/server.js` |
| **Plan** | Free / Starter | WebSockets/Socket.IO supported |

### Port & Subsystem Behavior on Render
- Render dynamically assigns `PORT` via `process.env.PORT`. The backend binds dynamically to `process.env.PORT`.
- When `NODE_ENV=production`, the embedded development Aedes broker is **automatically disabled**.
- The backend connects directly to EMQX Cloud over TLS (`mqtts://...`).
- Socket.IO works natively through Render HTTP/WSS proxies.

### Required Render Environment Variables

| Variable | Required | Description | Example (No Secrets) |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | Runtime environment flag | `production` |
| `PORT` | Auto | Injected automatically by Render | `10000` |
| `CLIENT_URL` | Yes | Vercel frontend URL for strict CORS allowlist | `https://your-smart-classroom.vercel.app` |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string | `mongodb+srv://<user>:<password>@cluster.mongodb.net/smart_classroom?retryWrites=true&w=majority` |
| `JWT_SECRET` | Yes | Cryptographic secret for signing tokens (min 32 chars) | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `MQTT_BROKER_URL` | Yes | EMQX Cloud secure broker URL | `mqtts://z1910bc1.ala.us-east-1.emqxsl.com:8883` |
| `MQTT_USERNAME` | Yes | EMQX Cloud client username | `<your_emqx_username>` |
| `MQTT_PASSWORD` | Yes | EMQX Cloud client password | `<your_emqx_password>` |
| `MQTT_CLIENT_ID` | Yes | Unique backend MQTT client ID | `smart_classroom_backend_prod_01` |
| `GEMINI_API_KEY` | Optional | Google Gemini API key for natural language voice parsing | `<your_gemini_api_key>` (falls back to rule parser if absent) |

---

## 3. Database Setup → MongoDB Atlas

1. **Create Cluster**: Create a free M0 cluster or dedicated cluster on MongoDB Atlas.
2. **Database User**: Create a user with read/write access to `smart_classroom` database.
3. **Network Access / IP Allowlist**:
   - Add Render outbound IP addresses or `0.0.0.0/0` (allowing cloud platform connectivity).
4. **Initial Data Seeding**:
   After starting the server, seed initial administrator and devices:
   ```bash
   npm run seed:admin
   npm run seed:devices
   ```

---

## 4. MQTT Broker Setup → EMQX Cloud

1. **Cluster**: EMQX Cloud Serverless or Dedicated cluster (`mqtts://...:8883`).
2. **Authentication**: Configure Client ID / Password in EMQX Cloud dashboard.
3. **Standard Topics**:
   - Commands: `smartclassroom/room302/relay/light/command`, `fan/command`, `projector/command`
   - States: `smartclassroom/room302/relay/light/state`, `fan/state`, `projector/state`
   - Availability: `smartclassroom/room302/availability`

---

## 5. Deployment Verification Checklist

- [x] Client production build succeeds (`npm run build` in `client/` produces `dist/`).
- [x] `client/vercel.json` rewrite rule is in place for SPA routing.
- [x] Server respects dynamic `process.env.PORT`.
- [x] Server disables local embedded broker in `production`.
- [x] CORS rejects unauthorized origins with `HTTP 403`.
- [x] Error handler sanitizes 500 error messages and excludes stack traces in production.
- [x] Graceful shutdown closes HTTP, Socket.IO, MQTT, and MongoDB cleanly.
