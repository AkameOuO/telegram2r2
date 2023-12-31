/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// const Jimp = require("jimp");
// import Jimp from "jimp/es";

export default {
	async fetch(request, env, ctx) {
		async function getFile(file_id) {
			// var uuid = crypto.randomUUID();
			var fileName = "";
			// console.log(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getfile?file_id=${file_id}`);
			var res1 = await fetch(
				`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getfile?file_id=${file_id}`
			)
			var j = await res1.json();
			var path = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${j["result"]["file_path"]}`;
			var url = new URL(path);
			var ext = url.pathname.split(".").pop();
			fileName = `${crypto.randomUUID()}.${ext}`;
			console.log(path);
			var response = await fetch(path);
			ctx.waitUntil(env.images.put(fileName,response.body));
			return fileName;
		}

		async function telegram() {
			if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_VERIFY_TOKEN) {
				return new Response("Wrong token.", {
					"status": 403
				})
			}

			if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
				return new Response("Not supported Content-Type.",{
					"status": 400
				})
			}
			var requestJson = await request.json();
			// console.log(requestJson);
			// console.log(typeof(requestJson))

			var user = requestJson["message"]["from"]["id"];
			var doc = requestJson["message"]["document"];
			var photo = requestJson["message"]["photo"];
			if (user != env.USER_ID) {
				return new Response("");
			}
			if (doc && doc["mime_type"].includes("image")) {
				var fileName = await getFile(doc["file_id"]);
				await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendmessage`,
				{
					"method": "POST",
					"headers": {
						"Content-Type": "application/json"
					},
					"body": JSON.stringify({
						"chat_id": env.USER_ID,
						"text": `${env.DOMAIN_NAME}/${fileName}`,
						"reply_parameters": {
							"message_id": requestJson["message"]["message_id"]
						}
					})
				});
			} else if (photo) {
				var fileName = await getFile(photo.pop()["file_id"]);
				await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendmessage`,
				{
					"method": "POST",
					"headers": {
						"Content-Type": "application/json"
					},
					"body": JSON.stringify({
						"chat_id": env.USER_ID,
						"text": `${env.DOMAIN_NAME}/${fileName}`,
						"reply_parameters": {
							"message_id": requestJson["message"]["message_id"]
						}
					})
				});
			}

			return new Response("Telegram");
		}

		const url = new URL(request.url);
		// console.log(request);
		if (request.method === "POST") {
			switch (url.pathname) {
				case "/telegram":
					return telegram();
			}
			return new Response("Method not allowed.", {
				"status": 405
			})
		}
		return new Response("Hello World!");
	},
};
