# AI Voice-Controlled Smart Classroom

An intelligent, voice-automated smart classroom management system built on the **MERN** stack (MongoDB, Express, React, Node.js).

---

## 🏛️ Project Architecture

```
WebApp/
├── package.json                 # Root scripts to orchestrate client & server
├── .gitignore                   # Unified gitignore (.env strictly ignored, examples tracked)
├── README.md                    # Project documentation & run guides
│
├── client/                      # Frontend React Application
│   ├── .env.example             # Client environment template (VITE_API_BASE_URL only)
│   ├── .env                     # Local client environment (Git ignored)
│   ├── index.html               # HTML entry point with custom typography
│   ├── package.json             # Frontend dependencies (React 19, Tailwind v4, Vite)
│   ├── vite.config.js           # Vite configuration with Tailwind CSS plugin
│   └── src/
│       ├── App.jsx              # Smart Classroom dashboard with live health handshake & security audit
│       ├── index.css            # Tailwind CSS styles and custom design system
│       └── main.jsx             # React DOM root entry
│
└── server/                      # Backend REST API Service
    ├── .env.example             # Server environment template with all required keys
    ├── .env                     # Local server environment (Git ignored)
    ├── package.json             # Backend dependencies (Express, Mongoose, CORS, Dotenv, Nodemon)
    └── src/
        ├── server.js            # Express app entry, middleware & CORS configuration
        ├── config/
        │   ├── env.js           # Startup validator for environment variables & diagnostic errors
        │   └── db.js            # MongoDB connection handler via Mongoose
        └── routes/
            └── health.routes.js # GET /api/health endpoint with sanitized service status
```

---

## 🔐 Environment Variables & Security Isolation

### Strict Isolation Rules
1. **`GEMINI_API_KEY`, `JWT_SECRET`, and `MQTT_PASSWORD` are strictly backend secrets.**
   - They reside ONLY in `server/.env`.
   - They are **never** prefixed with `VITE_` and are **never** bundled or exposed to React / browser clients.
2. **`VITE_API_BASE_URL` is the ONLY frontend environment variable.**
   - Configured in `client/.env`.
3. **`.env` files are strictly ignored by Git.**
   - Both root and subfolder `.env` files are ignored in `.gitignore`.
   - `.env.example` templates remain committed as documentation.

---

### Backend Environment (`server/.env`)

| Variable | Required | Description | Example / Default |
| :--- | :---: | :--- | :--- |
| `PORT` | Yes | Server port number (1-65535) | `5000` |
| `MONGODB_URI` | Yes | MongoDB connection string | `mongodb://127.0.0.1:27017/smart_classroom` |
| `JWT_SECRET` | Yes | Secret key for signing auth tokens (min 16 chars) | `your_secure_random_jwt_secret_key` |
| `GEMINI_API_KEY` | Yes | Google Gemini AI key (backend-only) | `your_gemini_api_key_here` |
| `MQTT_BROKER_URL` | Yes | MQTT broker URL (`mqtt://`, `mqtts://`, `ws://`) | `mqtt://127.0.0.1:1883` |
| `MQTT_CLIENT_ID` | Yes | Unique MQTT client identifier | `smart_classroom_backend_dev_01` |
| `MQTT_USERNAME` | No | Optional MQTT broker username | `smart_classroom_admin` |
| `MQTT_PASSWORD` | No | Optional MQTT broker password | `your_mqtt_password_here` |
| `CLIENT_URL` | No | Frontend origin for CORS policy | `http://localhost:5173` |
| `NODE_ENV` | No | Node runtime environment | `development` |

---

### Frontend Environment (`client/.env`)

| Variable | Required | Description | Example / Default |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | Yes | Base URL where Express backend runs | `http://localhost:5000` |

---

## ⚡ Startup Validation & Error Handling

When the backend starts (`npm run server:dev` or `npm run dev`), [`server/src/config/env.js`](file:///d:/Final%20Year%20Project/WebApp/server/src/config/env.js) automatically validates all required environment variables:
- Checks for presence of all required keys.
- Validates formats (`PORT` is valid number, `MONGODB_URI` starts with `mongodb://` or `mongodb+srv://`, `MQTT_BROKER_URL` uses supported protocol, `JWT_SECRET` meets minimum length).
- Detects unconfigured template placeholders.
- If misconfigured, server logs a high-visibility diagnostic banner listing **all** issues and immediate fix instructions, then halts execution with code `1`.

---

## 🚀 Getting Started

### 1. Configure Environment Files
Copy the `.env.example` templates into `.env`:
```bash
# In client/
cp client/.env.example client/.env

# In server/
cp server/.env.example server/.env
```

### 2. Run Both Applications Together
From the root directory (`WebApp`):
```bash
npm run dev
```

- **Frontend Dashboard**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/api/health`

### 3. Run Individually
```bash
# Run backend only
npm run server:dev

# Run frontend only
npm run client:dev
```
