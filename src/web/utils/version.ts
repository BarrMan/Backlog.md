import { API_ROUTES } from "../../server/api-routes";

// Version utility for web UI
export async function getWebVersion(): Promise<string> {
	try {
		const response = await fetch(API_ROUTES.VERSION);
		const data = await response.json();
		return data.version;
	} catch {
		// If API call fails, just return empty string - UI can decide what to show
		return "";
	}
}
