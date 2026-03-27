import { Router } from "express";
import { z } from "zod";

const router = Router();

const destinationSchema = z.object({
  deviceId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().max(120).optional(),
  source: z.string().max(60).optional()
});

type DestinationRecord = {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  label?: string;
  source: string;
  sentAt: string;
};

const destinationStore: DestinationRecord[] = [];

router.post("/destinations", (req, res) => {
  const parsed = destinationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const destination: DestinationRecord = {
    id: `dst_${Date.now()}_${Math.round(Math.random() * 10000)}`,
    deviceId: parsed.data.deviceId,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    label: parsed.data.label,
    source: parsed.data.source ?? "mobile",
    sentAt: new Date().toISOString()
  };

  destinationStore.unshift(destination);
  if (destinationStore.length > 250) {
    destinationStore.length = 250;
  }

  return res.status(201).json({
    message: "Destination accepted",
    destination
  });
});

router.get("/destinations/:deviceId", (req, res) => {
  const schema = z.object({ deviceId: z.string().min(1) });
  const parsed = schema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const list = destinationStore
    .filter((item) => item.deviceId === parsed.data.deviceId)
    .slice(0, 20);

  return res.json({
    destinations: list
  });
});

export default router;
