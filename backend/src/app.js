/**
 * Express приложение
 */

const express = require("express");
const compression = require("compression");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const {
  authenticate,
  requireRole,
  technologistFloorOnly,
  operatorRestricted,
} = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const orderProgressRoutes = require("./routes/orderProgress");
const productionPanelRoutes = require("./routes/productionPanel");
const ordersRoutes = require("./routes/orders");
const procurementRoutes = require("./routes/procurement");
const purchaseDocumentsRoutes = require("./routes/purchaseDocuments");
const cuttingRoutes = require("./routes/cutting");
const warehouseRoutes = require("./routes/warehouse");
const warehouseStockRoutes = require("./routes/warehouseStock");
// sewingPlans отключён: единая цепочка через production_plan_day + sewing_fact + sewing_batches
// const sewingPlansRoutes = require("./routes/sewingPlans");
const planningRoutes = require("./routes/planning");
const orderOperationsRoutes = require("./routes/orderOperations");
const referencesRoutes = require("./routes/references");
const clientsRoutes = require("./routes/clients");
const workshopsRoutes = require("./routes/workshops");
const financeRoutes = require("./routes/finance");
const aiRoutes = require("./routes/ai");
const settingsRoutes = require("./routes/settings");
const sizesRoutes = require("./routes/sizes");
const boardRoutes = require("./routes/boardRoutes");
const sewingRoutes = require("./routes/sewing");
const otkRoutes = require("./routes/otk");
const shippingDocumentsRoutes = require("./routes/shippingDocuments");
const analyticsRoutes = require("./modules/analytics/analytics.routes");
const assistantRoutes = require("./modules/assistant/assistant.routes");
const plannerRoutes = require("./modules/planner/planner.routes");
const dekatirovkaRouter = require("./routes/dekatirovka");
const proverkaRouter = require("./routes/proverka");
const modelsBaseRoutes = require("./routes/models-base");

const app = express();
app.use(compression());

// CORS: Vercel (erden-brand + preview *.vercel.app), Netlify, Railway/Render фронт через FRONTEND_URL, локальная сеть
// Render / Railway: proxy HTTPS (x-forwarded-proto)
app.set("trust proxy", 1);

const frontendUrl = process.env.FRONTEND_URL
  ? String(process.env.FRONTEND_URL).trim().replace(/\/$/, "")
  : "";

const allowedOrigins = [
  "https://erden-brand.vercel.app",
  "https://erden-brand-git-main.vercel.app",
  /\.vercel\.app$/,
  /\.onrender\.com$/,
  "http://localhost:5173",
  "http://localhost:3000",
  frontendUrl,
].filter(Boolean);

const isNetlify = (origin) => {
  if (!origin || typeof origin !== "string") return false;
  try {
    return new URL(origin).hostname.endsWith(".netlify.app");
  } catch {
    return false;
  }
};

const isLocalNetwork = (origin) => {
  if (!origin || typeof origin !== "string") return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
};

function originAllowed(origin) {
  if (!origin || typeof origin !== "string") return false;
  const fromList = allowedOrigins.some((o) =>
    typeof o === "string" ? o === origin : o.test(origin)
  );
  if (fromList) return true;
  if (isNetlify(origin)) return true;
  if (isLocalNetwork(origin)) return true;
  return false;
}

/** CORS для JSON-ответов из обработчиков ошибок / 404 (когда цепочка cors не выставила заголовки). */
function setCorsHeadersForRequest(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");
  }
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (originAllowed(origin)) return callback(null, true);
    console.warn("[CORS] заблокирован origin:", origin);
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 204,
};

app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

// Health check — первым, до всех роутов
app.get("/", (req, res) => res.json({ ok: true }));
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => {
  const time = new Date().toISOString();
  res.json({
    status: "ok",
    env: process.env.NODE_ENV,
    time,
    timestamp: time,
    uptime: process.uptime(),
    port: Number(process.env.PORT) || 3001,
  });
});

// Кэш API: справочники / настройки / цеха — короткий public-кэш для GET; остальное — без кэша
app.use("/api", (req, res, next) => {
  const path = (req.originalUrl || req.url || "").split("?")[0];
  const cacheableGet =
    req.method === "GET" &&
    (path.startsWith("/api/references") ||
      path.startsWith("/api/settings") ||
      path.startsWith("/api/workshops"));
  if (cacheableGet) {
    res.set("Cache-Control", "public, max-age=60");
  } else {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
  }
  next();
});

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: "10mb" }));

/** Диагностика длительности GET /api/dekatirovka и /api/proverka: время до входа в роутер (CORS + authenticate + technologistFloorOnly). */
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  const basePath = String(req.originalUrl || req.url || "").split("?")[0];
  const stageListPaths = new Set([
    "/api/proverka",
    "/api/dekatirovka",
    "/api/dekat\u0438\u0440\u043e\u0432\u043a\u0430",
  ]);
  if (stageListPaths.has(basePath)) req._stageListT0 = Date.now();
  next();
});

