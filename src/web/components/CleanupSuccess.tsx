import { useState } from "react";
import CleanupModal from "./CleanupModal";
import { SuccessToast } from "./SuccessToast";

export function useCleanupSuccess(onRefreshData?: () => Promise<void>) {
	const [isCleanupOpen, setIsCleanupOpen] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const handleCleanupSuccess = async (movedCount: number) => {
		setIsCleanupOpen(false);
		setMessage(`Successfully moved ${movedCount} task${movedCount !== 1 ? "s" : ""} to completed folder`);
		await onRefreshData?.();
		setTimeout(() => setMessage(null), 4000);
	};

	return {
		isCleanupOpen,
		openCleanup: () => setIsCleanupOpen(true),
		closeCleanup: () => setIsCleanupOpen(false),
		message,
		dismissMessage: () => setMessage(null),
		handleCleanupSuccess,
	};
}

interface CleanupSuccessProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: (movedCount: number) => Promise<void>;
	message: string | null;
	onDismiss: () => void;
	dateFormat?: string;
}

export function CleanupSuccess({ isOpen, onClose, onSuccess, message, onDismiss, dateFormat }: CleanupSuccessProps) {
	return (
		<>
			<CleanupModal isOpen={isOpen} onClose={onClose} onSuccess={onSuccess} dateFormat={dateFormat} />
			{message && (
				<SuccessToast
					message={message}
					onDismiss={onDismiss}
					icon={
						<svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					}
				/>
			)}
		</>
	);
}
