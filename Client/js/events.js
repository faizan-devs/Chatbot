export function setupEventListeners() {
	document.querySelector('#login-form').addEventListener('submit', handleLogin);

	document
		.querySelector('#signup-form')
		.addEventListener('submit', handleSignup);
}
