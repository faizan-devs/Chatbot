export async function sendMessage({
	token,
	sessionId,
	message,
	onChunk,
	onDone,
}) {
	const response = await fetch(`${API_BASE_URL}/chat`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			sessionId,
			message,
		}),
	});

	// Read SSE stream...
}
