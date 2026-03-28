import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import MapView, { LongPressEvent, Marker, Polyline, Region } from "react-native-maps";
import { useFocusEffect } from "@react-navigation/native";
import { bleService } from "../services/bleService";
import { sendDestinationToBackend } from "../services/backendService";
import { useBleStore } from "../store/useBleStore";
import { useNavStore } from "../store/useNavStore";
import { haversineDistanceMeters } from "../utils/geo";

const DEFAULT_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02
};

type SearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type RouteOption = {
  id: string;
  path: Array<{ latitude: number; longitude: number }>;
  distanceMeters: number;
  etaSeconds: number;
  headingDeg: number;
};

export function HomeScreen() {
  const [busyId, setBusyId] = useState<string | undefined>();
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [selectedDestination, setSelectedDestination] = useState<{ latitude: number; longitude: number }>();
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | undefined>();
  const [lastPacketAt, setLastPacketAt] = useState<string | undefined>();
  const [showHubCard, setShowHubCard] = useState(true);
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number }>();
  const [currentSpeedMps, setCurrentSpeedMps] = useState<number>(0);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [routePath, setRoutePath] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | undefined>();
  const [routeSummary, setRouteSummary] = useState<{ distanceMeters: number; etaSeconds: number; headingDeg: number }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();
  const [gpsStatus, setGpsStatus] = useState("Auto-fetching current location...");
  const { devices, isScanning, isConnected, connectedDeviceId, connectedDeviceName, preferredDeviceName, error } =
    useBleStore();
  const setDestination = useNavStore((state) => state.setDestination);
  const navDestination = useNavStore((state) => state.destination);
  const isRideModeActive = useNavStore((state) => state.isRideModeActive);
  const rideCommandToken = useNavStore((state) => state.rideCommandToken);
  const mapRef = useRef<MapView | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const hasCenteredToCurrentRef = useRef(false);
  const selectedDestinationRef = useRef<{ latitude: number; longitude: number } | undefined>(undefined);
  const lastRouteRefreshAtRef = useRef(0);

  useEffect(() => {
    selectedDestinationRef.current = selectedDestination;
  }, [selectedDestination]);

  useEffect(() => {
    if (!navDestination) {
      return;
    }

    setSelectedDestination((previous) => {
      if (
        previous &&
        Math.abs(previous.latitude - navDestination.latitude) < 0.000001 &&
        Math.abs(previous.longitude - navDestination.longitude) < 0.000001
      ) {
        return previous;
      }

      return {
        latitude: navDestination.latitude,
        longitude: navDestination.longitude
      };
    });
  }, [navDestination]);

  useEffect(() => {
    const active = routeOptions[activeRouteIndex];
    if (!active) {
      setRoutePath([]);
      setRouteSummary(undefined);
      return;
    }

    setRoutePath(active.path);
    setRouteSummary({
      distanceMeters: active.distanceMeters,
      etaSeconds: active.etaSeconds,
      headingDeg: active.headingDeg
    });
  }, [activeRouteIndex, routeOptions]);

  const focusOnRoute = (path: Array<{ latitude: number; longitude: number }>) => {
    if (!path.length || !mapRef.current) {
      return;
    }

    const coordinates = currentPosition ? [currentPosition, ...path] : path;
    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 100, right: 60, bottom: 250, left: 60 },
      animated: true
    });
  };

  const routeMetrics = useMemo(() => {
    if (routeSummary) {
      return routeSummary;
    }

    if (!currentPosition || !selectedDestination) {
      return undefined;
    }

    const distanceMeters = haversineDistanceMeters(currentPosition, selectedDestination);
    const speedMps = currentSpeedMps > 1 ? currentSpeedMps : 4.1;
    const etaSeconds = Math.round(distanceMeters / speedMps);

    const lat1 = (currentPosition.latitude * Math.PI) / 180;
    const lat2 = (selectedDestination.latitude * Math.PI) / 180;
    const dLon = ((selectedDestination.longitude - currentPosition.longitude) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const heading = (Math.atan2(y, x) * 180) / Math.PI;
    const normalizedHeading = (heading + 360) % 360;

    return {
      distanceMeters,
      etaSeconds,
      headingDeg: Math.round(normalizedHeading)
    };
  }, [currentPosition, currentSpeedMps, routeSummary, selectedDestination]);

  const routeTagsByIndex = useMemo(() => {
    if (!routeOptions.length) {
      return [] as string[][];
    }

    let fastestIndex = 0;
    let shortestIndex = 0;

    routeOptions.forEach((route, index) => {
      if (route.etaSeconds < routeOptions[fastestIndex].etaSeconds) {
        fastestIndex = index;
      }

      if (route.distanceMeters < routeOptions[shortestIndex].distanceMeters) {
        shortestIndex = index;
      }
    });

    return routeOptions.map((_, index) => {
      const tags: string[] = [];
      if (index === 0) {
        tags.push("Recommended");
      }
      if (index === fastestIndex) {
        tags.push("Fastest");
      }
      if (index === shortestIndex) {
        tags.push("Shortest");
      }
      return tags;
    });
  }, [routeOptions]);

  const fetchRoadRoute = async (
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number }
  ) => {
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setRouteLoading(true);
    setRouteError(undefined);

    try {
      const mapRouteToOption = (
        route: {
          distance: number;
          duration: number;
          geometry?: { coordinates?: Array<[number, number]> };
        },
        index: number
      ): RouteOption | undefined => {
        const coordinates = route.geometry?.coordinates ?? [];
        if (!coordinates.length) {
          return undefined;
        }

        const points = coordinates.map((point) => ({
          latitude: point[1],
          longitude: point[0]
        }));

        const firstLeg = points.length >= 2 ? points[1] : destination;
        const lat1 = (origin.latitude * Math.PI) / 180;
        const lat2 = (firstLeg.latitude * Math.PI) / 180;
        const dLon = ((firstLeg.longitude - origin.longitude) * Math.PI) / 180;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const headingDeg = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);

        return {
          id: `route-${index + 1}`,
          path: points,
          distanceMeters: route.distance,
          etaSeconds: Math.round(route.duration),
          headingDeg
        };
      };

      const parseRoutesFromUrl = async (url: string) => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Route request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          routes?: Array<{
            distance: number;
            duration: number;
            geometry?: { coordinates?: Array<[number, number]> };
          }>;
        };

        return payload.routes ?? [];
      };

      const originCoord = `${origin.longitude},${origin.latitude}`;
      const destinationCoord = `${destination.longitude},${destination.latitude}`;
      const directUrl = `https://router.project-osrm.org/route/v1/cycling/${originCoord};${destinationCoord}?overview=full&geometries=geojson&alternatives=true`;

      const primaryRoutes = await parseRoutesFromUrl(directUrl);
      let candidateRawRoutes = [...primaryRoutes];

      if (primaryRoutes.length < 2) {
        const midLat = (origin.latitude + destination.latitude) / 2;
        const midLon = (origin.longitude + destination.longitude) / 2;

        const dx = destination.longitude - origin.longitude;
        const dy = destination.latitude - origin.latitude;
        const vectorLength = Math.sqrt(dx * dx + dy * dy) || 1;
        const perpX = -dy / vectorLength;
        const perpY = dx / vectorLength;

        const distanceMeters = haversineDistanceMeters(origin, destination);
        const offsetMeters = Math.max(150, Math.min(1200, distanceMeters * 0.15));
        const offsetLatDeg = offsetMeters / 111320;
        const offsetLonDeg = offsetMeters / (111320 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));

        const leftMid = {
          latitude: midLat + perpY * offsetLatDeg,
          longitude: midLon + perpX * offsetLonDeg
        };

        const rightMid = {
          latitude: midLat - perpY * offsetLatDeg,
          longitude: midLon - perpX * offsetLonDeg
        };

        const viaUrls = [leftMid, rightMid].map((midpoint) => {
          const midpointCoord = `${midpoint.longitude},${midpoint.latitude}`;
          return `https://router.project-osrm.org/route/v1/cycling/${originCoord};${midpointCoord};${destinationCoord}?overview=full&geometries=geojson&alternatives=false`;
        });

        const viaResults = await Promise.all(
          viaUrls.map(async (url) => {
            try {
              return await parseRoutesFromUrl(url);
            } catch {
              return [];
            }
          })
        );

        candidateRawRoutes = [...candidateRawRoutes, ...viaResults.flat()];
      }

      const dedupedRawRoutes = candidateRawRoutes.filter((route, index, arr) => {
        const key = `${Math.round(route.distance / 25)}-${Math.round(route.duration / 25)}`;
        return arr.findIndex((other) => `${Math.round(other.distance / 25)}-${Math.round(other.duration / 25)}` === key) === index;
      });

      const mappedRoutes: RouteOption[] = dedupedRawRoutes
        .slice(0, 3)
        .map((route, index) => mapRouteToOption(route, index))
        .filter((route): route is RouteOption => Boolean(route));

      if (!mappedRoutes.length) {
        throw new Error("No route geometry found for this destination.");
      }

      setRouteOptions(mappedRoutes);
      setActiveRouteIndex((previous) => (previous < mappedRoutes.length ? previous : 0));
      setGpsStatus(mappedRoutes.length > 1 ? `Found ${mappedRoutes.length} route options.` : "Route ready.");
    } catch (routeFetchError) {
      if (routeFetchError instanceof Error && routeFetchError.name === "AbortError") {
        return;
      }

      setRouteOptions([]);
      setActiveRouteIndex(0);
      setRoutePath([]);
      setRouteSummary(undefined);
      setRouteError(routeFetchError instanceof Error ? routeFetchError.message : "Unable to calculate road route.");
    } finally {
      setRouteLoading(false);
    }
  };

  const searchDestination = async (query: string) => {
    const text = query.trim();
    if (text.length < 3) {
      setSearchResults([]);
      setSearchError(undefined);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearchLoading(true);
    setSearchError(undefined);

    try {
      const encoded = encodeURIComponent(text);
      const bias = currentPosition ? `&lat=${currentPosition.latitude}&lon=${currentPosition.longitude}` : "";
      const url = `https://photon.komoot.io/api/?q=${encoded}&limit=6${bias}`;

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Search failed (${response.status})`);
      }

      const payload = (await response.json()) as {
        features?: Array<{
          properties?: {
            name?: string;
            street?: string;
            city?: string;
            state?: string;
            country?: string;
          };
          geometry?: {
            coordinates?: [number, number];
          };
        }>;
      };

      const mapped = (payload.features ?? [])
        .map((item, index) => {
          const coordinates = item.geometry?.coordinates;
          const lat = coordinates?.[1];
          const lon = coordinates?.[0];

          const parts = [
            item.properties?.name,
            item.properties?.street,
            item.properties?.city,
            item.properties?.state,
            item.properties?.country
          ].filter((part): part is string => Boolean(part && part.trim()));

          return {
            id: String(index + 1),
            label: parts.join(", ") || text,
            latitude: Number(lat),
            longitude: Number(lon)
          };
        })
        .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

      if (mapped.length) {
        setSearchResults(mapped);
        setSearchError(undefined);
        return;
      }

      const fallback = await Location.geocodeAsync(text);
      const fallbackResults = fallback.slice(0, 3).map((item, index) => ({
        id: `fallback-${index + 1}`,
        label: `Result ${index + 1}: ${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`,
        latitude: item.latitude,
        longitude: item.longitude
      }));

      setSearchResults(fallbackResults);
      if (!fallbackResults.length) {
        setSearchError("No matching location found.");
      }
    } catch (searchErr) {
      if (searchErr instanceof Error && searchErr.name === "AbortError") {
        return;
      }

      try {
        const fallback = await Location.geocodeAsync(text);
        const fallbackResults = fallback.slice(0, 3).map((item, index) => ({
          id: `fallback-${index + 1}`,
          label: `Result ${index + 1}: ${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`,
          latitude: item.latitude,
          longitude: item.longitude
        }));

        setSearchResults(fallbackResults);
        setSearchError(fallbackResults.length ? undefined : "Unable to search location.");
      } catch {
        setSearchResults([]);
        setSearchError(searchErr instanceof Error ? searchErr.message : "Unable to search location.");
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const applyDestination = (destination: { latitude: number; longitude: number }) => {
    setSelectedDestination(destination);
    setDestination({
      latitude: destination.latitude,
      longitude: destination.longitude,
      label: "selected_pin"
    });
    setShowHubCard(false);
    setSendMessage(undefined);

    const nextRegion: Region = {
      latitude: destination.latitude,
      longitude: destination.longitude,
      latitudeDelta: mapRegion.latitudeDelta,
      longitudeDelta: mapRegion.longitudeDelta
    };

    setMapRegion((previous) => ({
      ...previous,
      latitude: destination.latitude,
      longitude: destination.longitude
    }));

    mapRef.current?.animateToRegion(nextRegion, 600);

    setRouteOptions([]);
    setActiveRouteIndex(0);

    if (currentPosition) {
      void fetchRoadRoute(currentPosition, destination);
    }
  };

  const deliveryStatus = useMemo(() => {
    if (sendBusy) {
      return {
        label: "Sending",
        detail: "Pushing turn instructions to device...",
        tone: "text-[#0369a1]"
      };
    }

    if (sendMessage && /sent/i.test(sendMessage)) {
      return {
        label: "Delivered",
        detail: lastPacketAt ? `Last packet ${new Date(lastPacketAt).toLocaleTimeString()}` : "Destination packet acknowledged.",
        tone: "text-[#15803d]"
      };
    }

    if (sendMessage) {
      return {
        label: "Needs Attention",
        detail: sendMessage,
        tone: "text-[#b45309]"
      };
    }

    return {
      label: "Idle",
      detail: "Pick a pin and send instructions to NavDot device.",
      tone: "text-[#6b7280]"
    };
  }, [lastPacketAt, sendBusy, sendMessage]);

  useEffect(() => {
    const hideTimer = setTimeout(() => {
      setShowHubCard(false);
    }, 3500);

    return () => {
      clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | undefined;

    const maybeCenterToCurrent = (latitude: number, longitude: number) => {
      if (hasCenteredToCurrentRef.current || selectedDestinationRef.current) {
        return;
      }

      hasCenteredToCurrentRef.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02
        },
        700
      );
    };

    const bootstrapLocation = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setGpsStatus("Location permission denied. Enable it to auto-fetch current location.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      setMapRegion((previous) => ({
        ...previous,
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      }));

      setCurrentPosition({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      });
      setCurrentSpeedMps(current.coords.speed ?? 0);
      setGpsStatus("Current location synced.");
      maybeCenterToCurrent(current.coords.latitude, current.coords.longitude);

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 1500,
          distanceInterval: 2
        },
        (location) => {
          setCurrentPosition({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude
          });
          setCurrentSpeedMps(location.coords.speed ?? 0);
          setGpsStatus("Current location synced.");
          maybeCenterToCurrent(location.coords.latitude, location.coords.longitude);
        }
      );
    };

    void bootstrapLocation().catch(() => {
      setGpsStatus("Unable to fetch current location right now.");
    });

    return () => {
      locationSubscription?.remove();
      routeAbortRef.current?.abort();
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchDestination(searchQuery);
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [currentPosition, searchQuery]);

  useFocusEffect(
    useMemo(
      () => () => {
        if (!isRideModeActive || !currentPosition) {
          return;
        }

        mapRef.current?.animateToRegion(
          {
            latitude: currentPosition.latitude,
            longitude: currentPosition.longitude,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006
          },
          700
        );

        const destination = selectedDestinationRef.current;
        if (destination) {
          void fetchRoadRoute(currentPosition, destination);
          setGpsStatus("Ride mode active. Centered on your position and navigating.");
          return;
        }

        setGpsStatus("Ride mode active. Centered on your position.");
      },
      [currentPosition, isRideModeActive]
    )
  );

  useEffect(() => {
    if (!isRideModeActive || !currentPosition || !selectedDestination) {
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008
      },
      700
    );

    const now = Date.now();
    if (now - lastRouteRefreshAtRef.current < 5000) {
      return;
    }

    lastRouteRefreshAtRef.current = now;
    void fetchRoadRoute(currentPosition, selectedDestination);
    setGpsStatus("Ride mode active. Tracking live position.");
  }, [currentPosition, isRideModeActive, selectedDestination]);

  useEffect(() => {
    if (!isRideModeActive || !currentPosition) {
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006
      },
      750
    );

    if (selectedDestination) {
      void fetchRoadRoute(currentPosition, selectedDestination);
      setGpsStatus("Start ride detected. Zoomed to your current position.");
      return;
    }

    setGpsStatus("Start ride detected. Current position locked.");
  }, [currentPosition, isRideModeActive, rideCommandToken, selectedDestination]);

  const handleScan = async () => {
    try {
      const granted = await bleService.requestPermissions();
      if (!granted) {
        useBleStore.getState().setError("Bluetooth permission denied.");
        return;
      }

      await bleService.waitForPoweredOn();
      await bleService.startScan();
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : "Unable to start Bluetooth scan.";
      useBleStore.getState().setError(message);
      Alert.alert("Scan failed", message);
    }
  };

  const connect = async (deviceId: string) => {
    setBusyId(deviceId);
    try {
      await bleService.connect(deviceId);
    } finally {
      setBusyId(undefined);
    }
  };

  const selectDestination = (event: LongPressEvent) => {
    const coordinate = event.nativeEvent.coordinate;
    applyDestination({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude
    });
  };

  const recenterToCurrentLocation = async () => {
    const animateTo = (latitude: number, longitude: number) => {
      const nextRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: mapRegion.latitudeDelta,
        longitudeDelta: mapRegion.longitudeDelta
      };

      setMapRegion((previous) => ({
        ...previous,
        latitude,
        longitude
      }));

      mapRef.current?.animateToRegion(nextRegion, 500);
      setGpsStatus("Centered on current location.");
    };

    if (currentPosition) {
      animateTo(currentPosition.latitude, currentPosition.longitude);
      return;
    }

    try {
      setGpsStatus("Fetching current location...");
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setGpsStatus("Location permission denied. Enable it to recenter.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      setCurrentPosition({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      });
      setCurrentSpeedMps(current.coords.speed ?? 0);
      animateTo(current.coords.latitude, current.coords.longitude);
    } catch {
      setGpsStatus("Unable to recenter right now.");
    }
  };

  const sendDestination = async () => {
    if (!selectedDestination) {
      setSendMessage("Long-press map to choose a destination pin.");
      return;
    }

    if (!connectedDeviceId) {
      setSendMessage("Pair a device before sending a destination.");
      return;
    }

    setSendBusy(true);
    setSendMessage(undefined);

    try {
      await bleService.writeDestinationPacket({
        latitude: selectedDestination.latitude,
        longitude: selectedDestination.longitude,
        label: "selected_pin"
      });

      await sendDestinationToBackend({
        deviceId: connectedDeviceId,
        latitude: selectedDestination.latitude,
        longitude: selectedDestination.longitude,
        label: "selected_pin",
        source: "mobile-map"
      });

      setSendMessage("Destination sent to device and synced to backend.");
      setLastPacketAt(new Date().toISOString());
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Failed to send destination.";
      setSendMessage(message);
    } finally {
      setSendBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-[#f3f4f6]">
      <View className="h-[48%] overflow-hidden rounded-b-[28px]">
        <MapView
          ref={(instance) => {
            mapRef.current = instance;
          }}
          style={{ flex: 1 }}
          initialRegion={mapRegion}
          onLongPress={selectDestination}
          showsUserLocation
          showsMyLocationButton
        >
          {routePath.length > 1 ? (
            <Polyline
              coordinates={routePath}
              strokeColor="#0f172a"
              strokeWidth={5}
            />
          ) : null}
          {selectedDestination ? <Marker coordinate={selectedDestination} title="Selected destination" /> : null}
        </MapView>

        {showHubCard ? (
          <View pointerEvents="none" className="absolute left-5 right-5 top-4 rounded-2xl bg-[#fc4c02]/95 px-4 py-3">
            <Text className="text-[11px] font-extrabold uppercase tracking-[1.8px] text-[#ffedd5]">Navigation Hub</Text>
            <Text className="mt-1 text-xl font-black text-white">Send Route To Handlebar Device</Text>
            <Text className="mt-1 text-xs text-[#fff7ed]">Long-press map to pin destination, then tap Send To Device.</Text>
          </View>
        ) : null}

        <Pressable
          className="absolute bottom-5 right-5 h-12 w-12 items-center justify-center rounded-full border border-[#d1d5db] bg-white"
          onPress={() => {
            void recenterToCurrentLocation();
          }}
        >
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: 6,
              borderRightWidth: 6,
              borderBottomWidth: 12,
              borderLeftColor: "transparent",
              borderRightColor: "transparent",
              borderBottomColor: "#111827",
              transform: [{ rotate: "0deg" }],
              marginBottom: 1
            }}
          />
          <View className="h-1.5 w-1.5 rounded-full bg-[#111827]" />
        </Pressable>
      </View>

      <View className="-mt-6 flex-1 rounded-t-[28px] border border-[#e5e7eb] bg-white">
        <ScrollView
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[11px] font-bold uppercase tracking-[1.8px] text-[#6b7280]">Device</Text>
              <Text className="mt-1 text-lg font-extrabold text-[#111827]">
                {isConnected ? connectedDeviceName ?? "NavDot Device" : "No Device Connected"}
              </Text>
              <Text className="mt-1 text-xs text-[#6b7280]">
                {preferredDeviceName ? `Preferred: ${preferredDeviceName}` : "Pick one device to save as preferred."}
              </Text>
            </View>

            <View className={`rounded-full px-3 py-1.5 ${isConnected ? "bg-[#dcfce7]" : "bg-[#fee2e2]"}`}>
              <Text className={`text-xs font-extrabold ${isConnected ? "text-[#15803d]" : "text-[#b91c1c]"}`}>
                {isConnected ? "CONNECTED" : "OFFLINE"}
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row gap-2">
            <Pressable className="flex-1 rounded-xl bg-[#fc4c02] px-3 py-3" onPress={handleScan} disabled={isScanning}>
              {isScanning ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-center text-xs font-black tracking-wide text-white">Scan Devices</Text>
              )}
            </Pressable>

            <Pressable
              className="flex-[1.4] rounded-xl bg-[#111827] px-3 py-3"
              onPress={() => void sendDestination()}
              disabled={sendBusy}
            >
              {sendBusy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-center text-xs font-black tracking-wide text-white">Send To Device</Text>
              )}
            </Pressable>
          </View>

          <View className="mt-3 rounded-xl bg-[#f9fafb] px-3 py-3">
            <Text className="text-[11px] uppercase tracking-wide text-[#6b7280]">Search Destination</Text>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search place or address"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => {
                const first = searchResults[0];
                if (first) {
                  setSearchQuery(first.label);
                  setSearchResults([]);
                  applyDestination({ latitude: first.latitude, longitude: first.longitude });
                  return;
                }

                const query = searchQuery.trim();
                if (!query) {
                  return;
                }

                void Location.geocodeAsync(query).then((fallback) => {
                  const firstFallback = fallback[0];
                  if (!firstFallback) {
                    setSearchError("No matching location found.");
                    return;
                  }

                  setSearchError(undefined);
                  applyDestination({
                    latitude: firstFallback.latitude,
                    longitude: firstFallback.longitude
                  });
                });
              }}
              className="mt-2 rounded-xl border border-[#d1d5db] bg-white px-3 py-2.5 text-[#111827]"
            />
            <Text className="mt-2 text-xs text-[#4b5563]">{gpsStatus}</Text>
            {searchLoading ? <Text className="mt-2 text-xs text-[#0369a1]">Searching...</Text> : null}
            {searchError ? <Text className="mt-2 text-xs text-[#b45309]">{searchError}</Text> : null}
            {searchResults.length ? (
              <View className="mt-2 gap-1">
                {searchResults.map((result) => (
                  <Pressable
                    key={result.id}
                    className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2"
                    onPress={() => {
                      setSearchQuery(result.label);
                      setSearchResults([]);
                      applyDestination({ latitude: result.latitude, longitude: result.longitude });
                    }}
                  >
                    <Text className="text-xs text-[#111827]" numberOfLines={2}>{result.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View className="mt-2 flex-row flex-wrap gap-2">
              <View className="rounded-lg bg-white px-2.5 py-1.5">
                <Text className="text-[10px] uppercase text-[#6b7280]">Distance</Text>
                <Text className="text-xs font-bold text-[#111827]">
                  {routeMetrics ? `${(routeMetrics.distanceMeters / 1000).toFixed(2)} km` : "-"}
                </Text>
              </View>
              <View className="rounded-lg bg-white px-2.5 py-1.5">
                <Text className="text-[10px] uppercase text-[#6b7280]">ETA</Text>
                <Text className="text-xs font-bold text-[#111827]">
                  {routeMetrics
                    ? `${Math.max(1, Math.round(routeMetrics.etaSeconds / 60))} min`
                    : "-"}
                </Text>
              </View>
              <View className="rounded-lg bg-white px-2.5 py-1.5">
                <Text className="text-[10px] uppercase text-[#6b7280]">Heading</Text>
                <Text className="text-xs font-bold text-[#111827]">{routeMetrics ? `${routeMetrics.headingDeg}°` : "-"}</Text>
              </View>
            </View>
            {routeOptions.length > 1 ? (
              <View className="mt-2">
                <Text className="text-[10px] uppercase tracking-wide text-[#6b7280]">Choose Route</Text>
                <View className="mt-1 flex-row flex-wrap gap-2">
                  {routeOptions.map((route, index) => {
                    const selected = index === activeRouteIndex;
                    const tags = routeTagsByIndex[index] ?? [];
                    return (
                      <Pressable
                        key={route.id}
                        className={`rounded-lg border px-2.5 py-1.5 ${selected ? "border-[#111827] bg-[#111827]" : "border-[#d1d5db] bg-white"}`}
                        onPress={() => {
                          setActiveRouteIndex(index);
                          setGpsStatus(`Route ${index + 1} selected.`);
                          focusOnRoute(route.path);
                        }}
                      >
                        <Text className={`text-[11px] font-bold ${selected ? "text-white" : "text-[#111827]"}`}>
                          Route {index + 1}
                        </Text>
                        {tags.length ? (
                          <Text className={`text-[10px] ${selected ? "text-[#fde68a]" : "text-[#0369a1]"}`}>
                            {tags.join(" • ")}
                          </Text>
                        ) : null}
                        <Text className={`text-[10px] ${selected ? "text-[#e5e7eb]" : "text-[#6b7280]"}`}>
                          {(route.distanceMeters / 1000).toFixed(1)} km • {Math.max(1, Math.round(route.etaSeconds / 60))} min
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {routeLoading ? <Text className="mt-2 text-xs text-[#0369a1]">Calculating bike road route...</Text> : null}
            {routeError ? <Text className="mt-2 text-xs text-[#b45309]">{routeError}</Text> : null}
          </View>

          <View className="mt-3 rounded-xl border border-[#e5e7eb] px-3 py-3">
            <Text className="text-[11px] uppercase tracking-wide text-[#6b7280]">Instruction Delivery</Text>
            <Text className={`mt-1 text-sm font-extrabold ${deliveryStatus.tone}`}>{deliveryStatus.label}</Text>
            <Text className="mt-1 text-xs text-[#4b5563]">{deliveryStatus.detail}</Text>
          </View>

          {error ? <Text className="mt-2 text-xs text-[#dc2626]">{error}</Text> : null}

          <View className="mt-3 gap-2">
            {devices.map((device) => (
              <View key={device.id} className="rounded-xl border border-[#e5e7eb] px-3 py-2.5">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-sm font-bold text-[#111827]">{device.name}</Text>
                    <Text className="text-[11px] text-[#6b7280]">Signal RSSI {device.rssi}</Text>
                  </View>
                  <Pressable
                    className="rounded-lg border border-[#fc4c02] bg-[#fff5f1] px-3 py-1.5"
                    onPress={() => connect(device.id)}
                    disabled={busyId === device.id}
                  >
                    {busyId === device.id ? (
                      <ActivityIndicator color="#fc4c02" size="small" />
                    ) : (
                      <Text className="text-xs font-bold text-[#fc4c02]">Connect</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}

            {!devices.length && !isScanning ? (
              <View className="rounded-xl border border-dashed border-[#d1d5db] px-3 py-3">
                <Text className="text-xs text-[#6b7280]">No nearby devices yet. Tap Scan Devices.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
