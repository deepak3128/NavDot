import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import MapView, { LongPressEvent, MapPressEvent, Marker, Polyline, Region } from "react-native-maps";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { bleService } from "../services/bleService";
import { sendDestinationToBackend } from "../services/backendService";
import { useBleStore } from "../store/useBleStore";
import { usePlacesStore } from "../store/usePlacesStore";
import { useNavStore } from "../store/useNavStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { haversineDistanceMeters } from "../utils/geo";

const DEFAULT_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02
};

const RECENT_SEARCHES_STORAGE_KEY = "navdot-recent-searches";
const ORIGIN_STORAGE_KEY = "navdot-custom-origin";

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#d1d5db" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111827" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#374151" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#374151" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1f2937" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] }
];

type SearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type RoutePoint = {
  latitude: number;
  longitude: number;
};

type RecentSearch = {
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
  direction: string;
  nextTurnDistanceMeters: number;
};

type RoutePreference = "recommended" | "fastest" | "shortest";

function distanceToRouteMeters(position: RoutePoint, path: RoutePoint[]): number {
  if (!path.length) {
    return Number.MAX_SAFE_INTEGER;
  }

  return path.reduce((minimum, point) => {
    const distance = haversineDistanceMeters(position, point);
    return Math.min(minimum, distance);
  }, Number.MAX_SAFE_INTEGER);
}

