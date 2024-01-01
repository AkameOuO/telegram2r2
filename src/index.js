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
	var path = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${j["result"]["file_path"]}`;
	var url = new URL(path);
	var ext = url.pathname.split(".").pop();
	var fileName = `${crypto.randomUUID()}.${ext}`;
	var response = await fetch(path);
	await env.images.put(fileName,response.body)
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
				}
			})
		});
}

async function tgDeleteFile(request,ctx,fileId,chatId,messageId) {
	
}

router.post("/telegram", async(request,ctx) => {
	if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_VERIFY_TOKEN) {
		return new Response("Wrong token.", {
			"status": 403
		});
	}

	if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
		return new Response("Not supported Content-Type.",{
			"status": 400
		});
	}
	var requestJson = await request.json();

	var userId = requestJson["message"]["from"]["id"];
	var chatId = requestJson["message"]["chat"]["id"];
	var messageId = requestJson["message"]["message_id"];
	var doc = requestJson["message"]["document"];
	var photo = requestJson["message"]["photo"];
	if (!validUserId(userId)) {
		return new Response("");
	}
	if (doc && doc["mime_type"].includes("image")) {
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
