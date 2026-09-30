import { useState } from "react";
import { useSettingsForm } from "../hooks/use-settings-form";
import { apiClient } from "../lib/api";
import { taskDetailCacheCapacity } from "../lib/task-detail-cache";
import { SuccessToast } from "./SuccessToast";
import {
	AdvancedSettings,
	DefinitionOfDoneSettings,
	ProjectSettings,
	WebUiSettings,
	WorkflowSettings,
} from "./settings-sections";

const Settings = () => {
	const [taskDetailCacheSize, setTaskDetailCacheSize] = useState(() => taskDetailCacheCapacity());
	const {
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
		hasUnsavedChanges,
	} = useSettingsForm();

	if (loading) {
		return (
			<div className="page-shell">
				<div className="flex items-center justify-center py-12">
					<div className="text-lg text-gray-600 dark:text-gray-300">Loading settings...</div>
				</div>
			</div>
		);
	}

	if (!config) {
		return (
			<div className="page-shell">
				<div className="flex items-center justify-center py-12">
					<div className="text-red-600 dark:text-red-400">Failed to load configuration</div>
				</div>
			</div>
		);
	}

	return (
		<div className="page-shell transition-colors duration-200">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Settings</h1>

				{error && (
					<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
						<p className="text-sm text-red-700 dark:text-red-400">{error}</p>
					</div>
				)}

				<div className="space-y-8">
					<ProjectSettings config={config} errors={errors} change={change} />
					<WorkflowSettings config={config} statuses={statuses} change={change} />
					<DefinitionOfDoneSettings config={config} change={change} />
					<WebUiSettings
						config={config}
						errors={errors}
						change={change}
						taskDetailCacheSize={taskDetailCacheSize}
						onTaskDetailCacheSizeChange={(size) => {
							apiClient.setTaskDetailCacheCapacity(size);
							setTaskDetailCacheSize(size);
						}}
					/>
					<AdvancedSettings config={config} change={change} />

					{/* Save/Cancel Buttons */}
					<div className="flex items-center justify-end space-x-4">
						<button
							type="button"
							onClick={cancel}
							disabled={!hasUnsavedChanges || saving}
							className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 disabled:opacity-50 transition-colors duration-200"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={save}
							disabled={!hasUnsavedChanges || saving}
							className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200"
						>
							{saving ? "Saving..." : "Save Changes"}
						</button>
					</div>
				</div>
			</div>

			{/* Success Toast */}
			{showSuccess && <SuccessToast message="Settings saved successfully!" onDismiss={() => setShowSuccess(false)} />}
		</div>
	);
};

export default Settings;
