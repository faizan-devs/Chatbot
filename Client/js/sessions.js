export function getActiveSession(sessions, activeSessionId) {
	return sessions.find((session) => session.id === activeSessionId);
}
