interface MermaidAPI {
	run?: (options?: { nodes?: HTMLElement[] }) => Promise<void>;
	render?: (id: string, text: string) => Promise<{ svg: string; bindFunctions?: (element: HTMLElement) => void }>;
}

function createWrapper(code: HTMLElement) {
	const wrapper = document.createElement("div");
	wrapper.className = "mermaid";
	wrapper.textContent = code.textContent || "";
	code.parentElement?.replaceWith(wrapper);
	return wrapper;
}

async function renderWithFallback(mermaid: MermaidAPI, wrapper: HTMLElement, text: string) {
	if (mermaid.run) {
		try {
			await mermaid.run({ nodes: [wrapper] });
			return true;
		} catch {}
	}
	if (!mermaid.render) return false;
	try {
		const result = await mermaid.render(`mermaid-${Math.random().toString(36).slice(2, 9)}`, text);
		wrapper.innerHTML = result.svg;
		result.bindFunctions?.(wrapper);
		return true;
	} catch {
		return false;
	}
}

export async function renderMermaidBlocks(mermaid: MermaidAPI, element: HTMLElement, codeBlocks: HTMLElement[]) {
	for (const code of codeBlocks) {
		const wrapper = createWrapper(code);
		if (!document.body.contains(wrapper)) element.appendChild(wrapper);
		if (!(await renderWithFallback(mermaid, wrapper, wrapper.textContent || ""))) {
			console.warn("mermaid: no compatible render method found, leaving raw code block");
		}
	}
}
