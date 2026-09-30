import type React from "react";
import { useRef } from "react";
import { useModalFocus } from "./modal-focus";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	maxWidthClass?: string; // e.g., "max-w-4xl"
	disableEscapeClose?: boolean; // when true, Escape and backdrop click won't close (child can handle it)
	actions?: React.ReactNode; // optional actions rendered in header before close
	initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const Modal: React.FC<ModalProps> = ({
	isOpen,
	onClose,
	title,
	children,
	maxWidthClass = "max-w-2xl",
	disableEscapeClose,
	actions,
	initialFocusRef,
}) => {
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const onCloseRef = useRef(onClose);
	const disableEscapeCloseRef = useRef(disableEscapeClose);
	const initialFocusRefRef = useRef(initialFocusRef);
	onCloseRef.current = onClose;
	disableEscapeCloseRef.current = disableEscapeClose;
	initialFocusRefRef.current = initialFocusRef;

	useModalFocus(isOpen, dialogRef, onCloseRef, disableEscapeCloseRef, initialFocusRefRef);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{!disableEscapeClose && (
				<button
					type="button"
					className="absolute inset-0 bg-black/40 dark:bg-black/60"
					onClick={onClose}
					aria-label="Dismiss modal"
				/>
			)}
			<div
				ref={dialogRef}
				className={`relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 shadow-2xl ${maxWidthClass} w-full max-h-[94vh] overflow-y-auto transition-colors duration-200`}
				role="dialog"
				tabIndex={-1}
				aria-modal="true"
				aria-labelledby="modal-title"
			>
				<div className="sticky top-0 z-10 flex flex-wrap items-start gap-3 px-6 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 supports-[backdrop-filter]:dark:bg-gray-800/75">
					<h2
						id="modal-title"
						className="min-w-0 flex-1 basis-full break-words text-base font-semibold text-gray-900 dark:text-gray-100 sm:basis-auto"
					>
						{title}
					</h2>
					<div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
						{actions}
						<button
							type="button"
							onClick={onClose}
							disabled={disableEscapeClose}
							className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1 transition-colors duration-200 text-2xl leading-none w-8 h-8 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
							aria-label="Close modal"
						>
							×
						</button>
					</div>
				</div>
				<div className="px-6 pt-4 pb-6">{children}</div>
			</div>
		</div>
	);
};

export default Modal;
