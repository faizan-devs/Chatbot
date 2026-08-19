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
	session.messages.some((message) => message.role === 'user');

const getApiBaseUrl = () => {
	const isLocal =
		location.hostname === 'localhost' || location.hostname === '127.0.0.1';

	return isLocal ? 'http://localhost:3000' : 'https://chatbot-u746.onrender.com';
};

const syncSessionsToServer = async (savedSessions) => {
	try {
		await fetch(`${getApiBaseUrl()}/sessions`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
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

	localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSessions));

	if (activeSession && hasConversation(activeSession)) {
		localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
	} else {
		localStorage.removeItem(ACTIVE_SESSION_KEY);
	}

	if (syncServer) {
		queueServerSessionSync(savedSessions);
	}
};

const loadSessions = () => {
	let savedSessions = [];

	try {
		const parsedSessions = JSON.parse(localStorage.getItem(STORAGE_KEY));

		if (Array.isArray(parsedSessions)) {
			savedSessions = parsedSessions.map((session) => ({
				...createEmptySession(),
				...session,
				messages: Array.isArray(session.messages) ? session.messages : [],
			}));
		}
	} catch {
		savedSessions = [];
	}

	const savedActiveSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
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

const normalizeSession = (session) => ({
	...createEmptySession(),
	...session,
	messages: Array.isArray(session.messages) ? session.messages : [],
});

const getConversationSnapshot = (conversationSessions) =>
	JSON.stringify(
		[...conversationSessions].sort((a, b) => b.updatedAt - a.updatedAt),
	);

const syncSessionsFromServer = async () => {
	if (isGenerating) return;

	try {
		const response = await fetch(`${getApiBaseUrl()}/sessions`);
		if (!response.ok) return;

		const data = await response.json();
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
			deleteButton.type = 'button';
			deleteButton.className = 'delete-chat-button';
			deleteButton.dataset.deleteSessionId = session.id;
			deleteButton.setAttribute('role', 'menuitem');
			deleteIcon.className = 'material-symbols-rounded';
			deleteIcon.setAttribute('aria-hidden', 'true');
			deleteIcon.textContent = 'delete';
			deleteText.textContent = 'Delete';
			deleteButton.append(deleteIcon, deleteText);
			menu.appendChild(deleteButton);

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
		const response = await fetch(`${getApiBaseUrl()}/limit-status`);
		if (!response.ok) return true;

		const data = await response.json();
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
	const activeSession = getActiveSession();
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
	} else {
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

const getApiUrl = () => {
	return `${getApiBaseUrl()}/chat`;
};

const generateBotResponse = async (incomingMessageDiv, sessionId) => {
	const messageElement = incomingMessageDiv.querySelector('.message-text');
	const session = sessions.find((item) => item.id === sessionId);

	try {
		const response = await fetch(getApiUrl(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: toApiHistory(session.messages),
			}),
		});

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
	if (!userData.message) return;
	if (isGenerating) return;

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

loadSessions();
renderConversationList();
renderChat();
syncSessionsFromServer();
window.addEventListener('focus', syncSessionsFromServer);
window.addEventListener('storage', (e) => {
	if (e.key === STORAGE_KEY || e.key === ACTIVE_SESSION_KEY) {
		loadSessions();
		renderConversationList();
		renderChat();
	}
});
setInterval(syncSessionsFromServer, 5000);
