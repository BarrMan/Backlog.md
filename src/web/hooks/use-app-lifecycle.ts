import { useEffect, useRef, useState } from "react";
import { apiClient } from "../lib/api";
import { getWebVersion } from "../utils/version";

type Options = {
	isOnline: boolean;
	projectName: string;
	loadAllData: () => Promise<void>;
};

export function useAppLifecycle({ isOnline, projectName, loadAllData }: Options) {
	const [isInitialized, setInitializationState] = useState<boolean | null>(null);
	const [showSuccessToast, setShowSuccessToast] = useState(false);
	const previousOnlineRef = useRef<boolean | null>(null);
	const hasBeenRunningRef = useRef(false);

	useEffect(() => {
		let disposed = false;
		void getWebVersion().then((version) => {
			if (!disposed && version) document.body.setAttribute("data-version", `Backlog.md - v${version}`);
		});
		return () => {
			disposed = true;
		};
	}, []);

	useEffect(() => {
		let disposed = false;
		void apiClient
			.checkStatus()
			.then((status) => {
				if (!disposed) setInitializationState(status.initialized);
			})
			.catch((error) => {
				if (disposed) return;
				console.error("Failed to check initialization status:", error);
				setInitializationState(false);
			});
		return () => {
			disposed = true;
		};
	}, []);

	useEffect(() => {
		let disposed = false;
		const refreshInitialization = () => {
			void apiClient
				.checkStatus()
				.then((status) => {
					if (!disposed) setInitializationState(status.initialized);
				})
				.catch((error) => {
					if (!disposed) console.error("Failed to refresh initialization status:", error);
				});
		};
		window.addEventListener("project-config-updated", refreshInitialization);
		window.addEventListener("project-socket-open", refreshInitialization);
		return () => {
			disposed = true;
			window.removeEventListener("project-config-updated", refreshInitialization);
			window.removeEventListener("project-socket-open", refreshInitialization);
		};
	}, []);

	useEffect(() => {
		if (isInitialized === true) void loadAllData();
	}, [isInitialized, loadAllData]);

	useEffect(() => {
		if (isOnline && previousOnlineRef.current === false) void loadAllData();
	}, [isOnline, loadAllData]);

	useEffect(() => {
		if (projectName) document.title = `${projectName} - Task Management`;
	}, [projectName]);

	useEffect(() => {
		const timer = setTimeout(() => {
			hasBeenRunningRef.current = true;
		}, 2000);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (isOnline && previousOnlineRef.current === false && hasBeenRunningRef.current) {
			setShowSuccessToast(true);
			const timer = setTimeout(() => setShowSuccessToast(false), 4000);
			previousOnlineRef.current = isOnline;
			return () => clearTimeout(timer);
		}
		previousOnlineRef.current = isOnline;
	}, [isOnline]);

	return { isInitialized, setIsInitialized: setInitializationState, showSuccessToast, setShowSuccessToast };
}
