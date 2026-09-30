import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { Task, TaskSummary } from "../../../types";

type AppRouteView = {
	showSuccessToast: boolean;
	onDismissSuccessToast: () => void;
	onEditTask: (task: TaskSummary | Task) => void;
	onNewTask: () => void;
	onEditDraft: (task: Task) => void;
	onNewDraft: () => void;
};

const AppRouteViewContext = createContext<AppRouteView | null>(null);

export function AppRouteViewProvider({ children, value }: { children: ReactNode; value: AppRouteView }) {
	return <AppRouteViewContext.Provider value={value}>{children}</AppRouteViewContext.Provider>;
}

export function useAppRouteView(): AppRouteView {
	const view = useContext(AppRouteViewContext);
	if (!view) throw new Error("useAppRouteView must be used within AppRouteViewProvider");
	return view;
}
