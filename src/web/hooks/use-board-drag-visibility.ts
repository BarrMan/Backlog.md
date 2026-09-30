import { useCallback, useEffect, useRef, useState } from "react";

export function useBoardDragVisibility(hideEmptyColumns: boolean) {
	const [dragSourceStatus, setDragSourceStatus] = useState<string | null>(null);
	const [dragSourceLane, setDragSourceLane] = useState<string | null>(null);
	const [hiddenColumnsRevealed, setHiddenColumnsRevealed] = useState(false);
	const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const cancelReveal = useCallback(() => {
		if (revealTimer.current !== null) clearTimeout(revealTimer.current);
		revealTimer.current = null;
	}, []);

	const handleDragStart = useCallback(
		({ status, laneId }: { status: string; laneId?: string | null }) => {
			setDragSourceStatus(status);
			setDragSourceLane(laneId ?? null);
			if (!hideEmptyColumns) return;
			cancelReveal();
			revealTimer.current = setTimeout(() => {
				revealTimer.current = null;
				setHiddenColumnsRevealed(true);
			}, 0);
		},
		[cancelReveal, hideEmptyColumns],
	);

	const handleDragEnd = useCallback(() => {
		cancelReveal();
		setDragSourceStatus(null);
		setDragSourceLane(null);
		setHiddenColumnsRevealed(false);
	}, [cancelReveal]);

	useEffect(() => cancelReveal, [cancelReveal]);
	return { dragSourceStatus, dragSourceLane, hiddenColumnsRevealed, handleDragStart, handleDragEnd };
}
