import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";

const router = Router();

const coordinateSchema = z.object({
  deviceId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number().optional()
});

router.post("/coordinates", async (req, res) => {
  const result = coordinateSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const saved = await prisma.coordinateEvent.create({
    data: {
      deviceId: result.data.deviceId,
      latitude: result.data.latitude,
      longitude: result.data.longitude,
      altitude: result.data.altitude
    }
  });

  return res.status(201).json({
    message: "Coordinate event ingested",
    event: saved
  });
});

export default router;
