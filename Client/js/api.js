export async function requestJson(url, options = {}) {
	const response = await fetch(url, options);

	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		const error = new Error(data.message || 'Something went wrong');

		error.status = response.status;
		error.data = data;

		throw error;
	}

	return data;
}
