import env from '../config/env.js';

const escapeHtml = (value) =>
	String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

export const sendPasswordResetEmail = async ({ email, name, resetToken }) => {
	if (!env.resendApiKey || !env.emailFrom) {
		console.log(`Password reset token for ${email}: ${resetToken}`);
		return { delivered: false };
	}

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.resendApiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: env.emailFrom,
			to: email,
			subject: 'Reset your Alice password',
			html: `<p>Hi ${escapeHtml(
				name,
			)},</p><p>Your password reset token is:</p><p><strong>${escapeHtml(
				resetToken,
			)}</strong></p><p>This token expires in 15 minutes.</p>`,
		}),
	});

	if (!response.ok) {
		const error = new Error('Could not send password reset email.');
		error.status = 502;
		throw error;
	}

	return { delivered: true };
};
