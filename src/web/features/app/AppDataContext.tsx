import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { useAppData } from "../../hooks/useAppData";

type AppData = ReturnType<typeof useAppData>;

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
	const data = useAppData();
	return <AppDataContext.Provider value={data}>{children}</AppDataContext.Provider>;
}

export function useAppDataContext(): AppData {
	const data = useContext(AppDataContext);
	if (!data) throw new Error("useAppDataContext must be used within AppDataProvider");
	return data;
}
