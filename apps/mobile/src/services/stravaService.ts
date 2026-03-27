const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export type StravaAthlete = {
  id: number;
  firstname: string;
  lastname: string;
  profile?: string;
};

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_speed?: number;
  start_date_local: string;
  start_latlng?: [number, number];
  end_latlng?: [number, number];
};

export type StravaRoute = {
  id: number;
  name: string;
  distance: number;
  elevation_gain: number;
  estimated_moving_time?: number;
  type?: number;
};

type StravaImportPayload = {
  athlete: StravaAthlete;
  activities: StravaActivity[];
  routes: StravaRoute[];
};

type StravaErrorPayload = {
  message?: string;
  errors?: Array<{
    code?: string;
    resource?: string;
    field?: string;
  }>;
};

async function fetchStrava<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${STRAVA_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    let details = "Provider request failed.";
    try {
      const payload = (await response.json()) as StravaErrorPayload;
      if (payload.message) {
        details = payload.message;
      }
    } catch {
      details = `Provider request failed (${response.status}).`;
    }

    if (response.status === 401) {
      throw new Error("Access token is invalid or expired. Paste a fresh token in Settings.");
    }

    throw new Error(details);
  }

  return (await response.json()) as T;
}

export async function importStravaActivitiesAndRoutes(accessToken: string): Promise<StravaImportPayload> {
  if (!accessToken.trim()) {
    throw new Error("Missing access token. Add one in Settings.");
  }

  const athlete = await fetchStrava<StravaAthlete>("/athlete", accessToken);
  const [activities, routes] = await Promise.all([
    fetchStrava<StravaActivity[]>("/athlete/activities?per_page=20&page=1", accessToken),
    fetchStrava<StravaRoute[]>(`/athletes/${athlete.id}/routes?per_page=20&page=1`, accessToken)
  ]);

  return {
    athlete,
    activities,
    routes
  };
}
