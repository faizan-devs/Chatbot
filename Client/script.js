const authScreen = document.querySelector('#auth-screen');
const homeAccountHint = document.querySelector('#home-account-hint');
const startChatButton = document.querySelector('#start-chat');
const authForms = document.querySelectorAll('.auth-form');
const loginForm = document.querySelector('#login-form');
const signupForm = document.querySelector('#signup-form');
const forgotForm = document.querySelector('#forgot-form');
const requestResetButton = document.querySelector('#request-reset');
const accountName = document.querySelector('#account-name');
const accountEmail = document.querySelector('#account-email');
const logoutButton = document.querySelector('#logout-button');
const chatBody = document.querySelector('.chat-body');
const messageInput = document.querySelector('.message-input');
const fileInput = document.querySelector('#file-input');
const fileUploadWrapper = document.querySelector('.file-upload-wrapper');
const fileCancelButton = document.querySelector('#file-cancel');
const newChatButton = document.querySelector('#new-chat');
const chatForm = document.querySelector('.chat-form');
const conversationList = document.querySelector('#conversation-list');
const scrollToBottomButton = document.querySelector('#scroll-to-bottom');
const limitPopup = document.querySelector('#limit-popup');
const limitPopupMessage = document.querySelector('#limit-popup-message');
const limitPopupClose = document.querySelector('#limit-popup-close');

const AUTH_TOKEN_KEY = 'alice-auth-token';
const AUTH_USER_KEY = 'alice-auth-user';
const STORAGE_KEY = 'alice-chat-sessions';
const ACTIVE_SESSION_KEY = 'alice-active-session-id';
const BOTTOM_THRESHOLD = 80;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const SERVER_SYNC_DEBOUNCE_MS = 250;

const botAvatar = `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50"
	viewBox="0 0 1024 1024" aria-hidden="true">
	<path
		d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z">
	</path>
</svg>`;

const initialBotMessage = `${botAvatar}
	<div class="message-text">
		Hi, I am Alice.<br />
		How can I help you today?
	</div>`;

const userData = {
	message: null,
	file: {
		data: null,
		mime_type: null,
	},
};

let sessions = [];
let activeSessionId = null;
let openMenuSessionId = null;
let isGenerating = false;
let syncTimer = null;
let currentUser = null;
let authToken = localStorage.getItem(AUTH_TOKEN_KEY);

const getApiBaseUrl = () => {
	const isLocal =
		location.hostname === 'localhost' || location.hostname === '127.0.0.1';

	return isLocal ? 'http://localhost:3000' : 'https://chatbot-u746.onrender.com';
};

const getUserStorageKey = (key) => `${key}:${currentUser?.id || 'guest'}`;

const getAuthHeaders = (withJson = false) => ({
	...(withJson ? { 'Content-Type': 'application/json' } : {}),
	...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
});

const requestJson = async (path, options = {}) => {
	const response = await fetch(`${getApiBaseUrl()}${path}`, {
		...options,
		headers: {
			...getAuthHeaders(options.body !== undefined),
			...options.headers,
		},
	});
	const contentType = response.headers.get('content-type') || '';
	const data = contentType.includes('application/json')
		? await response.json()
		: {};

	if (!response.ok) {
		throw new Error(data.message || 'Something went wrong.');
	}

	return data;
};

const createMessageElement = (content, ...classes) => {
	const div = document.createElement('div');
	div.classList.add('message', ...classes);
	div.innerHTML = content;
	return div;
};