// Rate limit на auth: в dev — мягче (nodemon задаёт NODE_ENV=development)
const isDevAuthLimit = process.env.NODE_ENV === "development";
const authLimiter = rateLimit({
  windowMs: isDevAuthLimit ? 1 * 60 * 1000 : 5 * 60 * 1000,
  max: isDevAuthLimit ? 100 : 10,
  message: {
    error: isDevAuthLimit
      ? "Слишком много попыток. Попробуйте через минуту."
      : "Слишком много попыток входа. Попробуйте через 5 минут.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth", authLimiter, authRoutes);

// Справочник размеров (для матрицы цвет×размер)
app.use(
  "/api/sizes",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  sizesRoutes,
);

// Дашборд: GET /api/dashboard, GET /api/dashboard/production, GET /api/dashboard/summary
app.use(
  "/api/dashboard",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  dashboardRoutes,
);
app.use(
  "/api/progress",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  orderProgressRoutes,
);
app.use(
  "/api/production",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  productionPanelRoutes,
);
app.use(
  "/api/orders",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  ordersRoutes,
);
app.use(
  "/api/procurement",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  procurementRoutes,
);
app.use(
  "/api/purchase",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  purchaseDocumentsRoutes,
);
app.use(
  "/api/cutting",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  operatorRestricted,
  cuttingRoutes,
);
app.use(
  "/api/warehouse",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  operatorRestricted,
  warehouseRoutes,
);
app.use(
  "/api/warehouse-stock",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  warehouseStockRoutes,
);
// Роуты sewing-plans отключены (дублировали логику; цепочка: Планирование → production_plan_day → Пошив → sewing_batches → ОТК)
// app.use("/api/sewing-plans", authenticate, requireRole("admin", "manager", "technologist"), technologistFloorOnly, sewingPlansRoutes);
app.use(
  "/api/planning",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  planningRoutes,
);
app.use(
  "/api/order-operations",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  orderOperationsRoutes,
);
app.use(
  "/api/references",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  referencesRoutes,
);
app.use(
  "/api/models-base",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  modelsBaseRoutes,
);
app.use(
  "/api/clients",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  clientsRoutes,
);
app.use(
  "/api/workshops",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  workshopsRoutes,
);
app.use(
  "/api/finance",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  financeRoutes,
);
app.use(
  "/api/ai",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  aiRoutes,
);
app.use(
  "/api/settings",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  settingsRoutes,
);
app.use(
  "/api/board",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  boardRoutes,
);
app.use(
  "/api/sewing",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  sewingRoutes,
);
app.use(
  "/api/otk",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  otkRoutes,
);
app.use(
  "/api/shipping",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  technologistFloorOnly,
  shippingDocumentsRoutes,
);
app.use(
  "/api/analytics",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  analyticsRoutes,
);
app.use(
  "/api/assistant",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  assistantRoutes,
);
app.use(
  "/api/planner",
  authenticate,
  requireRole("admin", "manager", "technologist", "operator"),
  plannerRoutes,
);
/** Декатировка: роутер из ./routes/dekatirovka.js → setupStageFactsRoutes (не legacy createStageFactsRouter напрямую). */
app.use(
  "/api/dekatirovka",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  dekatirovkaRouter,
);
/** Проверка: роутер из ./routes/proverka.js → setupStageFactsRoutes (не legacy createStageFactsRouter напрямую). */
app.use(
  "/api/proverka",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  proverkaRouter,
);
/** Алиас пути с кириллицей (как в меню): /api/dekatировка → тот же dekatirovkaRouter */
app.use(
  "/api/dekat\u0438\u0440\u043e\u0432\u043a\u0430",
  authenticate,
  requireRole("admin", "manager", "technologist"),
  technologistFloorOnly,
  dekatirovkaRouter,
);

// 404
app.use((req, res) => {
  setCorsHeadersForRequest(req, res);
  res.status(404).json({ error: "Маршрут не найден" });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  setCorsHeadersForRequest(req, res);
  console.error(err);
  console.error("Ошибка:", err?.name, err?.message, err?.errors);
  const status =
    err.status ||
    err.statusCode ||
    (err.type === "entity.parse.failed" ? 400 : null) ||
    500;
  let errorMsg = err.message || "Внутренняя ошибка сервера";
  if (err.name === "SequelizeValidationError" && err.errors?.length) {
    errorMsg = err.errors.map((e) => e.message || `${e.path}: ${e.value}`).join("; ");
  }
  if (err.name === "SequelizeUniqueConstraintError") {
    errorMsg = "Запись с такими данными уже существует";
  }
  const response = { error: errorMsg };
  if (process.env.NODE_ENV !== "production") {
    response.stack = err.stack;
    response.name = err.name;
  }
  res.status(status).json(response);
});

module.exports = app;
