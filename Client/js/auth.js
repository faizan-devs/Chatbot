import { API_BASE_URL } from './config.js';
import { requestJson } from './api.js';

export async function login(email, password) {
	return requestJson(`${API_BASE_URL}/auth/login`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			email,
			password,
		}),
	});
}

export async function forgotPassword(email) {
	return requestJson(`${API_BASE_URL}/auth/forgot-password`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ email }),
	});
}

export async function forgotPassword(email) {
	return requestJson(`${API_BASE_URL}/auth/forgot-password`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ email }),
	});
}
