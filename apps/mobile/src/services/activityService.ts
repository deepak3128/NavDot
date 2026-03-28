export type RideSession = {
  id: number;
  title: string;
  distanceMeters: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  turnCount: number;
  instructionPackets: number;
  startAt: string;
};

export type DeviceSyncStatus = {
  id: number;
  routeName: string;
  packetsSent: number;
  packetsAcknowledged: number;
  averageLatencyMs: number;
  status: "healthy" | "warning";
  updatedAt: string;
};

export type RideActivityPayload = {
  deviceName: string;
  firmwareVersion: string;
  sessions: RideSession[];
  syncStatuses: DeviceSyncStatus[];
};

function seededNoise(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function metersFromKm(km: number): number {
  return Math.round(km * 1000);
}

export async function loadRideActivitySnapshot(): Promise<RideActivityPayload> {
  const nowSeed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
  const noise = seededNoise(nowSeed);

  const baseSessions: Array<{ title: string; km: number; minutes: number; turns: number; packets: number }> = [
    { title: "Office Commute", km: 6.4, minutes: 21, turns: 14, packets: 122 },
    { title: "Market Run", km: 9.1, minutes: 29, turns: 18, packets: 166 },
    { title: "Evening City Loop", km: 18.7, minutes: 49, turns: 25, packets: 239 },
    { title: "Weekend Trail Connector", km: 24.3, minutes: 71, turns: 31, packets: 302 },
    { title: "Home Return", km: 5.8, minutes: 19, turns: 11, packets: 98 }
  ];

  const sessions: RideSession[] = baseSessions.map((entry, index) => {
    const distance = metersFromKm(entry.km + (noise() - 0.5) * 1.6);
    const moving_time = Math.max(900, Math.round((entry.minutes + (noise() - 0.5) * 8) * 60));
    const turns = Math.max(4, Math.round(entry.turns + (noise() - 0.5) * 6));
    const packets = Math.max(40, Math.round(entry.packets + (noise() - 0.5) * 28));
    const avgSpeedKmh = Number(((distance / 1000) / (moving_time / 3600)).toFixed(1));

    return {
      id: 600000 + index,
      title: entry.title,
      distanceMeters: distance,
      durationSeconds: moving_time,
      avgSpeedKmh,
      turnCount: turns,
      instructionPackets: packets,
      startAt: isoDaysAgo(index + 1)
    };
  });

  const baseSyncRows: Array<{ routeName: string; sent: number; acked: number; latency: number }> = [
    { routeName: "Office -> Home", sent: 154, acked: 154, latency: 42 },
    { routeName: "Home -> Metro", sent: 118, acked: 116, latency: 71 },
    { routeName: "Old City Corridor", sent: 207, acked: 206, latency: 53 },
    { routeName: "Ring Road South", sent: 136, acked: 136, latency: 47 }
  ];

  const syncStatuses: DeviceSyncStatus[] = baseSyncRows.map((entry, index) => {
    const sent = Math.max(20, Math.round(entry.sent + (noise() - 0.5) * 20));
    const acked = Math.max(0, Math.min(sent, Math.round(entry.acked + (noise() - 0.5) * 6)));
    const averageLatencyMs = Math.max(20, Math.round(entry.latency + (noise() - 0.5) * 18));
    const ackRate = sent > 0 ? acked / sent : 0;

    return {
      id: 9600 + index,
      routeName: entry.routeName,
      packetsSent: sent,
      packetsAcknowledged: acked,
      averageLatencyMs,
      status: ackRate >= 0.98 && averageLatencyMs <= 70 ? "healthy" : "warning",
      updatedAt: isoDaysAgo(index)
    };
  });

  await new Promise((resolve) => setTimeout(resolve, 350));

  return {
    deviceName: "NavDot Handlebar Unit",
    firmwareVersion: "v1.3.2",
    sessions,
    syncStatuses
  };
}
