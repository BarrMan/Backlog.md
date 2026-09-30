import { useEffect, useState } from "react";
import type { TaskStatistics } from "../../core/statistics";
import { apiClient } from "../lib/api";

interface StatisticsData extends Omit<TaskStatistics, "statusCounts" | "priorityCounts"> {
	statusCounts: Record<string, number>;
	priorityCounts: Record<string, number>;
}

const LOADING_MESSAGES = [
	"Building statistics...",
	"Loading local tasks...",
	"Loading completed tasks...",
	"Merging tasks...",
	"Checking task states across branches...",
	"Loading drafts...",
	"Calculating statistics...",
];

export function useStatisticsData() {
	const [statistics, setStatistics] = useState<StatisticsData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0] ?? "");

	useEffect(() => {
		let active = true;
		let messageIndex = 0;
		const advanceLoadingMessage = () => {
			if (!active || messageIndex >= LOADING_MESSAGES.length - 1) return;
			messageIndex += 1;
			setLoadingMessage(LOADING_MESSAGES[messageIndex] ?? "");
		};
		const interval = setInterval(advanceLoadingMessage, 800);
		const load = async () => {
			try {
				const data = await apiClient.fetchStatistics();
				if (active) setStatistics(data);
			} catch (error) {
				if (active) {
					console.error("Failed to fetch statistics:", error);
					setError("Failed to load statistics");
				}
			} finally {
				if (active) setLoading(false);
				clearInterval(interval);
			}
		};
		void load();
		return () => {
			active = false;
			clearInterval(interval);
		};
	}, []);

	return { statistics, loading, error, loadingMessage };
}
