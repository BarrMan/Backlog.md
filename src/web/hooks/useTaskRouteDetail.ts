import { useEffect, useRef } from "react";
import { useTaskRouteLocation } from "./task-route-location";
import {
	useRouteModalSynchronization,
	useTaskDetailLoading,
	useTaskModalClose,
	useTaskModalState,
	useTaskRouteFailure,
} from "./task-route-modal";

export type TaskRouteNavigationState = { taskModalFrom?: string; taskRouteError?: string };

export function useTaskRouteDetail(isInitialized: boolean | null, dataVersion: number) {
	const { location, navigate, routeState, taskId: routeTaskId, basePath: routeBasePath } = useTaskRouteLocation();
	const { modal, setModal, modalRef, openDetailModal, openCreateModal, clearTaskModal, detailSession, detailId } =
		useTaskModalState();

	useRouteModalSynchronization({
		isInitialized,
		routeTaskId,
		routeBasePath,
		locationSearch: location.search,
		modalRef,
		clearTaskModal,
		openDetailModal,
		navigate,
	});

	const reportFailure = useTaskRouteFailure(routeBasePath, location.search, navigate, clearTaskModal);
	const reportFailureRef = useRef(reportFailure);
	useEffect(() => {
		reportFailureRef.current = reportFailure;
	}, [reportFailure]);
	useTaskDetailLoading({
		detailSession,
		detailId,
		dataVersion,
		modalRef,
		setModal,
		reportFailure: reportFailureRef.current,
	});

	const closeModal = useTaskModalClose(
		routeBasePath,
		routeTaskId,
		routeState,
		location.search,
		navigate,
		clearTaskModal,
	);

	return {
		modal,
		setModal,
		openDetailModal,
		openCreateModal,
		clearTaskModal,
		closeModal,
		location,
		navigate,
		routeBasePath,
		routeTaskId,
		routeState,
	};
}
