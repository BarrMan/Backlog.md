import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface MilestoneFeedback {
	error: string | null;
	success: string | null;
	clear: () => void;
	fail: (message: string) => void;
	succeed: (message: string) => void;
}

const MilestoneFeedbackContext = createContext<MilestoneFeedback | null>(null);

export const MilestoneFeedbackProvider = ({ children }: { children: React.ReactNode }) => {
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const successTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (successTimeout.current) clearTimeout(successTimeout.current);
		},
		[],
	);

	const clear = useCallback(() => {
		setError(null);
		setSuccess(null);
	}, []);
	const fail = useCallback((message: string) => {
		setSuccess(null);
		setError(message);
	}, []);
	const succeed = useCallback((message: string) => {
		if (successTimeout.current) clearTimeout(successTimeout.current);
		setError(null);
		setSuccess(message);
		successTimeout.current = setTimeout(() => {
			setSuccess(null);
			successTimeout.current = null;
		}, 3000);
	}, []);

	return (
		<MilestoneFeedbackContext.Provider value={{ error, success, clear, fail, succeed }}>
			{children}
		</MilestoneFeedbackContext.Provider>
	);
};

export const useMilestoneFeedback = () => {
	const feedback = useContext(MilestoneFeedbackContext);
	if (!feedback) throw new Error("Milestone feedback must be used within its provider.");
	return feedback;
};
