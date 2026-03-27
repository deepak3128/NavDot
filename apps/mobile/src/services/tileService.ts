import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { useNavStore } from "../store/useNavStore";
import { TileCoord, tileKey } from "../utils/geo";

const TILE_CACHE_KEY = "navdot-tile-cache";
const MAX_TILE_CACHE_ITEMS = 9;

type CachedTile = {
  key: string;
  savedAt: number;
  encodedSummary: string;
};

async function readTileCache(): Promise<CachedTile[]> {
  const raw = await AsyncStorage.getItem(TILE_CACHE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CachedTile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeTileCache(cache: CachedTile[]): Promise<void> {
  await AsyncStorage.setItem(TILE_CACHE_KEY, JSON.stringify(cache));
}

function summarizeVectorTile(pbfData: Uint8Array): string {
  try {
    const tile = new VectorTile(new Pbf(pbfData));
    const layerCount = Object.keys(tile.layers).length;
    const featureCount = Object.values(tile.layers).reduce((sum, layer) => sum + layer.length, 0);

    return JSON.stringify({ layerCount, featureCount, byteLength: pbfData.byteLength });
  } catch {
    return JSON.stringify({ layerCount: 0, featureCount: 0, byteLength: pbfData.byteLength });
  }
}

function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

export async function fetchAndCacheTile(tile: TileCoord): Promise<string | undefined> {
  const key = tileKey(tile);
  const net = await NetInfo.fetch();
  useNavStore.getState().setIsOnline(Boolean(net.isConnected));

  const cache = await readTileCache();
  const cached = cache.find((item) => item.key === key);

  if (!net.isConnected) {
    useNavStore.getState().setStatusMessage("Offline: using cached tiles");
    return cached?.encodedSummary;
  }

  const url = `https://basemaps.cartocdn.com/carto.streets/v1/${tile.z}/${tile.x}/${tile.y}.mvt`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Tile request failed with status ${response.status}`);
    }

    const bytes = toUint8Array(await response.arrayBuffer());
    const encodedSummary = summarizeVectorTile(bytes);

    const nextCache: CachedTile[] = [
      { key, savedAt: Date.now(), encodedSummary },
      ...cache.filter((item) => item.key !== key)
    ].slice(0, MAX_TILE_CACHE_ITEMS);

    await writeTileCache(nextCache);
    useNavStore.getState().setStatusMessage("Tile updated from network");

    return encodedSummary;
  } catch {
    useNavStore.getState().setStatusMessage("Network unavailable: showing cached tile data");
    return cached?.encodedSummary;
  }
}

export async function getCachedTiles(): Promise<CachedTile[]> {
  return readTileCache();
}