export function HomeScreen() {
  const isDark = useSettingsStore((state) => state.themeMode === "dark");
  const [busyId, setBusyId] = useState<string | undefined>();
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [selectedDestination, setSelectedDestination] = useState<{ latitude: number; longitude: number }>();
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | undefined>();
  const [lastPacketAt, setLastPacketAt] = useState<string | undefined>();
  const [showHubCard, setShowHubCard] = useState(true);
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number }>();
  const [selectedOrigin, setSelectedOrigin] = useState<{ latitude: number; longitude: number; label?: string }>();
  const [currentSpeedMps, setCurrentSpeedMps] = useState<number>(0);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [routePreference, setRoutePreference] = useState<RoutePreference>("recommended");
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [routePath, setRoutePath] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | undefined>();
  const [routeSummary, setRouteSummary] = useState<{ distanceMeters: number; etaSeconds: number; headingDeg: number }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [originQuery, setOriginQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();
  const [activeSearchField, setActiveSearchField] = useState<"from" | "to">("to");
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [favoriteLabelInput, setFavoriteLabelInput] = useState("");
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("Auto-fetching current location...");
  const { devices, isScanning, isConnected, connectedDeviceId, connectedDeviceName, preferredDeviceName, error } =
    useBleStore();
  const setDestination = useNavStore((state) => state.setDestination);
  const navDestination = useNavStore((state) => state.destination);
  const isRideModeActive = useNavStore((state) => state.isRideModeActive);
  const rideCommandToken = useNavStore((state) => state.rideCommandToken);
  const setNavigationRoute = useNavStore((state) => state.setNavigationRoute);
  const setNavigationTelemetry = useNavStore((state) => state.setNavigationTelemetry);
  const resetNavigationRoute = useNavStore((state) => state.resetNavigationRoute);
  const savedPlaces = usePlacesStore((state) => state.savedPlaces);
  const upsertSavedPlace = usePlacesStore((state) => state.upsertSavedPlace);
  const navigation = useNavigation();
  const mapRef = useRef<MapView | null>(null);
  const bottomScrollRef = useRef<ScrollView | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const modalFromInputRef = useRef<TextInput | null>(null);
  const modalToInputRef = useRef<TextInput | null>(null);
  const hasCenteredToCurrentRef = useRef(false);
  const selectedDestinationRef = useRef<{ latitude: number; longitude: number } | undefined>(undefined);
  const lastRouteRefreshAtRef = useRef(0);
  const lastOffRouteRef = useRef(0);
  const pendingFavoriteDestinationRef = useRef<{ latitude: number; longitude: number } | undefined>(undefined);

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
    const hydrateSearchState = async () => {
      try {
        const [recentRaw, originRaw] = await Promise.all([
          AsyncStorage.getItem(RECENT_SEARCHES_STORAGE_KEY),
          AsyncStorage.getItem(ORIGIN_STORAGE_KEY)
        ]);

        if (recentRaw) {
          const parsed = JSON.parse(recentRaw) as RecentSearch[];
          if (Array.isArray(parsed)) {
            setRecentSearches(parsed.slice(0, 6));
          }
        }

        if (originRaw) {
          const parsed = JSON.parse(originRaw) as { latitude: number; longitude: number; label?: string };
          if (Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
            setSelectedOrigin({
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              label: parsed.label
            });
            if (parsed.label) {
              setOriginQuery(parsed.label);
            }
          }
        }
      } catch {
        // Ignore persistence restore errors.
      }
    };

    void hydrateSearchState();
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    if (!selectedOrigin) {
      void AsyncStorage.removeItem(ORIGIN_STORAGE_KEY);
      return;
    }

    void AsyncStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(selectedOrigin));
  }, [selectedOrigin]);

  useEffect(() => {
    if (!routeOptions.length) {
      return;
    }

    if (routePreference === "recommended") {
      setActiveRouteIndex(0);
      return;
    }

    const targetIndex = routeOptions.reduce((bestIndex, route, index) => {
      const best = routeOptions[bestIndex];
      if (routePreference === "fastest") {
        return route.etaSeconds < best.etaSeconds ? index : bestIndex;
      }

      return route.distanceMeters < best.distanceMeters ? index : bestIndex;
    }, 0);

    setActiveRouteIndex(targetIndex);
  }, [routeOptions, routePreference]);

  useEffect(() => {
    const active = routeOptions[activeRouteIndex];
    if (!active) {
      setRoutePath([]);
      setRouteSummary(undefined);
      resetNavigationRoute();
      return;
    }

    setRoutePath(active.path);
    setRouteSummary({
      distanceMeters: active.distanceMeters,
      etaSeconds: active.etaSeconds,
      headingDeg: active.headingDeg
    });
    setNavigationRoute({
      currentDirection: active.direction,
      distance: active.nextTurnDistanceMeters || active.distanceMeters,
      polyline: normalizeRoutePolyline(active.path)
    });
  }, [activeRouteIndex, routeOptions]);

  useEffect(() => {
    setNavigationTelemetry({
      speed: currentSpeedMps > 0 ? currentSpeedMps * 3.6 : 0
    });
  }, [currentSpeedMps, setNavigationTelemetry]);

  const effectiveRouteOrigin = selectedOrigin ?? currentPosition;

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

    if (!effectiveRouteOrigin || !selectedDestination) {
      return undefined;
    }

    const distanceMeters = haversineDistanceMeters(effectiveRouteOrigin, selectedDestination);
    const speedMps = currentSpeedMps > 1 ? currentSpeedMps : 4.1;
    const etaSeconds = Math.round(distanceMeters / speedMps);

    const lat1 = (effectiveRouteOrigin.latitude * Math.PI) / 180;
    const lat2 = (selectedDestination.latitude * Math.PI) / 180;
    const dLon = ((selectedDestination.longitude - effectiveRouteOrigin.longitude) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const heading = (Math.atan2(y, x) * 180) / Math.PI;
    const normalizedHeading = (heading + 360) % 360;

    return {
      distanceMeters,
      etaSeconds,
      headingDeg: Math.round(normalizedHeading)
    };
  }, [effectiveRouteOrigin, currentSpeedMps, routeSummary, selectedDestination]);

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

  const matchingSavedPlaces = useMemo(() => {
    const query = (activeSearchField === "from" ? originQuery : searchQuery).trim().toLowerCase();
    if (!query) {
      return savedPlaces;
    }

    return savedPlaces.filter((place) => place.label.toLowerCase().includes(query));
  }, [activeSearchField, originQuery, savedPlaces, searchQuery]);

  const savedPlacesLookup = useMemo(() => {
    return new Map(savedPlaces.map((place) => [place.id, place]));
  }, [savedPlaces]);

  const normalizeRoutePolyline = (points: RoutePoint[]): Array<[number, number]> => {
    if (!points.length) {
      return [];
    }

    const minLat = Math.min(...points.map((point) => point.latitude));
    const maxLat = Math.max(...points.map((point) => point.latitude));
    const minLng = Math.min(...points.map((point) => point.longitude));
    const maxLng = Math.max(...points.map((point) => point.longitude));

    const latSpan = Math.max(maxLat - minLat, 1e-9);
    const lngSpan = Math.max(maxLng - minLng, 1e-9);

    return points.slice(0, 120).map((point) => {
      const x = (point.longitude - minLng) / lngSpan;
      const y = (point.latitude - minLat) / latSpan;
      return [Number(x.toFixed(4)), Number(y.toFixed(4))];
    });
  };

  const bleDebug = useMemo(() => bleService.getDebugState(), [connectedDeviceId, isConnected, isScanning, devices.length, error]);

  const fetchRoadRoute = async (
    origin: RoutePoint,
    destination: RoutePoint
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
          legs?: Array<{
            steps?: Array<{
              distance?: number;
              maneuver?: {
                type?: string;
                modifier?: string;
              };
            }>;
          }>;
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

        const firstStep = route.legs?.[0]?.steps?.[0];
        const maneuverType = (firstStep?.maneuver?.type ?? "").toLowerCase();
        const maneuverModifier = (firstStep?.maneuver?.modifier ?? "").toLowerCase();

        let direction = "STRAIGHT";
        if (maneuverType.includes("uturn") || maneuverModifier.includes("uturn")) {
          direction = "UTURN";
        } else if (maneuverModifier.includes("left")) {
          direction = "LEFT";
        } else if (maneuverModifier.includes("right")) {
          direction = "RIGHT";
        }

        return {
          id: `route-${index + 1}`,
          path: points,
          distanceMeters: route.distance,
          etaSeconds: Math.round(route.duration),
          headingDeg,
          direction,
          nextTurnDistanceMeters: Math.round(firstStep?.distance ?? 0)
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
            legs?: Array<{
              steps?: Array<{
                distance?: number;
                maneuver?: {
                  type?: string;
                  modifier?: string;
                };
              }>;
            }>;
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

  const searchDestination = async (query: string, biasOrigin?: RoutePoint) => {
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
      const bias = biasOrigin ? `&lat=${biasOrigin.latitude}&lon=${biasOrigin.longitude}` : "";
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

      const savedMatches = savedPlaces
        .filter((place) => place.label.toLowerCase().includes(text.toLowerCase()))
        .map((place) => ({
          id: `saved-${place.id}`,
          label: `${place.label} (saved)` ,
          latitude: place.latitude,
          longitude: place.longitude
        }));

      const mergedResults = [...savedMatches, ...mapped].filter(
        (item, index, array) => array.findIndex((other) => other.label === item.label && other.latitude === item.latitude && other.longitude === item.longitude) === index
      );

      if (mergedResults.length) {
        setSearchResults(mergedResults);
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

      setSearchResults([...savedMatches, ...fallbackResults]);
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

        setSearchResults([
          ...savedPlaces
            .filter((place) => place.label.toLowerCase().includes(text.toLowerCase()))
            .map((place) => ({
              id: `saved-${place.id}`,
              label: `${place.label} (saved)`,
              latitude: place.latitude,
              longitude: place.longitude
            })),
          ...fallbackResults
        ]);
        setSearchError(fallbackResults.length ? undefined : "Unable to search location.");
      } catch {
        setSearchResults([]);
        setSearchError(searchErr instanceof Error ? searchErr.message : "Unable to search location.");
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const applyDestination = (destination: RoutePoint) => {
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

    if (effectiveRouteOrigin) {
      void fetchRoadRoute(effectiveRouteOrigin, destination);
    }
  };

  const applyOrigin = (origin: RoutePoint, label?: string) => {
    setSelectedOrigin({
      latitude: origin.latitude,
      longitude: origin.longitude,
      label
    });
    setOriginQuery(label ?? `${origin.latitude.toFixed(5)}, ${origin.longitude.toFixed(5)}`);
    setSearchResults([]);
    setSearchError(undefined);

    if (selectedDestination) {
      void fetchRoadRoute(origin, selectedDestination);
    }
  };

  const openSaveFavoriteModal = (destination?: { latitude: number; longitude: number }) => {
    const source = destination ?? selectedDestination;
    if (!source) {
      Alert.alert("No destination selected", "Long-press the map to choose a point first.");
      return;
    }

    pendingFavoriteDestinationRef.current = source;
    setFavoriteLabelInput("");
    setIsFavoriteModalOpen(true);
  };

  const saveFavoritePlace = () => {
    const source = pendingFavoriteDestinationRef.current;
    if (!source) {
      Alert.alert("No destination selected", "Long-press the map to choose a point first.");
      return;
    }

    const label = favoriteLabelInput.trim();
    if (!label) {
      Alert.alert("Label required", "Enter a name like Home, Office, Work, Gym, or any custom place.");
      return;
    }

    const savedPlace = upsertSavedPlace({
      label,
      latitude: source.latitude,
      longitude: source.longitude
    });

    pendingFavoriteDestinationRef.current = undefined;
    setIsFavoriteModalOpen(false);
    setFavoriteLabelInput("");
    Alert.alert("Saved", `${savedPlace.label} was added to your profile and will show up in search.`);
  };

  const useFavoritePlace = (placeId: string) => {
    const place = savedPlacesLookup.get(placeId);
    if (!place) {
      return;
    }

    if (activeSearchField === "from") {
      applyOrigin({ latitude: place.latitude, longitude: place.longitude }, place.label);
      setOriginQuery(place.label);
    } else {
      setSearchQuery(place.label);
      addRecentSearch({
        label: place.label,
        latitude: place.latitude,
        longitude: place.longitude
      });
      applyDestination({ latitude: place.latitude, longitude: place.longitude });
    }

    setIsSearchModalOpen(false);
  };

  const addRecentSearch = (entry: { label: string; latitude: number; longitude: number }) => {
    const normalizedLabel = entry.label.trim();
    if (!normalizedLabel) {
      return;
    }

    const key = `${normalizedLabel.toLowerCase()}-${entry.latitude.toFixed(4)}-${entry.longitude.toFixed(4)}`;

    setRecentSearches((previous) => {
      const next = [
        {
          id: key,
          label: normalizedLabel,
          latitude: entry.latitude,
          longitude: entry.longitude
        },
        ...previous.filter((item) => item.id !== key)
      ];

      return next.slice(0, 6);
    });
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

    const syncCurrentLocation = (location: Location.LocationObject | Location.LocationObjectCoords) => {
      const coords = "coords" in location ? location.coords : location;

      setMapRegion((previous) => ({
        ...previous,
        latitude: coords.latitude,
        longitude: coords.longitude
      }));

      setCurrentPosition({
        latitude: coords.latitude,
        longitude: coords.longitude
      });
      setCurrentSpeedMps(coords.speed ?? 0);
      setGpsStatus("Current location synced.");
      maybeCenterToCurrent(coords.latitude, coords.longitude);
    };

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

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setGpsStatus("Location services are off. Turn on GPS to auto-fetch current location.");
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000,
        requiredAccuracy: 200
      });

      if (lastKnown) {
        syncCurrentLocation(lastKnown);
      } else {
        setGpsStatus("Fetching current location...");
      }

      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        syncCurrentLocation(current);
      } catch {
        if (!lastKnown) {
          setGpsStatus("Waiting for GPS fix...");
        }
      }

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 1500,
          distanceInterval: 2
        },
        (location) => {
          syncCurrentLocation(location);
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
      const query = activeSearchField === "from" ? originQuery : searchQuery;
      const biasOrigin = activeSearchField === "from" ? selectedOrigin ?? currentPosition : selectedOrigin ?? currentPosition;
      void searchDestination(query, biasOrigin);
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [activeSearchField, currentPosition, originQuery, searchQuery, selectedOrigin]);

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
        if (destination && effectiveRouteOrigin) {
          void fetchRoadRoute(effectiveRouteOrigin, destination);
          setGpsStatus("Ride mode active. Centered on your position and navigating.");
          return;
        }

        setGpsStatus("Ride mode active. Centered on your position.");
      },
      [currentPosition, effectiveRouteOrigin, isRideModeActive]
    )
  );

  useEffect(() => {
    if (!isRideModeActive || !currentPosition || !selectedDestination || !effectiveRouteOrigin) {
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
    void fetchRoadRoute(effectiveRouteOrigin, selectedDestination);
    setGpsStatus("Ride mode active. Tracking live position.");
  }, [currentPosition, effectiveRouteOrigin, isRideModeActive, selectedDestination]);

  useEffect(() => {
    if (!isRideModeActive || !currentPosition || !routePath.length || !selectedDestination || !effectiveRouteOrigin) {
      return;
    }

    const offRouteDistance = distanceToRouteMeters(currentPosition, routePath);
    if (offRouteDistance < 60) {
      return;
    }

    const now = Date.now();
    if (now - lastOffRouteRef.current < 7000) {
      return;
    }

    lastOffRouteRef.current = now;
    setGpsStatus(`Off route by ${Math.round(offRouteDistance)}m. Re-routing...`);
    void fetchRoadRoute(effectiveRouteOrigin, selectedDestination);
  }, [currentPosition, effectiveRouteOrigin, isRideModeActive, routePath, selectedDestination]);

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

    if (selectedDestination && effectiveRouteOrigin) {
      void fetchRoadRoute(effectiveRouteOrigin, selectedDestination);
      setGpsStatus("Start ride detected. Zoomed to your current position.");
      return;
    }

    setGpsStatus("Start ride detected. Current position locked.");
  }, [currentPosition, effectiveRouteOrigin, isRideModeActive, rideCommandToken, selectedDestination]);

  const handleScan = async () => {
    try {
      const granted = await bleService.requestPermissions();
      if (!granted) {
        const message = "Bluetooth permission denied.";
        useBleStore.getState().setError(message);
        Alert.alert("Permission required", "Please allow Bluetooth and Location permissions to scan nearby devices.");
        return;
      }

      await bleService.waitForPoweredOn();
      await bleService.startScan();
      setGpsStatus("Scanning for nearby Bluetooth devices...");
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

  const selectDestination = (event: LongPressEvent | MapPressEvent) => {
    const coordinate = event.nativeEvent.coordinate;
    const nextDestination = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude
    };

    applyDestination(nextDestination);
    Alert.alert(
      "Destination Selected",
      "Do you want to save this location to your profile?",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Save place",
          onPress: () => {
            openSaveFavoriteModal(nextDestination);
          }
        }
      ]
    );
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

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setGpsStatus("Location services are off. Turn on GPS to recenter.");
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
      setSendMessage("Tap map to choose a destination pin.");
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

  const executeSearchSubmit = () => {
    const first = searchResults[0];
    if (first) {
      if (activeSearchField === "from") {
        applyOrigin(
          { latitude: first.latitude, longitude: first.longitude },
          first.label
        );
        setOriginQuery(first.label);
      } else {
        setSearchQuery(first.label);
        setSearchResults([]);
        addRecentSearch({
          label: first.label,
          latitude: first.latitude,
          longitude: first.longitude
        });
        applyDestination({ latitude: first.latitude, longitude: first.longitude });
      }
      setIsSearchModalOpen(false);
      return;
    }

    const query = (activeSearchField === "from" ? originQuery : searchQuery).trim();
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

      if (activeSearchField === "from") {
        applyOrigin(
          { latitude: firstFallback.latitude, longitude: firstFallback.longitude },
          query
        );
      } else {
        addRecentSearch({
          label: query,
          latitude: firstFallback.latitude,
          longitude: firstFallback.longitude
        });
        applyDestination({
          latitude: firstFallback.latitude,
          longitude: firstFallback.longitude
        });
      }

      setIsSearchModalOpen(false);
    });
  };

  const openSearchModal = () => {
    setActiveSearchField("to");
    setIsSearchModalOpen(true);
    setTimeout(() => {
      modalToInputRef.current?.focus();
    }, 120);
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: undefined
    });
  }, [navigation]);

  return (
    <KeyboardAvoidingView
      className={`flex-1 ${isDark ? "bg-[#0b1220]" : "bg-[#f3f4f6]"}`}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 84 : 16}
    >
      <View className="h-[56%] overflow-hidden">
        <MapView
          ref={(instance) => {
            mapRef.current = instance;
          }}
          style={{ flex: 1 }}
          customMapStyle={isDark ? DARK_MAP_STYLE : []}
          initialRegion={mapRegion}
          onPress={selectDestination}
          onLongPress={selectDestination}
          showsUserLocation
          showsMyLocationButton
        >
          {routePath.length > 1 ? (
            <Polyline
              coordinates={routePath}
              strokeColor={isDark ? "#3b82f6" : "#0f172a"}
              strokeWidth={5}
            />
          ) : null}
          {selectedDestination ? <Marker coordinate={selectedDestination} title="Selected destination" /> : null}
        </MapView>

        <View className="absolute left-5 right-5 top-4">
          {showHubCard ? (
            <View pointerEvents="none" className="mt-2 rounded-2xl bg-[#fc4c02]/95 px-4 py-3">
              <Text className="text-[11px] font-extrabold uppercase tracking-[1.8px] text-[#ffedd5]">Navigation Hub</Text>
              <Text className="mt-1 text-xl font-black text-white">Send Route To Handlebar Device</Text>
              <Text className="mt-1 text-xs text-[#fff7ed]">Tap map to pin destination, then tap Send To Device.</Text>
            </View>
          ) : null}
        </View>

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

      <View className={`-mt-0 flex-1 rounded-t-[28px] border ${isDark ? "border-[#1f2937] bg-[#111827]" : "border-[#e5e7eb] bg-white"}`}>
        <ScrollView
          ref={(instance) => {
            bottomScrollRef.current = instance;
          }}
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text className={`text-[11px] font-bold uppercase tracking-[1.8px] ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Device</Text>
              <Text className={`mt-1 text-lg font-extrabold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>
                {isConnected ? connectedDeviceName ?? "NavDot Device" : "No Device Connected"}
              </Text>
              <Text className={`mt-1 text-xs ${isDark ? "text-[#d1d5db]" : "text-[#6b7280]"}`}>
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

          <View
            className={`mt-3 rounded-3xl border px-4 py-4 ${isDark ? "border-[#1f2937] bg-[#111827]" : "border-[#e5e7eb] bg-white"}`}
            style={{
              shadowColor: "#111827",
              shadowOpacity: 0.08,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 5 },
              elevation: 5
            }}
          >
            <View className="flex-row items-start justify-between">
              <View>
                <Text className={`text-[10px] uppercase tracking-[1.6px] ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Search</Text>
                <Text className={`mt-1 text-xs ${isDark ? "text-[#d1d5db]" : "text-[#4b5563]"}`}>Quick search, thumb friendly.</Text>
              </View>
              <View className={`rounded-full px-2.5 py-1 ${isDark ? "bg-[#1f2937]" : "bg-[#f8fafc]"}`}>
                <Text className={`text-[10px] font-bold ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Options</Text>
              </View>
            </View>

            <View className="mt-2 flex-row items-center gap-2">
              <Pressable
                className={`h-12 flex-1 flex-row items-center rounded-2xl border px-3 ${isDark ? "border-[#374151] bg-[#1f2937]" : "border-[#d1d5db] bg-[#f9fafb]"}`}
                onPress={openSearchModal}
              >
                <Text className={`mr-2 text-base ${isDark ? "text-[#6b7280]" : "text-[#9ca3af]"}`}>⌕</Text>
                <Text className={`flex-1 text-[15px] ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`} numberOfLines={1}>
                  {searchQuery.trim() ? searchQuery : "Where to?"}
                </Text>
              </Pressable>

              <Pressable
                className="h-12 w-14 items-center justify-center rounded-2xl bg-[#facc15]"
                onPress={() => {
                  openSearchModal();
                }}
              >
                <Text className="text-[12px] font-black text-[#111827]">Go</Text>
              </Pressable>
            </View>

            <View className="mt-3 flex-row items-end justify-between">
              <View>
                <Text className={`text-[10px] uppercase tracking-[1.6px] ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Route</Text>
                <Text className={`mt-1 text-xs ${isDark ? "text-[#d1d5db]" : "text-[#4b5563]"}`}>{gpsStatus}</Text>
                <Text className={`mt-1 text-[11px] ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>
                  From: {selectedOrigin?.label ?? "Current location"}
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <View className={`rounded-2xl px-2.5 py-1.5 ${isDark ? "bg-[#1f2937]" : "bg-[#f9fafb]"}`}>
                  <Text className={`text-[9px] uppercase ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>ETA</Text>
                  <Text className={`text-xs font-bold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>
                    {routeMetrics ? `${Math.max(1, Math.round(routeMetrics.etaSeconds / 60))} min` : "-"}
                  </Text>
                </View>
                <View className={`rounded-2xl px-2.5 py-1.5 ${isDark ? "bg-[#1f2937]" : "bg-[#f9fafb]"}`}>
                  <Text className={`text-[9px] uppercase ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Km</Text>
                  <Text className={`text-xs font-bold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>
                    {routeMetrics ? `${(routeMetrics.distanceMeters / 1000).toFixed(1)}` : "-"}
                  </Text>
                </View>
              </View>
            </View>

            <View className="mt-2 flex-row flex-wrap gap-2">
              <View className={`rounded-full px-2.5 py-1.5 ${isDark ? "bg-[#1f2937]" : "bg-[#f9fafb]"}`}>
                <Text className={`text-[10px] uppercase ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Heading</Text>
                <Text className={`text-xs font-bold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>{routeMetrics ? `${routeMetrics.headingDeg}°` : "-"}</Text>
              </View>
              <View className={`rounded-full px-2.5 py-1.5 ${isDark ? "bg-[#1f2937]" : "bg-[#f9fafb]"}`}>
                <Text className={`text-[10px] uppercase ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Status</Text>
                <Text className={`text-xs font-bold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>{routeLoading ? "Loading" : "Ready"}</Text>
              </View>
            </View>

            {routeOptions.length ? (
              <View className="mt-2">
                <Text className={`text-[10px] uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Route Preference</Text>
                <View className="mt-1 flex-row gap-2">
                  {(["recommended", "fastest", "shortest"] as RoutePreference[]).map((option) => {
                    const selected = routePreference === option;
                    return (
                      <Pressable
                        key={option}
                        className={`rounded-full border px-3 py-1.5 ${selected ? "border-[#fc4c02] bg-[#fc4c02]" : isDark ? "border-[#374151] bg-[#1f2937]" : "border-[#d1d5db] bg-white"}`}
                        onPress={() => setRoutePreference(option)}
                      >
                        <Text className={`text-[11px] font-bold capitalize ${selected ? "text-white" : isDark ? "text-[#d1d5db]" : "text-[#374151]"}`}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {routeOptions[activeRouteIndex] ? (
              <View className={`mt-3 rounded-xl border px-3 py-2.5 ${isDark ? "border-[#374151] bg-[#0f172a]" : "border-[#e5e7eb] bg-[#f8fafc]"}`}>
                <Text className={`text-[10px] uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Next Turn</Text>
                <Text className={`mt-1 text-sm font-black ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>
                  {routeOptions[activeRouteIndex].direction} in {Math.max(1, Math.round(routeOptions[activeRouteIndex].nextTurnDistanceMeters))} m
                </Text>
              </View>
            ) : null}

            {routeOptions.length > 1 ? (
              <View className="mt-2">
                <Text className={`text-[10px] uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Choose Route</Text>
                <View className="mt-1 flex-row flex-wrap gap-2">
                  {routeOptions.map((route, index) => {
                    const selected = index === activeRouteIndex;
                    const tags = routeTagsByIndex[index] ?? [];
                    return (
                      <Pressable
                        key={route.id}
                        className={`rounded-lg border px-2.5 py-1.5 ${selected ? "border-[#111827] bg-[#111827]" : isDark ? "border-[#374151] bg-[#1f2937]" : "border-[#d1d5db] bg-white"}`}
                        onPress={() => {
                          setActiveRouteIndex(index);
                          setGpsStatus(`Route ${index + 1} selected.`);
                          focusOnRoute(route.path);
                        }}
                      >
                        <Text className={`text-[11px] font-bold ${selected ? "text-white" : isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>
                          Route {index + 1}
                        </Text>
                        {tags.length ? (
                          <Text className={`text-[10px] ${selected ? "text-[#fde68a]" : "text-[#0369a1]"}`}>
                            {tags.join(" • ")}
                          </Text>
                        ) : null}
                        <Text className={`text-[10px] ${selected ? "text-[#e5e7eb]" : isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>
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

          <View className={`mt-3 rounded-xl border px-3 py-3 ${isDark ? "border-[#1f2937]" : "border-[#e5e7eb]"}`}>
            <Text className={`text-[11px] uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Instruction Delivery</Text>
            <Text className={`mt-1 text-sm font-extrabold ${deliveryStatus.tone}`}>{deliveryStatus.label}</Text>
            <Text className={`mt-1 text-xs ${isDark ? "text-[#d1d5db]" : "text-[#4b5563]"}`}>{deliveryStatus.detail}</Text>
          </View>

          <View className={`mt-3 rounded-xl border px-3 py-3 ${isDark ? "border-[#1f2937] bg-[#0f172a]" : "border-[#e5e7eb] bg-[#f9fafb]"}`}>
            <Text className={`text-[11px] uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>BLE Debug</Text>
            <Text className={`mt-1 text-xs ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`}>Connected: {isConnected ? "Yes" : "No"}</Text>
            <Text className={`text-xs ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`}>Scanning: {isScanning ? "Yes" : "No"}</Text>
            <Text className={`text-xs ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`}>Device: {bleDebug.deviceName ?? connectedDeviceName ?? "-"}</Text>
            <Text className={`text-xs ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`}>Device ID: {bleDebug.deviceId ?? connectedDeviceId ?? "-"}</Text>
            <Text className={`text-xs ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`}>Requested MTU: {bleDebug.requestedMtu ?? "-"}</Text>
            <Text className={`text-xs ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`}>Negotiated MTU: {bleDebug.negotiatedMtu ?? "-"}</Text>
            <Text className={`text-xs ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`}>Service UUID: {bleDebug.cachedServiceUuid ?? "-"}</Text>
            <Text className={`text-xs ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`}>Write Char UUID: {bleDebug.cachedCharacteristicUuid ?? "-"}</Text>
          </View>

          {error ? <Text className="mt-2 text-xs text-[#dc2626]">{error}</Text> : null}

          <View className="mt-3 gap-2">
            {devices.map((device) => (
              <View key={device.id} className={`rounded-xl border px-3 py-2.5 ${isDark ? "border-[#374151] bg-[#0f172a]" : "border-[#e5e7eb] bg-white"}`}>
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className={`text-sm font-bold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>{device.name}</Text>
                    <Text className={`text-[11px] ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Signal RSSI {device.rssi}</Text>
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
              <View className={`rounded-xl border border-dashed px-3 py-3 ${isDark ? "border-[#374151] bg-[#0f172a]" : "border-[#d1d5db] bg-white"}`}>
                <Text className={`text-xs ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>No nearby devices yet. Tap Scan Devices.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>

      <Modal visible={isSearchModalOpen} animationType="slide" transparent onRequestClose={() => setIsSearchModalOpen(false)}>
        <KeyboardAvoidingView
          className="flex-1 bg-black/40"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
        >
          <View className={`mt-24 flex-1 rounded-t-3xl px-5 pt-5 ${isDark ? "bg-[#111827]" : "bg-white"}`}>
            <View className="gap-2">
              <View className={`h-12 flex-row items-center rounded-2xl border px-3 ${isDark ? "border-[#374151] bg-[#1f2937]" : "border-[#d1d5db] bg-[#f9fafb]"}`}>
                <Text className={`mr-2 text-[11px] font-bold uppercase ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>From</Text>
                <Text className={`mr-2 text-base ${isDark ? "text-[#6b7280]" : "text-[#9ca3af]"}`}>⌕</Text>
                <TextInput
                  ref={(instance) => {
                    modalFromInputRef.current = instance;
                  }}
                  value={originQuery}
                  onChangeText={setOriginQuery}
                  onFocus={() => setActiveSearchField("from")}
                  placeholder="Current location"
                  placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={executeSearchSubmit}
                  className={`flex-1 text-[15px] ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}
                />
                {originQuery.trim().length ? (
                  <Pressable
                    className={`ml-2 h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-[#374151]" : "bg-[#e5e7eb]"}`}
                    onPress={() => {
                      setOriginQuery("");
                      setSearchResults([]);
                      setSearchError(undefined);
                      setSelectedOrigin(undefined);
                      if (selectedDestination && currentPosition) {
                        void fetchRoadRoute(currentPosition, selectedDestination);
                      }
                      modalFromInputRef.current?.focus();
                    }}
                  >
                    <Text className={`text-xs font-bold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>x</Text>
                  </Pressable>
                ) : null}
              </View>

              <View className="flex-row items-center justify-between">
                <Pressable
                  className={`rounded-full border px-3 py-1.5 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`}
                  onPress={() => {
                    setSelectedOrigin(undefined);
                    setOriginQuery("");
                    setActiveSearchField("to");
                    if (selectedDestination && currentPosition) {
                      void fetchRoadRoute(currentPosition, selectedDestination);
                    }
                  }}
                >
                  <Text className={`text-[10px] font-bold uppercase ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Use Current Location</Text>
                </Pressable>
                <Text className={`text-[11px] ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`} numberOfLines={1}>
                  {selectedOrigin?.label ?? "Current location"}
                </Text>
              </View>

              {matchingSavedPlaces.length ? (
                <View className="mt-1">
                  <Text className={`text-[10px] uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Saved Places</Text>
                  <View className="mt-1 flex-row flex-wrap gap-2">
                    {matchingSavedPlaces.slice(0, 8).map((place) => (
                      <Pressable
                        key={place.id}
                        className={`rounded-full border px-3 py-2 ${isDark ? "border-[#374151] bg-[#1f2937]" : "border-[#d1d5db] bg-[#f9fafb]"}`}
                        onPress={() => useFavoritePlace(place.id)}
                      >
                        <Text className={`text-xs font-semibold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>{place.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              <View className="flex-row items-center gap-2">
                <View className={`h-12 flex-1 flex-row items-center rounded-2xl border px-3 ${isDark ? "border-[#374151] bg-[#1f2937]" : "border-[#d1d5db] bg-[#f9fafb]"}`}>
                  <Text className={`mr-2 text-[11px] font-bold uppercase ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>To</Text>
                  <Text className={`mr-2 text-base ${isDark ? "text-[#6b7280]" : "text-[#9ca3af]"}`}>⌕</Text>
                  <TextInput
                    ref={(instance) => {
                      modalToInputRef.current = instance;
                      searchInputRef.current = instance;
                    }}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onFocus={() => setActiveSearchField("to")}
                    placeholder="Search destination"
                    placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={executeSearchSubmit}
                    className={`flex-1 text-[15px] ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}
                  />
                  {searchQuery.trim().length ? (
                    <Pressable
                      className={`ml-2 h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-[#374151]" : "bg-[#e5e7eb]"}`}
                      onPress={() => {
                        setSearchQuery("");
                        setSearchResults([]);
                        setSearchError(undefined);
                        modalToInputRef.current?.focus();
                      }}
                    >
                      <Text className={`text-xs font-bold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>x</Text>
                    </Pressable>
                  ) : null}
                </View>

                <Pressable
                  className={`h-12 items-center justify-center rounded-2xl border px-4 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`}
                  onPress={() => setIsSearchModalOpen(false)}
                >
                  <Text className={`text-xs font-bold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Close</Text>
                </Pressable>
              </View>
            </View>

            {searchLoading ? <Text className="mt-3 text-xs text-[#0369a1]">Searching...</Text> : null}
            {searchError ? <Text className="mt-3 text-xs text-[#b45309]">{searchError}</Text> : null}

            {activeSearchField === "to" && !searchQuery.trim().length && recentSearches.length ? (
              <View className="mt-3">
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className={`text-[11px] font-bold uppercase tracking-wide ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Recent Searches</Text>
                  <Pressable
                    onPress={() => setRecentSearches([])}
                    className={`rounded-full border px-2 py-1 ${isDark ? "border-[#374151]" : "border-[#d1d5db]"}`}
                  >
                    <Text className={`text-[10px] font-bold ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Clear all</Text>
                  </Pressable>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {recentSearches.map((item) => (
                    <Pressable
                      key={item.id}
                      className={`rounded-full border px-3 py-2 ${isDark ? "border-[#374151] bg-[#1f2937]" : "border-[#e5e7eb] bg-[#f9fafb]"}`}
                      onPress={() => {
                        setSearchQuery(item.label);
                        setSearchResults([]);
                        setSearchError(undefined);
                        addRecentSearch(item);
                        applyDestination({ latitude: item.latitude, longitude: item.longitude });
                        setIsSearchModalOpen(false);
                      }}
                    >
                      <Text className={`text-xs ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`} numberOfLines={1}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <ScrollView className="mt-3" contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
              {searchResults.map((result) => (
                <Pressable
                  key={result.id}
                  className={`mb-2 rounded-xl border px-3 py-3 ${isDark ? "border-[#374151] bg-[#1f2937]" : "border-[#e5e7eb] bg-white"}`}
                  onPress={() => {
                    if (activeSearchField === "from") {
                      setOriginQuery(result.label);
                      setSearchResults([]);
                      applyOrigin(
                        { latitude: result.latitude, longitude: result.longitude },
                        result.label
                      );
                    } else {
                      setSearchQuery(result.label);
                      setSearchResults([]);
                      addRecentSearch({
                        label: result.label,
                        latitude: result.latitude,
                        longitude: result.longitude
                      });
                      applyDestination({ latitude: result.latitude, longitude: result.longitude });
                    }
                    setIsSearchModalOpen(false);
                  }}
                >
                  <Text className={`text-sm ${isDark ? "text-[#e5e7eb]" : "text-[#111827]"}`} numberOfLines={2}>{result.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={isFavoriteModalOpen} transparent animationType="fade" onRequestClose={() => setIsFavoriteModalOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/45 px-5">
          <View className={`w-full rounded-2xl border px-4 py-4 ${isDark ? "border-[#374151] bg-[#111827]" : "border-[#e5e7eb] bg-white"}`}>
            <Text className={`text-sm font-black ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Save Destination</Text>
            <Text className={`mt-1 text-xs ${isDark ? "text-[#9ca3af]" : "text-[#6b7280]"}`}>Name this place (Home, Work, Office, Gym, etc.)</Text>

            <TextInput
              className={`mt-3 rounded-xl border px-3 py-3 ${isDark ? "border-[#374151] bg-[#1f2937] text-[#f3f4f6]" : "border-[#d1d5db] bg-[#f9fafb] text-[#111827]"}`}
              value={favoriteLabelInput}
              onChangeText={setFavoriteLabelInput}
              placeholder="Enter place name"
              placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
              autoCapitalize="words"
            />

            <View className="mt-3 flex-row gap-2">
              <Pressable
                className={`flex-1 rounded-xl border py-2.5 ${isDark ? "border-[#374151] bg-[#1f2937]" : "border-[#d1d5db] bg-[#f9fafb]"}`}
                onPress={() => {
                  setIsFavoriteModalOpen(false);
                  setFavoriteLabelInput("");
                }}
              >
                <Text className={`text-center text-xs font-bold ${isDark ? "text-[#f3f4f6]" : "text-[#111827]"}`}>Cancel</Text>
              </Pressable>
              <Pressable className="flex-1 rounded-xl bg-[#fc4c02] py-2.5" onPress={saveFavoritePlace}>
                <Text className="text-center text-xs font-bold text-white">Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
