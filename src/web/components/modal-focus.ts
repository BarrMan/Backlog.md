import { type RefObject, useEffect } from "react";
import { matchesBrowserShortcut } from "../lib/keyboard-shortcuts";

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function keepFocusInDialog(event: KeyboardEvent, dialog: HTMLDivElement, ownerDocument: Document) {
	if (event.key !== "Tab") return;
	const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
	const first = focusable[0];
	const last = focusable.at(-1);
	if (!first || !last) {
		event.preventDefault();
		dialog.focus();
		return;
	}
	if (!dialog.contains(ownerDocument.activeElement)) {
		event.preventDefault();
		event.stopPropagation();
		(event.shiftKey ? last : first).focus();
	} else if (event.shiftKey && (ownerDocument.activeElement === first || ownerDocument.activeElement === dialog)) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && ownerDocument.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}

export function useModalFocus(
	isOpen: boolean,
	dialogRef: RefObject<HTMLDivElement | null>,
	onCloseRef: RefObject<() => void>,
	disableEscapeCloseRef: RefObject<boolean | undefined>,
	initialFocusRef: RefObject<RefObject<HTMLElement | null> | undefined>,
) {
	useEffect(() => {
		if (!isOpen || !dialogRef.current) return;
		const dialog = dialogRef.current;
		const ownerDocument = dialog.ownerDocument;
		const activeElement = ownerDocument.activeElement;
		const previouslyFocused = activeElement && "focus" in activeElement ? (activeElement as HTMLElement) : null;
		const previousOverflow = ownerDocument.body.style.overflow;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (matchesBrowserShortcut(event, "closeModal")) {
				event.preventDefault();
				event.stopPropagation();
				if (!disableEscapeCloseRef.current) onCloseRef.current();
				return;
			}
			if (matchesBrowserShortcut(event, "focusSearch")) {
				event.preventDefault();
				event.stopPropagation();
				if (!dialog.contains(ownerDocument.activeElement)) dialog.focus();
				return;
			}
			keepFocusInDialog(event, dialog, ownerDocument);
		};
		ownerDocument.addEventListener("keydown", handleKeyDown, true);
		ownerDocument.body.style.overflow = "hidden";
		(initialFocusRef.current?.current ?? dialog).focus();
		return () => {
			ownerDocument.removeEventListener("keydown", handleKeyDown, true);
			ownerDocument.body.style.overflow = previousOverflow;
			if (previouslyFocused?.isConnected) previouslyFocused.focus();
		};
	}, [isOpen, dialogRef, onCloseRef, disableEscapeCloseRef, initialFocusRef]);
}
