import axios from "axios";
import fs from "fs";

import 'dotenv/config';
import { decoder, loading } from "./utils.js";

export async function enrollment(ACIXSTORE: string | Promise<string>, courseId: string) {
	const url = "https://www.ccxp.nthu.edu.tw/ccxp/COURSE/JH/7/7.2/7.2.7/JH727002.php"
	const name = `NTHU_${courseId}_enrollment.html`;

	//const payload = new FormData();
	//payload.append('ACIXSTORE', await ACIXSTORE);
	//payload.append('select', courseId);
	//payload.append('act', 'ckey'); // IDK what this does, but it's required
	//payload.append('Submit', '%BDT%A9w+go');
	const payload = `ACIXSTORE=${await ACIXSTORE}&select=${courseId}&act=1&Submit=%BDT%A9w+go`;

	const headers = {
		Accept: "application/json, text/plain, */*",
	};

	try {
		const loader = loading(); // 開始 loading 動畫
		console.info(`正在查詢 ${courseId} 的選課人數...`);
		const response = (await axios.post(url, payload, {
			headers,
			responseType: 'arraybuffer',
			timeout: 20000
		}).then((arrayBuffer) => decoder.decode(new Uint8Array(arrayBuffer.data)))); // TODO 把回上一頁 Back 的按鈕拿掉

		if (response.includes('session is interrupted')) {
			throw new Error('ACIXSTORE 無效或已過期，請重新獲取。');
		}

		loader();

		const head = `<!DOCTYPE html>` +
			`<html>` +
			`<head>` +
			`<meta charset="UTF-8">` +
			`</head>` +
			`</html>`;
		fs.writeFileSync(name, response.replace('charset=big5', 'charset=UTF-8')); // 直接把 big5 換成 UTF-8 就好啦
		console.info(`已將結果存成 ${name} 。`);
	} catch (err) {
		console.error('錯誤：', err);
	}
}