// Type definitions for Mermaid API
import { renderMermaidBlocks } from "./mermaid-rendering";

interface MermaidAPI {
	initialize: (config: MermaidConfig) => void;
	run?: (options?: MermaidRunOptions) => Promise<void>;
	render: (id: string, text: string) => Promise<MermaidRenderResult>;
}

interface MermaidConfig {
	startOnLoad?: boolean;
	securityLevel?: "strict" | "loose" | "antiscript" | "sandbox";
	theme?: "base" | "default" | "dark" | "forest" | "neutral" | "null";
	logLevel?: number;
	[key: string]: unknown;
}

interface MermaidRunOptions {
	nodes?: HTMLElement[];
	querySelector?: string;
	suppressErrors?: boolean;
}

interface MermaidRenderResult {
	svg: string;
	bindFunctions?: (element: HTMLElement) => void;
}

interface MermaidModule {
	default: MermaidAPI;
}

type MermaidGlobal = typeof globalThis & {
	__MERMAID_MOCK__?: MermaidModule;
};

let mermaidModule: MermaidModule | null = null;
let initializationPromise: Promise<void> | null = null;

async function ensureMermaid(): Promise<MermaidModule> {
	const mock = (globalThis as MermaidGlobal).__MERMAID_MOCK__;
	if (mock) {
		// Reset cached initialization so each mock can configure itself.
		initializationPromise = null;
		return mock;
	}

	if (mermaidModule) return mermaidModule;

	// Import Mermaid's prebuilt browser bundle so the single-file CLI build
	// keeps Mermaid embedded without traversing the parser dependency graph.
	mermaidModule = (await import("mermaid/dist/mermaid.esm.mjs")) as unknown as MermaidModule;
	return mermaidModule;
}

async function initializeMermaid(mermaid: MermaidAPI): Promise<void> {
	if (initializationPromise) {
		return initializationPromise;
	}

	initializationPromise = (async () => {
		// Initialize with secure settings
		// Use 'strict' for production to prevent XSS attacks
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: "strict",
			theme: "default",
		});
	})();

	return initializationPromise;
}

export async function renderMermaidIn(element: HTMLElement): Promise<void> {
	// Check for mermaid blocks before touching the heavy library so plain markdown stays fast.
	const codeBlocks = Array.from(element.querySelectorAll("pre > code.language-mermaid")) as HTMLElement[];
	if (codeBlocks.length === 0) {
		return;
	}

	try {
		const m = await ensureMermaid();
		await initializeMermaid(m.default);

		await renderMermaidBlocks(m.default, element, codeBlocks);
	} catch (err) {
		console.warn("Failed to load mermaid", err);
	}
}
