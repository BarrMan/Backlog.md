import { useEffect } from "react";
import { parseBrowserLoadingState } from "../../utils/browser-loading-state";

type Options = {
	refreshData: () => Promise<void>;
	refreshMilestoneData: () => Promise<void>;
	fullRefreshData: () => Promise<void>;
	loadAllData: () => Promise<void>;
	applyLoadError: (error: Error | null) => void;
	setIsLoading: (value: boolean) => void;
	setLoadingMessage: (value: string | null) => void;
	hasLoadedDataRef: React.RefObject<boolean>;
	pendingDataRequestRef: React.RefObject<number | null>;
	protocolOnlyLoadingRef: React.RefObject<boolean>;
};

export function useAppDataWebSocket({
	refreshData,
	refreshMilestoneData,
	fullRefreshData,
	loadAllData,
	applyLoadError,
	setIsLoading,
	setLoadingMessage,
	hasLoadedDataRef,
	pendingDataRequestRef,
	protocolOnlyLoadingRef,
}: Options) {
	useEffect(() => {
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const ws = new WebSocket(`${protocol}//${window.location.host}`);
		let disposed = false;
		ws.onmessage = (event) => {
			const loadingState = parseBrowserLoadingState(event.data);
			if (loadingState?.type === "loading") {
				if (pendingDataRequestRef.current === null) protocolOnlyLoadingRef.current = true;
				if (!hasLoadedDataRef.current) setIsLoading(true);
				applyLoadError(null);
				setLoadingMessage(loadingState.message);
			} else if (loadingState?.type === "loaded") {
				const shouldRefresh = protocolOnlyLoadingRef.current && pendingDataRequestRef.current === null;
				protocolOnlyLoadingRef.current = false;
				setLoadingMessage(null);
				if (shouldRefresh) void fullRefreshData();
			} else if (loadingState?.type === "error") {
				protocolOnlyLoadingRef.current = false;
				setIsLoading(false);
				setLoadingMessage(null);
				applyLoadError(new Error(loadingState.message));
			} else if (event.data === "tasks-updated") void refreshData();
			else if (event.data === "milestones-updated") void refreshMilestoneData();
			else if (event.data === "config-updated") void loadAllData();
		};
		ws.onclose = () => {
			if (disposed || !protocolOnlyLoadingRef.current || pendingDataRequestRef.current !== null) return;
			protocolOnlyLoadingRef.current = false;
			void fullRefreshData();
		};
		return () => {
			disposed = true;
			ws.close();
		};
	}, [
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
	]);
}
