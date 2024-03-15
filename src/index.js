/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Router } from 'itty-router';
let env = null;
// Create a new router
const router = Router();


function validUserId(userId) {
	return userId == env.USER_ID;
}

async function urlPutFile(url, chatId, messageId) {
	let msg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendmessage`,
		{
			"method": "POST",
			"headers": {
				"Content-Type": "application/json"
			},
			"body": JSON.stringify({
				"chat_id": chatId,
				"text": "downloading...",
				"reply_parameters": {
					"message_id": messageId
				}
			})
		}
	).then((res) => {
		return res.json();
	});
	let msgId = msg.result.message_id;
	let response = await fetch(url);
	if (response.status !== 200 ) {
		await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editmessagetext`,
			{
				"method": "POST",
				"headers": {
					"Content-Type": "application/json"
				},
				"body": JSON.stringify({
					"chat_id": chatId,
					"message_id": msgId,
					"text": `Error: status code ${response.status}\``
				})
			}
		);
		return;
	}
	let fileName = `${crypto.randomUUID()}`;
	await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editmessagetext`,
		{
			"method": "POST",
			"headers": {
				"Content-Type": "application/json"
			},
			"body": JSON.stringify({
				"chat_id": chatId,
				"message_id": msgId,
				"text": `\`${env.DOMAIN_NAME}/${fileName}\``,
				"parse_mode": "markdown",
				"reply_markup": {
					"inline_keyboard": [[
						{
							"text": "delete",
							"callback_data": "/delete"
						},
						{
							"text": "open url",
							"url": `${env.DOMAIN_NAME}/${fileName}`
						}
					]]
				}
			})
		}
	);
	await env.images.put(fileName, response.body);
}

async function tgPutFile(fileId, chatId, messageId) {
	let res1 = await fetch(
		`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getfile?file_id=${fileId}`
	);
	let j = await res1.json();
	if (j.ok === false) {
		await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendmessage`,
			{
				"method": "POST",
				"headers": {
					"Content-Type": "application/json"
				},
				"body": JSON.stringify({
					"chat_id": chatId,
					"text": j.description,
					"reply_parameters": {
						"message_id": messageId
					}
				})
			}
		);
		return;
	}
	let msg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendmessage`,
		{
			"method": "POST",
			"headers": {
				"Content-Type": "application/json"
			},
			"body": JSON.stringify({
				"chat_id": chatId,
				"text": "downloading...",
				"reply_parameters": {
					"message_id": messageId
				}
			})
		}
	).then((res) => {
		return res.json();
	});

	let msgId = msg.result.message_id;
	let path = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${j.result.file_path}`;
	let url = new URL(path);
	let ext = url.pathname.split(".").pop();
	let fileName = `${crypto.randomUUID()}.${ext}`;
	try {
		let response = await fetch(path);
	} catch (e) {
		await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editmessagetext`,
			{
				"method": "POST",
				"headers": {
					"Content-Type": "application/json"
				},
				"body": JSON.stringify({
					"chat_id": chatId,
					"message_id": msgId,
					"text": `${e.name}: ${e.message}`,
				})
			}
		);
		return;
	}
	await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editmessagetext`,
		{
			"method": "POST",
			"headers": {
				"Content-Type": "application/json"
			},
			"body": JSON.stringify({
				"chat_id": chatId,
				"message_id": msgId,
				"text": `\`${env.DOMAIN_NAME}/${fileName}\``,
				"parse_mode": "markdown",
				"reply_markup": {
					"inline_keyboard": [[
						{
							"text": "delete",
							"callback_data": "/delete"
						},
						{
							"text": "open url",
							"url": `${env.DOMAIN_NAME}/${fileName}`
						}
					]]
				}
			})
		}
	);
	await env.images.put(fileName, response.body)
}

async function tgDeleteFile(replyText, replyChatId, replyMessageId, replyUserId) {
	if (replyUserId != env.BOT_ID) {
		return;
	}
	let url;
	try {
		url = new URL(replyText);
	}
	catch (e) {
		return;
	}
	if (url.origin === env.DOMAIN_NAME || true) {
		await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editmessagetext`,
			{
				"method": "POST",
				"headers": {
					"Content-Type": "application/json"
				},
				"body": JSON.stringify({
					"chat_id": replyChatId,
					"message_id": replyMessageId,
					"text": "_deleted_",
					"parse_mode": "markdownv2"
				})
			}
		);
		await env.images.delete(url.pathname.substring(1));
	}
}

async function tgCallbackQuery(requestJson) {
	let data = requestJson.callback_query.data;
	let cqid = requestJson.callback_query.id;

	if (data === "/delete") {
		let replyToMessageJson = requestJson.callback_query.message;
		if (replyToMessageJson) {
			let replyUserId = replyToMessageJson.from.id;
			let replyChatId = replyToMessageJson.chat.id;
			let replyMessageId = replyToMessageJson.message_id;
			let replyText = replyToMessageJson.text;
			await tgDeleteFile(
				replyText,
				replyChatId,
				replyMessageId,
				replyUserId
			);
		}
	}
	fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answercallbackquery?callback_query_id=${cqid}&text=deleted`);
}

async function tgReceiveCommand(requestJson) {
	let text = requestJson.message.text;
	if (text === "/delete") {
		let replyToMessageJson = requestJson.message.reply_to_message;
		if (replyToMessageJson) {
			let replyUserId = replyToMessageJson.from.id;
			let replyChatId = replyToMessageJson.chat.id;
			let replyMessageId = replyToMessageJson.message_id;
			let replyText = replyToMessageJson.text;
			await tgDeleteFile(
				replyText,
				replyChatId,
				replyMessageId,
				replyUserId
			);
		}
	}
}

router.post("/telegram", async (request, ctx) => {
	if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_VERIFY_TOKEN) {
		return new Response("Forbidden.", {
			"status": 403
		});
	}

	if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
		return new Response("Not supported Content-Type.", {
			"status": 400
		});
	}

	let requestJson = await request.json();
	if ("callback_query" in requestJson) {
		ctx.waitUntil(tgCallbackQuery(requestJson));
		return new Response("");
	} else if (requestJson.message.text && requestJson.message.text[0] === "/") {
		ctx.waitUntil(tgReceiveCommand(requestJson));
		return new Response("");
	}


	let userId = requestJson.message.from.id;
	let chatId = requestJson.message.chat.id;
	let messageId = requestJson.message.message_id;
	let doc = requestJson.message.document;
	let photo = requestJson.message.photo;
	let video = requestJson.message.video;
	let text = requestJson.message.text;
	let text_url;
	try {
		text_url = new URL(text);
	} catch {

	}
	console.log(text_url);
	console.log(text);
	if (!validUserId(userId)) {
		return new Response("");
	}
	if (doc) {
		ctx.waitUntil(tgPutFile(
			doc.file_id,
			chatId,
			messageId
		));
	} else if (photo) {
		ctx.waitUntil(tgPutFile(
			photo.pop().file_id,
			chatId,
			messageId
		));
	} else if (video) {
		ctx.waitUntil(tgPutFile(
			video.file_id,
			chatId,
			messageId
		));
	} else if (text_url) {
		ctx.waitUntil(urlPutFile(
			text,
			chatId,
			messageId
		))
	}

	return new Response("");
})

router.all("*", async () => {
	return new Response("Not Found", {
		"status": 404
	});
})

export default {
	async fetch(request, e, ctx) {
		if (!env) {
			env = e;
		}
		return router.handle(request, ctx)
	}
};
