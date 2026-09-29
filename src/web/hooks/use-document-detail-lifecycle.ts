import { useEffect, useRef, useState } from "react";
import { isAmbiguousIdConflict } from "../lib/api";

type DetailEntity = { id: string; title?: string; rawContent?: string };

interface DetailAdapter<T extends DetailEntity> {
	prefix(id: string): string;
	fetch(id: string): Promise<T>;
	onLoad(entity: T): void;
	onFallback(entity: T): void;
	onNew(): void;
	notFoundError?(id: string): Error;
	logError(error: unknown): void;
}

export function useDocumentDetailLifecycle<T extends DetailEntity>({
	id,
	items,
	adapter,
	editRequested,
	consumeEditRequest,
}: {
	id?: string;
	items: T[];
	adapter: DetailAdapter<T>;
	editRequested: boolean;
	consumeEditRequest: () => void;
}) {
	const [entity, setEntity] = useState<T | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isEditing, setIsEditing] = useState(false);
	const [isNew, setIsNew] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const requestGeneration = useRef(0);

	useEffect(() => {
		const generation = requestGeneration.current + 1;
		requestGeneration.current = generation;
		if (id === "new") {
			setIsNew(true);
			setIsEditing(true);
			setIsLoading(false);
			setError(null);
			setEntity(null);
			adapter.onNew();
			return;
		}
		if (!id) return;

		setIsNew(false);
		setIsEditing(false);
		setIsLoading(true);
		setError(null);
		const prefixedId = adapter.prefix(id);
		const fallback = items.find((item) => item.id === prefixedId);
		void adapter
			.fetch(prefixedId)
			.then(
				(entity) => {
					if (requestGeneration.current !== generation) return;
					setEntity(entity);
					adapter.onLoad(entity);
				},
				(fetchError) => {
					if (requestGeneration.current !== generation) return;
					adapter.logError(fetchError);
					if (isAmbiguousIdConflict(fetchError)) {
						setEntity(null);
						setError(fetchError);
					} else if (fallback) {
						setEntity(fallback);
						adapter.onFallback(fallback);
					} else if (adapter.notFoundError) {
						setError(adapter.notFoundError(prefixedId));
					}
				},
			)
			.finally(() => {
				if (requestGeneration.current === generation) setIsLoading(false);
			});
	}, [adapter, id, items]);

	useEffect(() => {
		if (!editRequested) return;
		setIsEditing(true);
		consumeEditRequest();
	}, [consumeEditRequest, editRequested]);

	return { entity, setEntity, isLoading, isEditing, setIsEditing, isNew, setIsNew, error, setError };
}
