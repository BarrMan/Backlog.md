import { useEffect, useRef, useState } from "react";
import type { BacklogConfig } from "../../types";
import { apiClient } from "../lib/api";

function normalizeDefinitionOfDone(items: string[] | undefined): string[] | undefined {
	const normalized = (items ?? []).map((item) => item.trim()).filter(Boolean);
	return normalized.length > 0 ? normalized : undefined;
}

function validationErrors(config: BacklogConfig): Record<string, string> {
	const errors: Record<string, string> = {};
	if (!config.projectName.trim()) errors.projectName = "Project name is required";
	if (config.defaultPort && (config.defaultPort < 1 || config.defaultPort > 65535))
		errors.defaultPort = "Port must be between 1 and 65535";
	return errors;
}

function hasChanges(config: BacklogConfig | null, originalConfig: BacklogConfig | null) {
	return JSON.stringify(config) !== JSON.stringify(originalConfig);
}

export function useSettingsForm() {
	const [config, setConfig] = useState<BacklogConfig | null>(null);
	const [originalConfig, setOriginalConfig] = useState<BacklogConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showSuccess, setShowSuccess] = useState(false);
	const [statuses, setStatuses] = useState<string[]>([]);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const requestRef = useRef(0);
	const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const request = requestRef.current + 1;
		requestRef.current = request;
		const load = async () => {
			try {
				const [nextConfig, nextStatuses] = await Promise.all([apiClient.fetchConfig(), apiClient.fetchStatuses()]);
				if (requestRef.current !== request) return;
				setConfig(nextConfig);
				setOriginalConfig(nextConfig);
				setStatuses(nextStatuses);
				setError(null);
			} catch (error) {
				if (requestRef.current !== request) return;
				setError(error instanceof Error ? error.message : "Failed to load configuration");
			} finally {
				if (requestRef.current === request) setLoading(false);
			}
		};
		void load();
		return () => {
			if (requestRef.current === request) requestRef.current += 1;
		};
	}, []);

	useEffect(
		() => () => {
			if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
		},
		[],
	);

	const clearFieldError = (field: keyof BacklogConfig) => {
		setErrors((current) => (current[field] ? { ...current, [field]: "" } : current));
	};

	const change = (field: keyof BacklogConfig, value: BacklogConfig[keyof BacklogConfig]) => {
		setConfig((current) => (current ? { ...current, [field]: value } : current));
		clearFieldError(field);
	};

	const cancel = () => {
		setConfig(originalConfig);
		setErrors({});
	};

	const save = async () => {
		if (!config) return;
		const nextErrors = validationErrors(config);
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return;
		const normalizedConfig = { ...config, definitionOfDone: normalizeDefinitionOfDone(config.definitionOfDone) };
		const request = requestRef.current + 1;
		requestRef.current = request;
		try {
			setSaving(true);
			await apiClient.updateConfig(normalizedConfig);
			if (requestRef.current !== request) return;
			setConfig(normalizedConfig);
			setOriginalConfig(normalizedConfig);
			setShowSuccess(true);
			if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
			successTimeoutRef.current = setTimeout(() => {
				if (requestRef.current === request) setShowSuccess(false);
				successTimeoutRef.current = null;
			}, 3000);
			setError(null);
		} catch (error) {
			if (requestRef.current !== request) return;
			setError(error instanceof Error ? error.message : "Failed to save configuration");
		} finally {
			if (requestRef.current === request) setSaving(false);
		}
	};

	return {
		config,
		loading,
		saving,
		error,
		showSuccess,
		setShowSuccess,
		statuses,
		errors,
		change,
		cancel,
		save,
		hasUnsavedChanges: hasChanges(config, originalConfig),
	};
}
