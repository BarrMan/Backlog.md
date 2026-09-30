import {
	type Dispatch,
	type MutableRefObject,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { NavigateFunction } from "react-router-dom";
import type { TaskDetail } from "../../core/task-detail";
import type { Task } from "../../types";
import { isValidTaskId } from "../../utils/task-id";
import { ApiError, apiClient } from "../lib/api";
import type { TaskRouteBasePath } from "./task-route-location";
import type { TaskRouteNavigationState } from "./useTaskRouteDetail";

export type TaskModalState =
	| { kind: "closed" }
	| { kind: "create"; session: number; isDraft: boolean }
	| {
			kind: "detail";
			session: number;
			id: string;
			isDraft: boolean;
			fromRoute: boolean;
			value: Task | TaskDetail | null;
	  };

type DetailOptions = { isDraft?: boolean; fromRoute?: boolean; record?: Task | TaskDetail };
type DetailLoader = { detailSession: number | null; detailId: string | null };

function hasReadyTaskRoute(
	isInitialized: boolean | null,
	routeTaskId: string | undefined,
	routeBasePath: TaskRouteBasePath,
) {
	return Boolean(routeTaskId && routeBasePath && isInitialized === true);
}

function shouldClearRoutedModal(routeTaskId: string | undefined, modal: TaskModalState) {
	return !routeTaskId && modal.kind === "detail" && modal.fromRoute;
}

function needsRoutedDetail(routeTaskId: string, modal: TaskModalState) {
	return modal.kind !== "detail" || !modal.fromRoute || modal.id !== routeTaskId;
}

function taskRouteFailureMessage(taskId: string, error: unknown): string {
	if (!(error instanceof ApiError)) return `Task "${taskId}" could not be opened. Try again.`;
	if (error.status === 409) return `Task "${taskId}" is ambiguous. Repair duplicate task IDs before opening this link.`;
	if (error.status === 400) return `"${taskId}" is not a valid task ID.`;
	if (error.status === 404) return `Task "${taskId}" was not found.`;
	return `Task "${taskId}" could not be opened. Try again.`;
}

export function useTaskModalState() {
	const [modal, setModal] = useState<TaskModalState>({ kind: "closed" });
	const modalRef = useRef(modal);
	const sessionRef = useRef(0);
	modalRef.current = modal;
	const openDetailModal = useCallback((id: string, options: DetailOptions = {}) => {
		sessionRef.current += 1;
		setModal({
			kind: "detail",
			session: sessionRef.current,
			id,
			isDraft: options.isDraft ?? false,
			fromRoute: options.fromRoute ?? false,
			value: options.record ?? null,
		});
	}, []);
	const openCreateModal = useCallback((isDraft: boolean) => {
		sessionRef.current += 1;
		setModal({ kind: "create", session: sessionRef.current, isDraft });
	}, []);
	const clearTaskModal = useCallback(() => setModal({ kind: "closed" }), []);
	const detailLoader: DetailLoader =
		modal.kind === "detail"
			? { detailSession: modal.session, detailId: modal.id }
			: { detailSession: null, detailId: null };
	return { modal, setModal, modalRef, openDetailModal, openCreateModal, clearTaskModal, ...detailLoader };
}

export function useRouteModalSynchronization({
	isInitialized,
	routeTaskId,
	routeBasePath,
	locationSearch,
	modalRef,
	clearTaskModal,
	openDetailModal,
	navigate,
}: {
	isInitialized: boolean | null;
	routeTaskId: string | undefined;
	routeBasePath: TaskRouteBasePath;
	locationSearch: string;
	modalRef: MutableRefObject<TaskModalState>;
	clearTaskModal: () => void;
	openDetailModal: (id: string, options?: DetailOptions) => void;
	navigate: NavigateFunction;
}) {
	useEffect(() => {
		const current = modalRef.current;
		if (!hasReadyTaskRoute(isInitialized, routeTaskId, routeBasePath)) {
			if (shouldClearRoutedModal(routeTaskId, current)) clearTaskModal();
			return;
		}
		if (!routeTaskId || !routeBasePath) return;
		if (!isValidTaskId(routeTaskId)) {
			clearTaskModal();
			navigate(`${routeBasePath}${locationSearch}`, {
				replace: true,
				state: { taskRouteError: `"${routeTaskId}" is not a valid task ID.` } satisfies TaskRouteNavigationState,
			});
			return;
		}
		if (needsRoutedDetail(routeTaskId, current)) openDetailModal(routeTaskId, { fromRoute: true });
	}, [clearTaskModal, isInitialized, locationSearch, modalRef, navigate, openDetailModal, routeBasePath, routeTaskId]);
}

export function useTaskDetailLoading({
	detailSession,
	detailId,
	dataVersion,
	modalRef,
	setModal,
	reportFailure,
}: DetailLoader & {
	dataVersion: number;
	modalRef: MutableRefObject<TaskModalState>;
	setModal: Dispatch<SetStateAction<TaskModalState>>;
	reportFailure: (taskId: string, error: unknown, fromRoute: boolean) => void;
}) {
	useEffect(() => {
		void dataVersion;
		if (detailSession === null || detailId === null) return;
		let active = true;
		void apiClient
			.loadTaskDetail(detailId)
			.then((detail) => {
				if (active)
					setModal((current) =>
						current.kind === "detail" && current.session === detailSession && current.id === detailId
							? { ...current, value: detail }
							: current,
					);
			})
			.catch((error) => {
				const current = modalRef.current;
				if (
					active &&
					current.kind === "detail" &&
					current.session === detailSession &&
					current.id === detailId &&
					current.value === null
				)
					reportFailure(detailId, error, current.fromRoute);
			});
		return () => {
			active = false;
		};
	}, [dataVersion, detailId, detailSession, modalRef, reportFailure, setModal]);
}

export function useTaskRouteFailure(
	routeBasePath: TaskRouteBasePath,
	locationSearch: string,
	navigate: NavigateFunction,
	clearTaskModal: () => void,
) {
	return useCallback(
		(taskId: string, error: unknown, fromRoute: boolean) => {
			clearTaskModal();
			if (fromRoute && routeBasePath)
				navigate(`${routeBasePath}${locationSearch}`, {
					replace: true,
					state: { taskRouteError: taskRouteFailureMessage(taskId, error) } satisfies TaskRouteNavigationState,
				});
		},
		[clearTaskModal, locationSearch, navigate, routeBasePath],
	);
}

export function useTaskModalClose(
	routeBasePath: TaskRouteBasePath,
	routeTaskId: string | undefined,
	routeState: TaskRouteNavigationState,
	locationSearch: string,
	navigate: NavigateFunction,
	clearTaskModal: () => void,
) {
	return useCallback(() => {
		clearTaskModal();
		if (!routeBasePath || !routeTaskId) return;
		if (routeState.taskModalFrom) navigate(-1);
		else navigate(`${routeBasePath}${locationSearch}`, { replace: true });
	}, [clearTaskModal, locationSearch, navigate, routeBasePath, routeState.taskModalFrom, routeTaskId]);
}
