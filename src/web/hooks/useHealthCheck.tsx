import { useCallback, useRef, useState } from "react";

/** Connection state is reported by the scoped app-data socket; this hook never opens its own transport. */
export function useHealthCheck() {
	const [isOnline, setIsOnline] = useState(true);
	const [wasDisconnected, setWasDisconnected] = useState(false);
	const retryRef = useRef<() => void>(() => {});

	const reportConnection = useCallback((online: boolean) => {
		setIsOnline(online);
		if (!online) setWasDisconnected(true);
		else setWasDisconnected(false);
	}, []);

	const setRetry = useCallback((retry: () => void) => {
		retryRef.current = retry;
	}, []);

	const retry = useCallback(() => retryRef.current(), []);

	return { isOnline, wasDisconnected, retry, reportConnection, setRetry };
}
