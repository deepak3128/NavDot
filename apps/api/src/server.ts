import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import bleRoutes from "./routes/ble";
import navigationRoutes from "./routes/navigation";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const requestId = `req_${Date.now()}_${Math.round(Math.random() * 10000)}`;
  res.setHeader("x-request-id", requestId);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "navdot-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/ble", bleRoutes);
app.use("/api/navigation", navigationRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
