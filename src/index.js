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
var env = null;
// Create a new router
const router = Router();


function validUserId(userId) {
	return userId == env.USER_ID;
}

async function tgPutFile(fileId,chatId,messageId) {
	var res1 = await fetch(
		`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getfile?file_id=${fileId}`
	);
	var j = await res1.json();
	if(j["ok"] === false) {
		await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendmessage`,
			{
				"method": "POST",
				"headers": {
					"Content-Type": "application/json"
				},
				"body": JSON.stringify({
					"chat_id": chatId,
					"text": j["description"],
					"reply_parameters": {
						"message_id": messageId
					}
				})
			}
		);
		return;
	}
	console.log(j);
	var path = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${j["result"]["file_path"]}`;
	var url = new URL(path);
	var ext = url.pathname.split(".").pop();
	var fileName = `${crypto.randomUUID()}.${ext}`;
	var response = await fetch(path);
	await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendmessage`,
		{
			"method": "POST",
			"headers": {
				"Content-Type": "application/json"
			},
			"body": JSON.stringify({
				"chat_id": chatId,
				"text": `\`${env.DOMAIN_NAME}/${fileName}\``,
				"parse_mode": "markdown",
				"reply_parameters": {
					"message_id": messageId
				},
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
	await env.images.put(fileName,response.body)
}

async function tgDeleteFile(replyText,replyChatId,replyMessageId,replyUserId) {
	if (replyUserId != env.BOT_ID) {
		return;
	}
	try {
		var url = new URL(replyText);
	}
	catch (e) {
		return;
	}
	if (url.origin === env.DOMAIN_NAME) {
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
	var data = requestJson["callback_query"]["data"];
	var cqid = requestJson["callback_query"]["id"];
	
	if (data === "/delete") {
		var replyToMessageJson = requestJson["callback_query"]["message"];
		if (replyToMessageJson) {
			var replyUserId = replyToMessageJson["from"]["id"];
			var replyChatId = replyToMessageJson["chat"]["id"];
			var replyMessageId = replyToMessageJson["message_id"];
			var replyText = replyToMessageJson["text"];
			await tgDeleteFile(
				replyText,
				replyChatId,
				replyMessageId,
				replyUserId
			);
		}
	}
	fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answercallbackquery?callback_query_id=${cqid}&text=deleted`)
}

async function tgReceiveCommand(requestJson) {
	var text = requestJson["message"]["text"];
	if (text === "/delete") {
		var replyToMessageJson = requestJson["message"]["reply_to_message"];
		if (replyToMessageJson) {
			var replyUserId = replyToMessageJson["from"]["id"];
			var replyChatId = replyToMessageJson["chat"]["id"];
			var replyMessageId = replyToMessageJson["message_id"];
			var replyText = replyToMessageJson["text"];
			await tgDeleteFile(
				replyText,
				replyChatId,
				replyMessageId,
				replyUserId
			);
		}
	}
}

router.post("/telegram", async(request,ctx) => {
	if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_VERIFY_TOKEN) {
		return new Response("Forbidden.", {
			"status": 403
		});
	}

	if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
		return new Response("Not supported Content-Type.",{
			"status": 400
		});
	}
	var requestJson = await request.json();
	if("callback_query" in requestJson) {
		ctx.waitUntil(tgCallbackQuery(requestJson));
		return new Response("");
	}
	else if(requestJson["message"]["text"] && requestJson["message"]["text"][0] === "/") {
		ctx.waitUntil(tgReceiveCommand(requestJson));
		return new Response("");
	}
	

	var userId = requestJson["message"]["from"]["id"];
	var chatId = requestJson["message"]["chat"]["id"];
	var messageId = requestJson["message"]["message_id"];
	var doc = requestJson["message"]["document"];
	var photo = requestJson["message"]["photo"];
	var video = requestJson["message"]["video"];
	if (!validUserId(userId)) {
		return new Response("");
	}
	if (doc) {
		ctx.waitUntil(tgPutFile(
			doc["file_id"],
			chatId,
			messageId
		));
	} else if (photo) {
		ctx.waitUntil(tgPutFile(
			photo.pop()["file_id"],
			chatId,
			messageId
		));
	} else if (video) {
		ctx.waitUntil(tgPutFile(
			video["file_id"],
			chatId,
			messageId
		));
	}

	return new Response("");
})

router.all("*", async() => {
	return new Response("Not Found",{
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
