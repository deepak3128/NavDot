import * as Location from "expo-location";
import { Magnetometer } from "expo-sensors";
import { useNavStore } from "../store/useNavStore";

let locationSubscription: Location.LocationSubscription | undefined;
let headingSubscription: { remove: () => void } | undefined;

function normalizeHeading(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export async function requestLocationPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return false;
  }

  // Background permission is optional for live in-app preview and ride controls.
  try {
    await Location.requestBackgroundPermissionsAsync();
  } catch {
    // Ignore background permission failures and continue with foreground-only mode.
  }

  return true;
}

export async function startLocationAndHeadingStreams(): Promise<void> {
  if (!locationSubscription) {
    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1
      },
      (location) => {
        useNavStore.getState().setLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speedMps: location.coords.speed ?? 0,
          hasGpsFix: true
        });
      }
    );
  }

  if (!headingSubscription) {
    Magnetometer.setUpdateInterval(100);
    headingSubscription = Magnetometer.addListener((sample) => {
      const angle = Math.atan2(sample.y, sample.x) * (180 / Math.PI);
      const heading = normalizeHeading(90 - angle);
      useNavStore.getState().setHeading(heading);
    });
  }
}

export function stopLocationAndHeadingStreams(): void {
  locationSubscription?.remove();
  locationSubscription = undefined;

  headingSubscription?.remove();
  headingSubscription = undefined;
}
