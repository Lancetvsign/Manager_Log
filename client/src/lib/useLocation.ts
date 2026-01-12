import { useEffect, useState, useRef } from "react";

type LocationState = {
  lat: number | null;
  lon: number | null;
  loading: boolean;
  error: string | null;
};

export function useLocationPermission(): LocationState {
  const [state, setState] = useState<LocationState>({
    lat: null,
    lon: null,
    loading: true,
    error: null,
  });
  const hasResolved = useRef(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({
        lat: null,
        lon: null,
        loading: false,
        error: "Geolocation not supported",
      });
      return;
    }

    // Fallback timeout - if geolocation doesn't respond in 5 seconds, continue without location
    const fallbackTimeout = setTimeout(() => {
      if (!hasResolved.current) {
        hasResolved.current = true;
        setState({
          lat: null,
          lon: null,
          loading: false,
          error: null, // Not an error, just use default location
        });
      }
    }, 5000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!hasResolved.current) {
          hasResolved.current = true;
          clearTimeout(fallbackTimeout);
          setState({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            loading: false,
            error: null,
          });
        }
      },
      (err) => {
        if (!hasResolved.current) {
          hasResolved.current = true;
          clearTimeout(fallbackTimeout);
          setState({
            lat: null,
            lon: null,
            loading: false,
            error:
              err.code === err.PERMISSION_DENIED
                ? "Location permission denied"
                : "Unable to get location",
          });
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 1000 * 60 * 60, // 1 hour cache
      }
    );

    return () => {
      clearTimeout(fallbackTimeout);
    };
  }, []);

  return state;
}
