interface EmptyDetailProps {
	kind: string;
	message: string;
	icon: string;
}

export function EmptyDocumentDetail({ kind, message, icon }: EmptyDetailProps) {
	return (
		<div className="flex-1 flex items-center justify-center p-8">
			<div className="text-center">
				<svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} /></svg>
				<h3 className="mt-2 text-sm font-medium text-gray-900">No {kind} selected</h3>
				<p className="mt-1 text-sm text-gray-500">{message}</p>
			</div>
		</div>
	);
}

function DocumentDetailLoading() {
	return <div className="flex-1 flex items-center justify-center"><div className="text-gray-500">Loading...</div></div>;
}

export function DocumentDetailGate({ id, isLoading, error, empty, children }: { id?: string; isLoading: boolean; error: Error | null; empty: ReactNode; children: ReactNode }) {
	if (!id) return empty;
	if (isLoading) return <DocumentDetailLoading />;
	if (isAmbiguousIdConflict(error)) return <AmbiguousIdNotice message={error.message} />;
	return children;
}
import type { ReactNode } from "react";
import { isAmbiguousIdConflict } from "../lib/api";
import AmbiguousIdNotice from "./AmbiguousIdNotice";
