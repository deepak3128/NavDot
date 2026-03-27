import BackgroundService from "react-native-background-actions";
import { bleService } from "./bleService";
import { fetchAndCacheTile } from "./tileService";
import { useNavStore } from "../store/useNavStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { headingDelta, haversineDistanceMeters, locationToTile, surroundingTiles } from "../utils/geo";

type Snapshot = {
  latitude?: number;
  longitude?: number;
  heading?: number;
  zoom?: number;
};

let streamTimer: ReturnType<typeof setInterval> | undefined;
let lastSnapshot: Snapshot = {};

async function refreshTilesIfNeeded(): Promise<void> {
  const nav = useNavStore.getState();
  if (!nav.hasGpsFix || nav.latitude == null || nav.longitude == null) {
    return;
  }

  const zoom = nav.zoomLevel;
  const current = {
    latitude: nav.latitude,
    longitude: nav.longitude
  };

  const shouldRefresh =
    !lastSnapshot.latitude ||
    !lastSnapshot.longitude ||
    haversineDistanceMeters(current, {
      latitude: lastSnapshot.latitude,
      longitude: lastSnapshot.longitude
    }) > 15 ||
    (lastSnapshot.zoom != null && zoom !== lastSnapshot.zoom) ||
    (lastSnapshot.heading != null && headingDelta(nav.heading, lastSnapshot.heading) > 45);

  if (!shouldRefresh) {
    return;
  }

  const centerTile = locationToTile(nav.latitude, nav.longitude, zoom);
  const grid = surroundingTiles(centerTile);
  await Promise.all(grid.map((tile) => fetchAndCacheTile(tile)));

  lastSnapshot = {
    latitude: nav.latitude,
    longitude: nav.longitude,
    heading: nav.heading,
    zoom
  };

  const centerSummary = await fetchAndCacheTile(centerTile);
  useNavStore.getState().setEncodedTileSummary(centerSummary);
}

async function sendHeadingPacket(): Promise<void> {
  const nav = useNavStore.getState();
  if (!nav.hasGpsFix) {
    return;
  }

  await bleService.writeHeadingPacket({
    heading: nav.heading,
    latitude: nav.latitude,
    longitude: nav.longitude,
    speedMps: nav.speedMps,
    zoom: nav.zoomLevel
  });
}

const backgroundTask = async () => {
  while (BackgroundService.isRunning()) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

export async function startNavigationStreaming(): Promise<void> {
  const settings = useSettingsStore.getState();
  useNavStore.getState().setZoomLevel(settings.defaultZoom);

  if (!streamTimer) {
    streamTimer = setInterval(() => {
      void sendHeadingPacket();
    }, 100);
  }

  await refreshTilesIfNeeded();
  const nav = useNavStore.getState();
  if (nav.hasGpsFix) {
    useNavStore.getState().setStatusMessage("Streaming heading to NavDot at 10Hz");
  }

  if (!BackgroundService.isRunning()) {
    await BackgroundService.start(backgroundTask, {
      taskName: "NavDot Navigation",
      taskTitle: "NavDot navigation active",
      taskDesc: "Maintaining GPS and BLE while screen is locked",
      taskIcon: {
        name: "ic_launcher",
        type: "mipmap"
      },
      color: "#0ea5e9",
      linkingURI: "navdot://"
    });
  }
}

export async function stopNavigationStreaming(): Promise<void> {
  if (streamTimer) {
    clearInterval(streamTimer);
    streamTimer = undefined;
  }

  if (BackgroundService.isRunning()) {
    await BackgroundService.stop();
  }

  useNavStore.getState().setStatusMessage("Navigation paused");
}

export async function tickTileRefresh(): Promise<void> {
  await refreshTilesIfNeeded();
}
