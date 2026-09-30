import { useCallback, useEffect, useRef, useState } from "react";
import type { Decision, Document } from "../../types";
import { getWebVersion } from "../utils/version";

function storedValue<T>(key: string, fallback: T): T {
	return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) as T;
}

export function useSideNavigationState(docs: Document[], decisions: Decision[]) {
	const [isCollapsed, setIsCollapsed] = useState(() => storedValue("sideNavCollapsed", false));
	const [isDocsCollapsed, setIsDocsCollapsed] = useState(() => storedValue("docsCollapsed", docs.length > 6));
	const [folderExpanded, setFolderExpanded] = useState(() =>
		storedValue<Record<string, boolean>>("docsFolderExpanded", {}),
	);
	const [isDecisionsCollapsed, setIsDecisionsCollapsed] = useState(() =>
		storedValue("decisionsCollapsed", decisions.length > 6),
	);
	const [version, setVersion] = useState("");
	const focusSearchOnExpandRef = useRef(false);

	useEffect(() => {
		localStorage.setItem("sideNavCollapsed", JSON.stringify(isCollapsed));
	}, [isCollapsed]);
	useEffect(() => {
		localStorage.setItem("docsCollapsed", JSON.stringify(isDocsCollapsed));
	}, [isDocsCollapsed]);
	useEffect(() => {
		localStorage.setItem("decisionsCollapsed", JSON.stringify(isDecisionsCollapsed));
	}, [isDecisionsCollapsed]);
	useEffect(() => {
		localStorage.setItem("docsFolderExpanded", JSON.stringify(folderExpanded));
	}, [folderExpanded]);
	useEffect(() => {
		void getWebVersion()
			.then(setVersion)
			.catch(() => setVersion(""));
	}, []);
	useEffect(() => {
		if (localStorage.getItem("docsCollapsed") === null && docs.length > 6) setIsDocsCollapsed(true);
	}, [docs.length]);
	useEffect(() => {
		if (localStorage.getItem("decisionsCollapsed") === null && decisions.length > 6) setIsDecisionsCollapsed(true);
	}, [decisions.length]);

	const expandAndFocusSearch = useCallback(() => {
		focusSearchOnExpandRef.current = true;
		setIsCollapsed(false);
	}, []);
	const toggleFolder = useCallback(
		(path: string) => setFolderExpanded((current) => ({ ...current, [path]: !(current[path] ?? true) })),
		[],
	);
	return {
		isCollapsed,
		setIsCollapsed,
		isDocsCollapsed,
		setIsDocsCollapsed,
		isDecisionsCollapsed,
		setIsDecisionsCollapsed,
		folderExpanded,
		version,
		focusSearchOnExpandRef,
		expandAndFocusSearch,
		toggleFolder,
	};
}
