import { useEffect, useState, useRef } from "react";

type LocationState = {
  lat: number | null;
  lon: number | null;
  loading: boolean;
  error: string | null;
};

export function useLocationPermission(enabled: boolean = true): LocationState {
  const [state, setState] = useState<LocationState>({
    lat: null,
    lon: null,
    loading: enabled,
    error: null,
  });
  const hasResolved = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setState({
        lat: null,
        lon: null,
        loading: false,
        error: null,
      });
      return;
    }

    if (!navigator.geolocation) {
      setState({
        lat: null,
        lon: null,
        loading: false,
        error: "Geolocation not supported",
      });
      return;
    }

    const fallbackTimeout = setTimeout(() => {
      if (!hasResolved.current) {
        hasResolved.current = true;
        setState({
          lat: null,
          lon: null,
          loading: false,
          error: null,
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
        maximumAge: 1000 * 60 * 60,
      }
    );

    return () => {
      clearTimeout(fallbackTimeout);
    };
  }, [enabled]);

  return state;
}