const createSessionId = () => {
	if (window.crypto?.randomUUID) {
		return window.crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEmptySession = () => ({
	id: createSessionId(),
	title: 'New chat',
	messages: [],
	createdAt: Date.now(),
	updatedAt: Date.now(),
});

const getActiveSession = () =>
	sessions.find((session) => session.id === activeSessionId);

const hasConversation = (session) =>
	session?.messages?.some((message) => message.role === 'user');

const setAuthMessage = (form, message, isError = false) => {
	const messageElement = form.querySelector('[data-auth-message]');
	messageElement.textContent = message;
	messageElement.classList.toggle('visible', Boolean(message));
	messageElement.classList.toggle('error', isError);
};

const showAuthView = (view) => {
	authForms.forEach((form) => {
		form.classList.toggle('active', form.id === `${view}-form`);
		setAuthMessage(form, '');
	});
};

const showHome = (message = '') => {
	document.body.classList.add('home-view');
	document.body.classList.remove('chat-view', 'auth-required');
	homeAccountHint.textContent =
		message ||
		(currentUser
			? `Signed in as ${currentUser.name}.`
			: 'Your private ChatGPT-style workspace.');
};

const showAuthScreen = (view = 'login', message = '') => {
	document.body.classList.add('home-view', 'auth-required');
	document.body.classList.remove('chat-view');
	showAuthView(view);
	if (message) {
		setAuthMessage(
			document.querySelector(`#${view}-form`),
			message,
			view === 'login',
		);
	}
	authScreen.querySelector('input')?.focus();
};

const showChat = () => {
	document.body.classList.add('chat-view');
	document.body.classList.remove('home-view', 'auth-required');
	messageInput.focus();
};

const setCurrentUser = (user, token) => {
	currentUser = user;
	authToken = token;
	localStorage.setItem(AUTH_TOKEN_KEY, token);
	localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
	accountName.textContent = user.name;
	accountEmail.textContent = user.email;
};

const clearAuth = () => {
	currentUser = null;
	authToken = null;
	localStorage.removeItem(AUTH_TOKEN_KEY);
	localStorage.removeItem(AUTH_USER_KEY);
	sessions = [createEmptySession()];
	activeSessionId = sessions[0].id;
	accountName.textContent = 'User';
	accountEmail.textContent = 'Please log in';
	renderConversationList();
	renderChat();
	showHome('You are logged out. Please log in to start chatting.');
};

const syncSessionsToServer = async (savedSessions) => {
	if (!authToken) return;

	try {
		await requestJson('/sessions', {
			method: 'PUT',
			body: JSON.stringify({
				sessions: savedSessions,
			}),
		});
	} catch (error) {
		console.warn('Could not sync chat history to server.', error);
	}
};

const queueServerSessionSync = (savedSessions) => {
	clearTimeout(syncTimer);
	syncTimer = setTimeout(() => {
		syncSessionsToServer(savedSessions);
	}, SERVER_SYNC_DEBOUNCE_MS);
};

const saveSessions = ({ syncServer = true } = {}) => {
	const savedSessions = sessions.filter(hasConversation);
	const activeSession = getActiveSession();

	localStorage.setItem(
		getUserStorageKey(STORAGE_KEY),
		JSON.stringify(savedSessions),
	);

	if (activeSession && hasConversation(activeSession)) {
		localStorage.setItem(getUserStorageKey(ACTIVE_SESSION_KEY), activeSessionId);
	} else {
		localStorage.removeItem(getUserStorageKey(ACTIVE_SESSION_KEY));
	}

	if (syncServer) {
		queueServerSessionSync(savedSessions);
	}
};

const normalizeSession = (session) => ({
	...createEmptySession(),
	...session,
	messages: Array.isArray(session.messages) ? session.messages : [],
});

const loadSessions = () => {
	let savedSessions = [];

	try {
		const parsedSessions = JSON.parse(
			localStorage.getItem(getUserStorageKey(STORAGE_KEY)),
		);

		if (Array.isArray(parsedSessions)) {
			savedSessions = parsedSessions.map(normalizeSession);
		}
	} catch {
		savedSessions = [];
	}

	const savedActiveSessionId = localStorage.getItem(
		getUserStorageKey(ACTIVE_SESSION_KEY),
	);
	const savedActiveSession = savedSessions.find(
		(session) => session.id === savedActiveSessionId,
	);
	const draftSession = createEmptySession();

	sessions = savedActiveSession
		? savedSessions
		: [draftSession, ...savedSessions];
	activeSessionId = savedActiveSession?.id ?? draftSession.id;
	saveSessions({ syncServer: false });
};

const getConversationSnapshot = (conversationSessions) =>
	JSON.stringify(
		[...conversationSessions].sort((a, b) => b.updatedAt - a.updatedAt),
	);

const syncSessionsFromServer = async () => {
	if (isGenerating || !authToken) return;

	try {
		const data = await requestJson('/sessions');
		if (!Array.isArray(data.sessions)) return;

		const previousActiveSessionId = activeSessionId;
		const previousSnapshot = getConversationSnapshot(
			sessions.filter(hasConversation),
		);
		const remoteSessions = data.sessions
			.map(normalizeSession)
			.filter(hasConversation)
			.sort((a, b) => b.updatedAt - a.updatedAt);
		const remoteSnapshot = getConversationSnapshot(remoteSessions);
		const mergedSessions = new Map();

		remoteSessions.forEach((session) => {
			mergedSessions.set(session.id, session);
		});

		sessions.filter(hasConversation).forEach((session) => {
			const existingSession = mergedSessions.get(session.id);

			if (
				!existingSession ||
				Number(session.updatedAt) > Number(existingSession.updatedAt)
			) {
				mergedSessions.set(session.id, session);
			}
		});

		const savedSessions = [...mergedSessions.values()]
			.filter(hasConversation)
			.sort((a, b) => b.updatedAt - a.updatedAt);
		const activeSession = savedSessions.find(
			(session) => session.id === activeSessionId,
		);
		const draftSession = createEmptySession();
		const nextSnapshot = getConversationSnapshot(savedSessions);

		sessions = activeSession ? savedSessions : [draftSession, ...savedSessions];
		activeSessionId = activeSession?.id ?? draftSession.id;
		saveSessions({
			syncServer: savedSessions.length > 0 && remoteSnapshot !== nextSnapshot,
		});

		if (
			previousActiveSessionId !== activeSessionId ||
			previousSnapshot !== nextSnapshot
		) {
			renderConversationList();
			renderChat();
		}
	} catch (error) {
		console.warn('Could not sync chat history from server.', error);
	}
};

const getSessionTitle = (text) => {
	const compactText = text.replace(/\s+/g, ' ').trim();
	return compactText.length > 36
		? `${compactText.slice(0, 36).trim()}...`
		: compactText || 'New chat';
};

const renderConversationList = () => {
	conversationList.innerHTML = '';

	[...sessions]
		.filter(hasConversation)
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.forEach((session) => {
			const item = document.createElement('div');
			const button = document.createElement('button');
			const icon = document.createElement('span');
			const title = document.createElement('span');
			const menuButton = document.createElement('button');
			const menu = document.createElement('div');
			const renameButton = document.createElement('button');
			const renameIcon = document.createElement('span');
			const renameText = document.createElement('span');
			const deleteButton = document.createElement('button');
			const deleteIcon = document.createElement('span');
			const deleteText = document.createElement('span');

			item.className = 'conversation-item';
			item.classList.toggle('menu-open', session.id === openMenuSessionId);
			item.dataset.sessionId = session.id;
			button.type = 'button';
			button.className = 'conversation-button';
			button.classList.toggle('active', session.id === activeSessionId);
			button.dataset.sessionId = session.id;
			icon.className = 'material-symbols-rounded';
			icon.setAttribute('aria-hidden', 'true');
			icon.textContent = 'forum';
			title.textContent = session.title;

			menuButton.type = 'button';
			menuButton.className = 'material-symbols-rounded conversation-menu-button';
			menuButton.dataset.menuSessionId = session.id;
			menuButton.setAttribute('aria-label', `Open menu for ${session.title}`);
			menuButton.setAttribute('aria-haspopup', 'menu');
			menuButton.setAttribute(
				'aria-expanded',
				String(session.id === openMenuSessionId),
			);
			menuButton.title = 'More';
			menuButton.textContent = 'more_horiz';

			menu.className = 'conversation-menu';
			menu.setAttribute('role', 'menu');
			renameButton.type = 'button';
			renameButton.className = 'rename-chat-button';
			renameButton.dataset.renameSessionId = session.id;
			renameButton.setAttribute('role', 'menuitem');
			renameIcon.className = 'material-symbols-rounded';
			renameIcon.setAttribute('aria-hidden', 'true');
			renameIcon.textContent = 'edit';
			renameText.textContent = 'Rename';
			renameButton.append(renameIcon, renameText);
			deleteButton.type = 'button';
			deleteButton.className = 'delete-chat-button';
			deleteButton.dataset.deleteSessionId = session.id;
			deleteButton.setAttribute('role', 'menuitem');
			deleteIcon.className = 'material-symbols-rounded';
			deleteIcon.setAttribute('aria-hidden', 'true');
			deleteIcon.textContent = 'delete';
			deleteText.textContent = 'Delete';
			deleteButton.append(deleteIcon, deleteText);
			menu.append(renameButton, deleteButton);

			button.append(icon, title);
			item.append(button, menuButton, menu);
			conversationList.appendChild(item);
		});
};

const toApiHistory = (messages) =>
	messages.map((message) => ({
		role: message.role,
		parts: [
			{ text: message.text },
			...(message.file?.data ? [{ inline_data: message.file }] : []),
		],
	}));

const isChatNearBottom = () =>
	chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight <
	BOTTOM_THRESHOLD;

const updateScrollToBottomButton = () => {
	const canScroll = chatBody.scrollHeight > chatBody.clientHeight + 16;
	scrollToBottomButton.classList.toggle(
		'visible',
		canScroll && !isChatNearBottom(),
	);
};

const scrollChatToBottom = (behavior = 'smooth') => {
	chatBody.scrollTo({ top: chatBody.scrollHeight, behavior });
	requestAnimationFrame(updateScrollToBottomButton);
};

const formatUnlockTime = (timestamp) =>
	new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(timestamp));

const showLimitPopup = (retryAt) => {
	limitPopupMessage.textContent = `Limit exceeded. Try again after ${formatUnlockTime(
		retryAt,
	)}.`;
	limitPopup.classList.add('visible');
};

const checkServerRateLimit = async () => {
	try {
		const data = await requestJson('/limit-status');
		const retryAt = Date.parse(data.retryAt);

		if (data.remaining <= 0) {
			showLimitPopup(
				Number.isNaN(retryAt)
					? Date.now() + RATE_LIMIT_WINDOW_MS
					: retryAt,
			);
			return false;
		}
	} catch (error) {
		console.warn('Could not check rate limit before sending.', error);
	}

	return true;
};

const setComposerDisabled = (disabled) => {
	isGenerating = disabled;
	messageInput.disabled = disabled;
	fileInput.disabled = disabled;
	chatForm.classList.toggle('is-disabled', disabled);

	chatForm.querySelectorAll('button').forEach((button) => {
		button.disabled = disabled;
	});
};

const resetFileUpload = () => {
	userData.file = {};
	fileUploadWrapper.classList.remove('file-uploaded');
	fileUploadWrapper.querySelector('img').removeAttribute('src');
	fileInput.value = '';
};

const resetTextareaHeight = () => {
	messageInput.style.height = 'auto';
	messageInput.style.height = `${Math.min(messageInput.scrollHeight, 148)}px`;
};

const renderAssistantReply = (messageElement, reply) => {
	if (window.marked) {
		messageElement.innerHTML = marked.parse(reply);
	} else {
		messageElement.textContent = reply;
	}

	if (window.hljs) {
		messageElement.querySelectorAll('pre code').forEach((block) => {
			hljs.highlightElement(block);
		});
	}
};

const renderChat = () => {
	const activeSession = getActiveSession() || createEmptySession();
	chatBody.innerHTML = '';
	chatBody.appendChild(createMessageElement(initialBotMessage, 'bot-message'));

	activeSession.messages.forEach((message) => {
		if (message.role === 'user') {
			const messageContent = `<div class="message-text"></div>
				${message.file?.data ? `<img src="data:${message.file.mime_type};base64,${message.file.data}" class="attachment" alt="Uploaded image" />` : ''}`;
			const messageDiv = createMessageElement(messageContent, 'user-message');
			messageDiv.querySelector('.message-text').textContent = message.text;
			chatBody.appendChild(messageDiv);
			return;
		}

		const messageDiv = createMessageElement(
			`${botAvatar}<div class="message-text"></div>`,
			'bot-message',
		);
		renderAssistantReply(messageDiv.querySelector('.message-text'), message.text);
		chatBody.appendChild(messageDiv);
	});

	scrollChatToBottom();
};

const startNewChat = () => {
	const activeSession = getActiveSession();

	if (hasConversation(activeSession)) {
		const nextSession = createEmptySession();
		sessions.unshift(nextSession);
		activeSessionId = nextSession.id;
	} else if (activeSession) {
		activeSession.title = 'New chat';
		activeSession.updatedAt = Date.now();
	}

	resetFileUpload();
	messageInput.value = '';
	resetTextareaHeight();
	saveSessions();
	renderConversationList();
	renderChat();
	messageInput.focus();
};

const deleteSession = (sessionId) => {
	sessions = sessions.filter((session) => session.id !== sessionId);

	if (activeSessionId === sessionId) {
		const newestSession = [...sessions].filter(hasConversation).sort(
			(a, b) => b.updatedAt - a.updatedAt,
		)[0];
		const draftSession = createEmptySession();

		if (newestSession) {
			activeSessionId = newestSession.id;
		} else {
			sessions.unshift(draftSession);
			activeSessionId = draftSession.id;
		}

		renderChat();
	}

	openMenuSessionId = null;
	saveSessions();
	renderConversationList();
};

const renameSession = async (sessionId) => {
	const session = sessions.find((item) => item.id === sessionId);
	if (!session) return;

	const title = prompt('Rename chat', session.title);
	if (!title?.trim()) {
		openMenuSessionId = null;
		renderConversationList();
		return;
	}

	session.title = title.trim().slice(0, 80);
	session.updatedAt = Date.now();
	openMenuSessionId = null;
	saveSessions();
	renderConversationList();

	try {
		const data = await requestJson(`/sessions/${sessionId}`, {
			method: 'PATCH',
			body: JSON.stringify({ title: session.title }),
		});

		if (data.session) {
			session.title = data.session.title;
			session.updatedAt = data.session.updatedAt;
			saveSessions({ syncServer: false });
			renderConversationList();
		}
	} catch (error) {
		console.warn('Could not rename chat on server.', error);
	}
};

const generateBotResponse = async (incomingMessageDiv, sessionId) => {
	const messageElement = incomingMessageDiv.querySelector('.message-text');
	const session = sessions.find((item) => item.id === sessionId);

	try {
		const response = await fetch(`${getApiBaseUrl()}/chat`, {
			method: 'POST',
			headers: getAuthHeaders(true),
			body: JSON.stringify({
				contents: toApiHistory(session.messages),
			}),
		});

		if (response.status === 401) {
			clearAuth();
			throw new Error('Please log in first.');
		}

		if (response.status === 429) {
			const limitData = await response.json();
			const retryAt = Date.parse(limitData.retryAt);
			showLimitPopup(
				Number.isNaN(retryAt)
					? Date.now() + RATE_LIMIT_WINDOW_MS
					: retryAt,
			);
			throw new Error(limitData.message || 'Daily chat limit reached.');
		}

		if (!response.ok || !response.body) {
			throw new Error('The assistant could not respond. Please try again.');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let botReply = '';
		let buffer = '';
		let streamComplete = false;

		incomingMessageDiv.classList.remove('thinking');
		messageElement.textContent = '';

		while (!streamComplete) {
			const { done, value } = await reader.read();

			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			while (buffer.includes('\n\n')) {
				const boundary = buffer.indexOf('\n\n');
				const event = buffer.slice(0, boundary).trim();
				buffer = buffer.slice(boundary + 2);

				if (!event.startsWith('data:')) continue;

				const data = event.replace(/^data:\s*/, '');

				if (data === '[DONE]') {
					streamComplete = true;
					break;
				}

				const shouldStayAtBottom = isChatNearBottom();
				botReply += JSON.parse(data);
				renderAssistantReply(messageElement, botReply);

				if (shouldStayAtBottom) {
					scrollChatToBottom('auto');
				} else {
					updateScrollToBottomButton();
				}
			}
		}

		session.messages.push({
			role: 'assistant',
			text: botReply,
			createdAt: Date.now(),
		});
		session.updatedAt = Date.now();
		saveSessions();
		renderConversationList();

		if (activeSessionId === sessionId && !chatBody.contains(incomingMessageDiv)) {
			renderChat();
		}
	} catch (error) {
		console.error(error);
		messageElement.textContent = error.message;
		messageElement.style.color = '#dc2626';
	} finally {
		resetFileUpload();
		setComposerDisabled(false);
		updateScrollToBottomButton();
	}
};

const handleOutgoingMessage = async (e) => {
	e.preventDefault();

	userData.message = messageInput.value.trim();
	if (!userData.message || isGenerating || !authToken) return;

	setComposerDisabled(true);
	const canSend = await checkServerRateLimit();
	if (!canSend) {
		setComposerDisabled(false);
		return;
	}

	const activeSession = getActiveSession();
	const outgoingFile = userData.file.data ? { ...userData.file } : null;

	messageInput.value = '';
	resetTextareaHeight();
	fileUploadWrapper.classList.remove('file-uploaded');

	const messageContent = `<div class="message-text"></div>
		${userData.file.data ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="attachment" alt="Uploaded image" />` : ''}`;

	const outgoingMessageDiv = createMessageElement(
		messageContent,
		'user-message',
	);
	outgoingMessageDiv.querySelector('.message-text').textContent =
		userData.message;
	chatBody.appendChild(outgoingMessageDiv);
	scrollChatToBottom();

	activeSession.messages.push({
		role: 'user',
		text: userData.message,
		file: outgoingFile,
		createdAt: Date.now(),
	});

	if (activeSession.title === 'New chat') {
		activeSession.title = getSessionTitle(userData.message);
	}

	activeSession.updatedAt = Date.now();
	saveSessions();
	renderConversationList();

	setTimeout(() => {
		const messageContent = `${botAvatar}
			<div class="message-text">
				<div class="thinking_indicator">
					<div class="dot"></div>
					<div class="dot"></div>
					<div class="dot"></div>
				</div>
			</div>`;

		const incomingMessageDiv = createMessageElement(
			messageContent,
			'bot-message',
			'thinking',
		);
		chatBody.appendChild(incomingMessageDiv);
		scrollChatToBottom();
		generateBotResponse(incomingMessageDiv, activeSession.id);
	}, 500);
};

const handleAuthSuccess = async ({ user, token }) => {
	setCurrentUser(user, token);
	loadSessions();
	renderConversationList();
	renderChat();
	showChat();
	await syncSessionsFromServer();
};

const handleLogin = async (e) => {
	e.preventDefault();
	setAuthMessage(loginForm, '');

	try {
		const formData = new FormData(loginForm);
		await handleAuthSuccess(
			await requestJson('/auth/login', {
				method: 'POST',
				body: JSON.stringify(Object.fromEntries(formData)),
			}),
		);
		loginForm.reset();
	} catch (error) {
		setAuthMessage(loginForm, error.message, true);
	}
};

const handleSignup = async (e) => {
	e.preventDefault();
	setAuthMessage(signupForm, '');

	try {
		const formData = new FormData(signupForm);
		await handleAuthSuccess(
			await requestJson('/auth/signup', {
				method: 'POST',
				body: JSON.stringify(Object.fromEntries(formData)),
			}),
		);
		signupForm.reset();
	} catch (error) {
		setAuthMessage(signupForm, error.message, true);
	}
};

const handleForgotRequest = async () => {
	setAuthMessage(forgotForm, '');

	try {
		const email = new FormData(forgotForm).get('email');
		const data = await requestJson('/auth/forgot-password', {
			method: 'POST',
			body: JSON.stringify({ email }),
		});
		const localTokenMessage = data.devResetToken
			? ` Local reset token: ${data.devResetToken}`
			: '';
		setAuthMessage(forgotForm, `${data.message}${localTokenMessage}`);
	} catch (error) {
		setAuthMessage(forgotForm, error.message, true);
	}
};

const handlePasswordReset = async (e) => {
	e.preventDefault();
	setAuthMessage(forgotForm, '');

	try {
		const formData = new FormData(forgotForm);
		const data = await requestJson('/auth/reset-password', {
			method: 'POST',
			body: JSON.stringify(Object.fromEntries(formData)),
		});
		setAuthMessage(forgotForm, data.message);
		forgotForm.reset();
	} catch (error) {
		setAuthMessage(forgotForm, error.message, true);
	}
};

const initializeAuth = async () => {
	if (!authToken) {
		showHome();
		return;
	}

	try {
		const data = await requestJson('/me');
		setCurrentUser(data.user, authToken);
		showHome();
	} catch {
		clearAuth();
	}
};

const handleStartChat = async () => {
	if (!authToken) {
		showAuthScreen('login', 'Please log in or create an account to start.');
		return;
	}

	try {
		const data = await requestJson('/me');
		setCurrentUser(data.user, authToken);
		loadSessions();
		renderConversationList();
		renderChat();
		showChat();
		await syncSessionsFromServer();
	} catch {
		clearAuth();
		showAuthScreen('login', 'Session expired. Please log in again.');
	}
};

messageInput.addEventListener('keydown', (e) => {
	const userMessage = e.target.value.trim();

	if (e.key === 'Enter' && !e.shiftKey && userMessage) {
		handleOutgoingMessage(e);
	}
});

messageInput.addEventListener('input', resetTextareaHeight);

fileInput.addEventListener('change', () => {
	const file = fileInput.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = (e) => {
		fileUploadWrapper.querySelector('img').src = e.target.result;
		fileUploadWrapper.classList.add('file-uploaded');
		const base64String = e.target.result.split(',')[1];

		userData.file = {
			data: base64String,
			mime_type: file.type,
		};
	};

	reader.readAsDataURL(file);
});

fileCancelButton.addEventListener('click', resetFileUpload);
limitPopupClose.addEventListener('click', () => {
	limitPopup.classList.remove('visible');
	messageInput.focus();
});
limitPopup.addEventListener('click', (e) => {
	if (e.target === limitPopup) {
		limitPopup.classList.remove('visible');
		messageInput.focus();
	}
});

if (window.EmojiMart) {
	const picker = new EmojiMart.Picker({
		theme: 'dark',
		skinTonePosition: 'none',
		previewPosition: 'none',
		onEmojiSelect: (emoji) => {
			const { selectionStart: start, selectionEnd: end } = messageInput;
			messageInput.setRangeText(emoji.native, start, end, 'end');
			messageInput.focus();
			resetTextareaHeight();
		},
		onClickOutside: (e) => {
			if (e.target.id === 'emoji-picker') {
				document.body.classList.toggle('show-emoji-picker');
			} else {
				document.body.classList.remove('show-emoji-picker');
			}
		},
	});

	chatForm.appendChild(picker);
}

authScreen.addEventListener('click', (e) => {
	const button = e.target.closest('[data-auth-view]');
	if (button) {
		showAuthView(button.dataset.authView);
	}
});
loginForm.addEventListener('submit', handleLogin);
signupForm.addEventListener('submit', handleSignup);
forgotForm.addEventListener('submit', handlePasswordReset);
requestResetButton.addEventListener('click', handleForgotRequest);
logoutButton.addEventListener('click', clearAuth);
startChatButton.addEventListener('click', handleStartChat);
chatForm.addEventListener('submit', handleOutgoingMessage);
newChatButton?.addEventListener('click', startNewChat);
conversationList.addEventListener('click', (e) => {
	const menuButton = e.target.closest('[data-menu-session-id]');
	if (menuButton) {
		const sessionId = menuButton.dataset.menuSessionId;
		openMenuSessionId = openMenuSessionId === sessionId ? null : sessionId;
		renderConversationList();
		return;
	}

	const deleteButton = e.target.closest('[data-delete-session-id]');
	if (deleteButton) {
		deleteSession(deleteButton.dataset.deleteSessionId);
		return;
	}

	const renameButton = e.target.closest('[data-rename-session-id]');
	if (renameButton) {
		renameSession(renameButton.dataset.renameSessionId);
		return;
	}

	const button = e.target.closest('button[data-session-id]');
	if (!button) return;

	activeSessionId = button.dataset.sessionId;
	openMenuSessionId = null;
	resetFileUpload();
	messageInput.value = '';
	resetTextareaHeight();
	saveSessions();
	renderConversationList();
	renderChat();
	messageInput.focus();
});
document.addEventListener('click', (e) => {
	if (openMenuSessionId && !e.target.closest('.conversation-item')) {
		openMenuSessionId = null;
		renderConversationList();
	}
});
chatBody.addEventListener('scroll', updateScrollToBottomButton);
scrollToBottomButton.addEventListener('click', () => scrollChatToBottom());
document
	.querySelector('#file-upload')
	.addEventListener('click', () => fileInput.click());
window.addEventListener('focus', syncSessionsFromServer);
window.addEventListener('storage', (e) => {
	if (
		currentUser &&
		(e.key === getUserStorageKey(STORAGE_KEY) ||
			e.key === getUserStorageKey(ACTIVE_SESSION_KEY))
	) {
		loadSessions();
		renderConversationList();
		renderChat();
	}
});
setInterval(syncSessionsFromServer, 5000);

initializeAuth();
