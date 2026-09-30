import { useEffect } from "react";
import { parseBrowserLoadingState } from "../../utils/browser-loading-state";

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
	if (data === "tasks-updated") void options.refreshData();
	else if (data === "milestones-updated") void options.refreshMilestoneData();
	else if (data === "config-updated") void options.loadAllData();
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
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const ws = new WebSocket(`${protocol}//${window.location.host}`);
	let disposed = false;
	ws.onmessage = (event) => handleWebSocketMessage(event.data, { ...loadingStatePort, ...options });
	ws.onclose = () => {
		if (disposed || !options.protocolOnlyLoadingRef.current || options.pendingDataRequestRef.current !== null) return;
		options.protocolOnlyLoadingRef.current = false;
		void options.fullRefreshData();
	};
	return () => {
		disposed = true;
		ws.close();
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
			refreshData,
			refreshMilestoneData,
			setIsLoading,
			setLoadingMessage,
		],
	);
}
