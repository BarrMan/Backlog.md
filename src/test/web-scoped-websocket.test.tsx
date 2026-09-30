import { afterEach, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HealthCheckProvider } from "../web/contexts/HealthCheckContext.tsx";
import { useAppDataWebSocketEvents } from "../web/hooks/use-app-data-websocket-events.ts";
import { useAppLifecycle } from "../web/hooks/use-app-lifecycle.ts";
import { useAppData } from "../web/hooks/useAppData.ts";
import { apiClient } from "../web/lib/api.ts";

let root: Root | null = null;
let retry: (() => void) | null = null;
const originalWebSocket = globalThis.WebSocket;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalEvent = globalThis.Event;
const originalGetProjectScope = apiClient.getProjectScope.bind(apiClient);
const originalCheckStatus = apiClient.checkStatus.bind(apiClient);
const originalFetchStatuses = apiClient.fetchStatuses.bind(apiClient);
const originalFetchConfig = apiClient.fetchConfig.bind(apiClient);
const originalFetchMilestones = apiClient.fetchMilestones.bind(apiClient);
const originalFetchArchivedMilestones = apiClient.fetchArchivedMilestones.bind(apiClient);
const originalFetchTasks = apiClient.fetchTasks.bind(apiClient);
const originalSearch = apiClient.search.bind(apiClient);

afterEach(() => {
	act(() => root?.unmount());
	root = null;
	retry = null;
	globalThis.WebSocket = originalWebSocket;
	globalThis.window = originalWindow;
	globalThis.document = originalDocument;
	globalThis.Event = originalEvent;
	apiClient.getProjectScope = originalGetProjectScope;
	apiClient.checkStatus = originalCheckStatus;
	apiClient.fetchStatuses = originalFetchStatuses;
	apiClient.fetchConfig = originalFetchConfig;
	apiClient.fetchMilestones = originalFetchMilestones;
	apiClient.fetchArchivedMilestones = originalFetchArchivedMilestones;
	apiClient.fetchTasks = originalFetchTasks;
	apiClient.search = originalSearch;
});

test("a pending app-data refresh cannot publish into a replacement window after unmount", async () => {
	const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document;
	globalThis.Event = dom.window.Event;
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	let resolveStatuses!: (statuses: string[]) => void;
	const statuses = new Promise<string[]>((resolve) => {
		resolveStatuses = resolve;
	});
	class SocketStub {
		static readonly CONNECTING = 0;
		static readonly OPEN = 1;
		readyState = SocketStub.CONNECTING;
		onopen: (() => void) | null = null;
		onclose: (() => void) | null = null;
		close() {
			this.readyState = 3;
			this.onclose?.();
		}
	}
	globalThis.WebSocket = SocketStub as unknown as typeof WebSocket;
	apiClient.getProjectScope = async () => "scope-a";
	apiClient.fetchStatuses = async () => await statuses;
	apiClient.fetchConfig = async () => ({ projectName: "Demo", labels: [] }) as never;
	apiClient.fetchMilestones = async () => [];
	apiClient.fetchArchivedMilestones = async () => [];
	apiClient.fetchTasks = async () => [];
	apiClient.search = async () => [];
	let refreshData!: () => Promise<void>;
	function Probe() {
		refreshData = useAppData().refreshData;
		return null;
	}

	root = createRoot(document.getElementById("root") as HTMLElement);
	await act(async () => {
		root?.render(
			<HealthCheckProvider>
				<Probe />
			</HealthCheckProvider>,
		);
		await Promise.resolve();
	});
	const refresh = refreshData();
	act(() => root?.unmount());
	const replacement = new JSDOM("<!doctype html>", { url: "http://localhost" });
	globalThis.window = replacement.window as unknown as Window & typeof globalThis;
	globalThis.document = replacement.window.document;
	// This recreates the test cleanup boundary that used to reject the late event dispatch.
	globalThis.Event = dom.window.Event;
	resolveStatuses([]);
	await expect(refresh).resolves.toBeUndefined();
});

test("rapid retry clicks share one pending scoped socket connection", async () => {
	const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document;
	globalThis.Event = dom.window.Event;
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	let resolveScope!: (scope: string) => void;
	let synchronizations = 0;
	const scope = new Promise<string>((resolve) => {
		resolveScope = resolve;
	});
	class SocketStub {
		static readonly CONNECTING = 0;
		static readonly OPEN = 1;
		static instances: SocketStub[] = [];
		readyState = SocketStub.CONNECTING;
		onopen: (() => void) | null = null;
		onclose: (() => void) | null = null;
		onmessage: ((event: MessageEvent) => void) | null = null;
		constructor(readonly url: string) {
			SocketStub.instances.push(this);
		}
		close() {
			this.readyState = 3;
			this.onclose?.();
		}
	}
	globalThis.WebSocket = SocketStub as unknown as typeof WebSocket;
	apiClient.getProjectScope = async () => await scope;
	apiClient.checkStatus = async () => ({ initialized: true, projectScope: await scope, projectPath: "/tmp/project" });

	function Probe() {
		const loaded = useRef(false);
		const pending = useRef<number | null>(null);
		const protocolLoading = useRef(false);
		useAppDataWebSocketEvents({
			applyLoadError: () => {},
			fullRefreshData: async () => {
				synchronizations += 1;
			},
			hasLoadedDataRef: loaded,
			loadAllData: async () => {},
			pendingDataRequestRef: pending,
			protocolOnlyLoadingRef: protocolLoading,
			refreshData: async () => {},
			refreshMilestoneData: async () => {},
			reportConnection: () => {},
			setIsLoading: () => {},
			setLoadingMessage: () => {},
			setRetry: (next) => {
				retry = next;
			},
		});
		return null;
	}

	root = createRoot(document.getElementById("root") as HTMLElement);
	await act(async () => {
		root?.render(<Probe />);
		await Promise.resolve();
	});
	expect(retry).not.toBeNull();
	await act(async () => {
		retry?.();
		retry?.();
		resolveScope("scope-a");
		await Promise.resolve();
		await Promise.resolve();
	});
	expect(SocketStub.instances).toHaveLength(1);
	expect(SocketStub.instances[0]?.url).toBe("ws://localhost/?projectScope=scope-a");
	await act(async () => {
		SocketStub.instances[0]?.onopen?.();
		await Promise.resolve();
	});
	expect(synchronizations).toBe(1);
});

test("a socket reopen observes external initialization without polling", async () => {
	const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document;
	globalThis.Event = dom.window.Event;
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	let initialized = false;
	apiClient.checkStatus = async () => ({ initialized, projectPath: "/tmp/project", projectScope: "scope-a" });

	function Probe() {
		const lifecycle = useAppLifecycle({ isOnline: true, loadAllData: async () => {}, projectName: "" });
		return <output>{String(lifecycle.isInitialized)}</output>;
	}

	root = createRoot(document.getElementById("root") as HTMLElement);
	await act(async () => {
		root?.render(<Probe />);
		await Promise.resolve();
	});
	expect(document.querySelector("output")?.textContent).toBe("false");
	initialized = true;
	await act(async () => {
		window.dispatchEvent(new window.Event("project-socket-open"));
		await Promise.resolve();
	});
	expect(document.querySelector("output")?.textContent).toBe("true");
});
