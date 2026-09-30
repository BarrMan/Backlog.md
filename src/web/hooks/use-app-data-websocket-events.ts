import { useEffect } from "react";
import { parseBrowserLoadingState } from "../../utils/browser-loading-state";
import { apiClient } from "../lib/api";

type LoadingStatePort = {
	hasLoadedDataRef: React.RefObject<boolean>;
	pendingDataRequestRef: React.RefObject<number | null>;
	protocolOnlyLoadingRef: React.RefObject<boolean>;
	applyLoadError: (error: Error | null) => void;
	setIsLoading: (value: boolean) => void;
	setLoadingMessage: (value: string | null) => void;
	fullRefreshData: () => Promise<void>;
};

type Options = LoadingStatePort & {
	refreshData: () => Promise<void>;
	refreshMilestoneData: () => Promise<void>;
	loadAllData: () => Promise<void>;
	reportConnection: (online: boolean) => void;
	setRetry: (retry: () => void) => void;
};

function handleLoadingState(data: unknown, port: LoadingStatePort) {
	const loadingState = parseBrowserLoadingState(data);
	if (!loadingState) return false;
	if (loadingState.type === "loading") {
		if (port.pendingDataRequestRef.current === null) port.protocolOnlyLoadingRef.current = true;
		if (!port.hasLoadedDataRef.current) port.setIsLoading(true);
		port.applyLoadError(null);
		port.setLoadingMessage(loadingState.message);
		return true;
	}
	if (loadingState.type === "loaded") {
		const shouldRefresh = port.protocolOnlyLoadingRef.current && port.pendingDataRequestRef.current === null;
		port.protocolOnlyLoadingRef.current = false;
		port.setLoadingMessage(null);
		if (shouldRefresh) void port.fullRefreshData();
		return true;
	}
	port.protocolOnlyLoadingRef.current = false;
	port.setIsLoading(false);
	port.setLoadingMessage(null);
	port.applyLoadError(new Error(loadingState.message));
	return true;
}

function handleWebSocketMessage(data: unknown, options: Options) {
	if (handleLoadingState(data, options)) return;
	if (data === "tasks-updated") {
		apiClient.detailCache.invalidate();
		void options.refreshData();
	} else if (data === "milestones-updated") {
		apiClient.detailCache.invalidate();
		void options.refreshMilestoneData();
	} else if (data === "config-updated") {
		apiClient.detailCache.invalidate();
		window.dispatchEvent(new window.Event("project-config-updated"));
		void options.loadAllData();
	}
}

function subscribeToAppDataWebSocket(options: Options) {
	const loadingStatePort: LoadingStatePort = {
		applyLoadError: options.applyLoadError,
		fullRefreshData: options.fullRefreshData,
		hasLoadedDataRef: options.hasLoadedDataRef,
		pendingDataRequestRef: options.pendingDataRequestRef,
		protocolOnlyLoadingRef: options.protocolOnlyLoadingRef,
		setIsLoading: options.setIsLoading,
		setLoadingMessage: options.setLoadingMessage,
	};
	let disposed = false;
	let reconnectAttempts = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	let socket: WebSocket | undefined;
	let connecting = false;
	let connectionGeneration = 0;
	const scheduleReconnect = () => {
		const delay = Math.min(250 * 2 ** reconnectAttempts, 4000);
		reconnectAttempts = Math.min(reconnectAttempts + 1, 4);
		reconnectTimer = setTimeout(() => void connect(), delay);
	};
	const connect = async () => {
		if (disposed || connecting || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING)
			return;
		connecting = true;
		const generation = connectionGeneration;
		try {
			// A close can be the server rejecting an old scope after it was restarted for another project.
			// Revalidate only while reconnecting; regular freshness still comes exclusively from socket events.
			const status = reconnectAttempts > 0 ? await apiClient.checkStatus() : undefined;
			const scope = status?.projectScope ?? (await apiClient.getProjectScope());
			if (disposed || generation !== connectionGeneration) return;
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const ws = new WebSocket(`${protocol}//${window.location.host}/?projectScope=${encodeURIComponent(scope)}`);
			socket = ws;
			ws.onopen = () => {
				if (disposed || generation !== connectionGeneration) return;
				reconnectAttempts = 0;
				options.reportConnection(true);
				apiClient.detailCache.invalidate();
				window.dispatchEvent(new window.Event("project-socket-open"));
				// The socket is now subscribed, so this read closes the gap after any prior HTTP load.
				void options.fullRefreshData();
			};
			ws.onmessage = (event) => {
				if (!disposed && generation === connectionGeneration)
					handleWebSocketMessage(event.data, { ...loadingStatePort, ...options });
			};
			ws.onclose = () => {
				if (disposed || generation !== connectionGeneration) return;
				if (socket === ws) socket = undefined;
				options.reportConnection(false);
				if (options.protocolOnlyLoadingRef.current && options.pendingDataRequestRef.current === null) {
					options.protocolOnlyLoadingRef.current = false;
					void options.fullRefreshData();
				}
				scheduleReconnect();
			};
		} catch (error) {
			if (disposed || generation !== connectionGeneration) return;
			options.reportConnection(false);
			options.applyLoadError(error instanceof Error ? error : new Error("Failed to connect to project updates"));
			// A project mismatch is an identity failure, not a transient network outage.
			// Retrying it would keep a stale browser bound to the wrong server.
			if (error instanceof Error && "code" in error && error.code === "PROJECT_SCOPE_MISMATCH") return;
			scheduleReconnect();
		} finally {
			connecting = false;
			if (!disposed && generation !== connectionGeneration) void connect();
		}
	};
	const restart = () => {
		connectionGeneration += 1;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		const previous = socket;
		socket = undefined;
		previous?.close();
		void connect();
	};
	options.setRetry(() => {
		restart();
	});
	const reconnectForScopeChange = () => restart();
	window.addEventListener("project-scope-changed", reconnectForScopeChange);
	void connect();
	return () => {
		disposed = true;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		socket?.close();
		options.setRetry(() => {});
		window.removeEventListener("project-scope-changed", reconnectForScopeChange);
	};
}

export function useAppDataWebSocketEvents(options: Options) {
	const {
		applyLoadError,
		fullRefreshData,
		hasLoadedDataRef,
		loadAllData,
		pendingDataRequestRef,
		protocolOnlyLoadingRef,
		reportConnection,
		setRetry,
		refreshData,
		refreshMilestoneData,
		setIsLoading,
		setLoadingMessage,
	} = options;
	useEffect(
		() =>
			subscribeToAppDataWebSocket({
				applyLoadError,
				fullRefreshData,
				hasLoadedDataRef,
				loadAllData,
				pendingDataRequestRef,
				protocolOnlyLoadingRef,
				reportConnection,
				setRetry,
				refreshData,
				refreshMilestoneData,
				setIsLoading,
				setLoadingMessage,
			}),
		[
			applyLoadError,
			fullRefreshData,
			hasLoadedDataRef,
			loadAllData,
			pendingDataRequestRef,
			protocolOnlyLoadingRef,
			reportConnection,
			setRetry,
			refreshData,
			refreshMilestoneData,
			setIsLoading,
			setLoadingMessage,
		],
	);
}
