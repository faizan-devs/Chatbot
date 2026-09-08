import { initializeAuth } from './auth.js';
import { setupEventListeners } from './events.js';
import { loadSessions } from './sessions.js';

async function init() {
	setupEventListeners();

	await initializeAuth();
}

init();
