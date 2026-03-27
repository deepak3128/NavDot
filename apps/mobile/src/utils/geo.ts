export type LatLng = {
  latitude: number;
  longitude: number;
};

export type TileCoord = {
  x: number;
  y: number;
  z: number;
};

const EARTH_RADIUS_M = 6371000;

export function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function headingDelta(current: number, previous: number): number {
  const diff = Math.abs(current - previous) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function locationToTile(lat: number, lon: number, zoom: number): TileCoord {
  const tileCount = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * tileCount);

  const latRad = toRad(lat);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCount
  );

  return { x, y, z: zoom };
}

export function tileKey(tile: TileCoord): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

export function surroundingTiles(center: TileCoord): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      tiles.push({
        z: center.z,
        x: center.x + dx,
        y: center.y + dy
      });
    }
  }
  return tiles;
}
