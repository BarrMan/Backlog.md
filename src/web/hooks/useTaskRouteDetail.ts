import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import type { TaskDetail } from "../../core/task-detail";
import type { Task } from "../../types";
import { isValidTaskId } from "../../utils/task-id";
import { ApiError, apiClient } from "../lib/api";

export type TaskRouteNavigationState = { taskModalFrom?: string; taskRouteError?: string };

type TaskModalState =
	| { kind: "closed" }
	| { kind: "create"; isDraft: boolean }
	| {
			kind: "detail";
			session: number;
			id: string;
			isDraft: boolean;
			fromRoute: boolean;
			value: Task | TaskDetail | null;
	  };

export function useTaskRouteDetail(isInitialized: boolean | null, dataVersion: number) {
	const location = useLocation();
	const navigate = useNavigate();
	const tasksRouteWithTitle = useMatch("/tasks/:id/:title");
	const tasksRoute = useMatch("/tasks/:id");
	const boardRouteWithTitle = useMatch("/board/:id/:title");
	const boardRoute = useMatch("/board/:id");
	const routeTaskId =
		tasksRouteWithTitle?.params.id ?? tasksRoute?.params.id ?? boardRouteWithTitle?.params.id ?? boardRoute?.params.id;
	const routeBasePath =
		tasksRouteWithTitle || tasksRoute ? "/tasks" : boardRouteWithTitle || boardRoute ? "/board" : null;
	const routeState =
		location.state && typeof location.state === "object" ? (location.state as TaskRouteNavigationState) : {};
	const [modal, setModal] = useState<TaskModalState>({ kind: "closed" });
	const modalRef = useRef(modal);
	const sessionRef = useRef(0);
	modalRef.current = modal;

	const openDetailModal = useCallback(
		(id: string, options: { isDraft?: boolean; fromRoute?: boolean; record?: Task | TaskDetail } = {}) => {
			sessionRef.current += 1;
			setModal({
				kind: "detail",
				session: sessionRef.current,
				id,
				isDraft: options.isDraft ?? false,
				fromRoute: options.fromRoute ?? false,
				value: options.record ?? null,
			});
		},
		[],
	);
	const clearTaskModal = useCallback(() => setModal({ kind: "closed" }), []);

	useEffect(() => {
		const current = modalRef.current;
		if (!routeTaskId || !routeBasePath || isInitialized !== true) {
			if (!routeTaskId && current.kind === "detail" && current.fromRoute) clearTaskModal();
			return;
		}
		if (!isValidTaskId(routeTaskId)) {
			clearTaskModal();
			navigate(`${routeBasePath}${location.search}`, {
				replace: true,
				state: { taskRouteError: `"${routeTaskId}" is not a valid task ID.` } satisfies TaskRouteNavigationState,
			});
			return;
		}
		if (current.kind !== "detail" || !current.fromRoute || current.id !== routeTaskId)
			openDetailModal(routeTaskId, { fromRoute: true });
	}, [clearTaskModal, isInitialized, location.search, navigate, openDetailModal, routeBasePath, routeTaskId]);

	const reportFailure = useCallback(
		(taskId: string, error: unknown, fromRoute: boolean) => {
			clearTaskModal();
			if (!fromRoute || !routeBasePath) return;
			const message =
				error instanceof ApiError && error.status === 409
					? `Task "${taskId}" is ambiguous. Repair duplicate task IDs before opening this link.`
					: error instanceof ApiError && error.status === 400
						? `"${taskId}" is not a valid task ID.`
						: error instanceof ApiError && error.status === 404
							? `Task "${taskId}" was not found.`
							: `Task "${taskId}" could not be opened. Try again.`;
			navigate(`${routeBasePath}${location.search}`, {
				replace: true,
				state: { taskRouteError: message } satisfies TaskRouteNavigationState,
			});
		},
		[clearTaskModal, location.search, navigate, routeBasePath],
	);
	const reportFailureRef = useRef(reportFailure);
	useEffect(() => {
		reportFailureRef.current = reportFailure;
	}, [reportFailure]);
	const detailSession = modal.kind === "detail" ? modal.session : null;
	const detailId = modal.kind === "detail" ? modal.id : null;
	useEffect(() => {
		// The corpus generation is deliberately part of the read key: list refreshes do not carry detail fields.
		void dataVersion;
		if (detailSession === null || detailId === null) return;
		let active = true;
		void apiClient
			.fetchTask(detailId)
			.then((detail) => {
				if (!active) return;
				setModal((current) =>
					current.kind === "detail" && current.session === detailSession && current.id === detailId
						? { ...current, value: detail }
						: current,
				);
			})
			.catch((error) => {
				if (!active) return;
				const current = modalRef.current;
				if (
					current.kind === "detail" &&
					current.session === detailSession &&
					current.id === detailId &&
					current.value === null
				)
					reportFailureRef.current(detailId, error, current.fromRoute);
			});
		return () => {
			active = false;
		};
	}, [detailId, detailSession, dataVersion]);

	const closeModal = useCallback(() => {
		clearTaskModal();
		if (!routeBasePath || !routeTaskId) return;
		if (routeState.taskModalFrom) navigate(-1);
		else navigate(`${routeBasePath}${location.search}`, { replace: true });
	}, [clearTaskModal, location.search, navigate, routeBasePath, routeState.taskModalFrom, routeTaskId]);

	return {
		modal,
		setModal,
		openDetailModal,
		clearTaskModal,
		closeModal,
		location,
		navigate,
		routeBasePath,
		routeTaskId,
		routeState,
	};
}
