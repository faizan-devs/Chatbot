const chatBody = document.querySelector('.chat-body');
const messageInput = document.querySelector('.message-input');
const fileInput = document.querySelector('#file-input');
const fileUploadWrapper = document.querySelector('.file-upload-wrapper');
const fileCancelButton = document.querySelector('#file-cancel');
const clearChatButton = document.querySelector('#clear-chat');
const newChatButton = document.querySelector('#new-chat');
const chatForm = document.querySelector('.chat-form');

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

const chatHistory = [];

const createMessageElement = (content, ...classes) => {
	const div = document.createElement('div');
	div.classList.add('message', ...classes);
	div.innerHTML = content;
	return div;
};

const scrollChatToBottom = () => {
	chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
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

const resetChat = () => {
	chatHistory.length = 0;
	resetFileUpload();
	chatBody.innerHTML = '';
	chatBody.appendChild(createMessageElement(initialBotMessage, 'bot-message'));
	messageInput.value = '';
	resetTextareaHeight();
	messageInput.focus();
};

const getApiUrl = () => {
	const isLocal =
		location.hostname === 'localhost' || location.hostname === '127.0.0.1';

	return isLocal
		? 'http://localhost:3000/chat'
		: 'https://chatbot-u746.onrender.com/chat';
};

const generateBotResponse = async (incomingMessageDiv) => {
	const messageElement = incomingMessageDiv.querySelector('.message-text');

	chatHistory.push({
		role: 'user',
		parts: [
			{ text: userData.message },
			...(userData.file.data ? [{ inline_data: userData.file }] : []),
		],
	});

	try {
		const response = await fetch(getApiUrl(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: chatHistory,
			}),
		});

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

				botReply += JSON.parse(data);
				renderAssistantReply(messageElement, botReply);
				scrollChatToBottom();
			}
		}

		chatHistory.push({
			role: 'assistant',
			parts: [
				{
					text: botReply,
				},
			],
		});
	} catch (error) {
		console.error(error);
		messageElement.textContent = error.message;
		messageElement.style.color = '#dc2626';
	} finally {
		resetFileUpload();
		scrollChatToBottom();
	}
};

const handleOutgoingMessage = (e) => {
	e.preventDefault();

	userData.message = messageInput.value.trim();
	if (!userData.message) return;

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
		generateBotResponse(incomingMessageDiv);
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
clearChatButton.addEventListener('click', resetChat);
newChatButton?.addEventListener('click', resetChat);
document
	.querySelector('#file-upload')
	.addEventListener('click', () => fileInput.click());
