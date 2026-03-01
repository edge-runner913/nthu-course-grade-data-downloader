import axios from "axios";
import { TextDecoder } from "util";
import fs from "fs";
import inquirer from "inquirer";
import { NTHU_login } from "nthu-auto-login-and-acixstore-getter"; // 自己寫的登入系統
import 'dotenv/config';
import file from './dept.json' with { type: "json" };

interface Choices {
	name: string;
	value: string;
}
const dept = file as Choices[]; // 讀取開課單位列表

// ================ 手動設定區域 =================

const account: string = '你的帳號';
const password: string = '你的密碼';

// ================== configs ===================
const year: number = 114;				// 預設民國年
const semester: 10 | 20 = 10;			// 10: 上學期, 20: 下學期
const skipConfirm = false;				// 是否跳過確認步驟
const path = './data/';					// 儲存資料的路徑
// ==============================================

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const decoder = new TextDecoder('big5'); // NTHU 的系統使用 Big5 編碼

async function enrollment(ACIXSTORE: string | Promise<string>, courseId: string) {
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
		console.info(`正在查詢 ${courseId} 的選課人數...`);
		const response = (await axios.post(url, payload, {
			headers,
			responseType: 'arraybuffer',
			timeout: 20000
		}));

		const finalResult = decoder.decode(response.data); // TODO 把回上一頁 Back 的按鈕拿掉


		if (finalResult.includes('session is interrupted')) {
			throw new Error('ACIXSTORE 無效或已過期，請重新獲取。');
		}

		const head = `<!DOCTYPE html>` +
			`<html>` +
			`<head>` +
			`<meta charset="UTF-8">` +
			`</head>` +
			`</html>`;
		fs.writeFileSync(name, head + finalResult);
		console.info(`已將結果存成 ${name} 。`);
	} catch (err) {
		console.error('錯誤：', err);
	}
}

async function gradeData(ACIXSTORE: string | Promise<string>, a: number, b: 10 | 20, skip?: boolean) {
	// 確保 data 資料夾存在
	if (!fs.existsSync(path)) {
		fs.mkdirSync(path);
	}

	const time = new Date();
	const { confirmation } = (skip) ? { confirmation: true } : await inquirer.prompt([{
		type: "list",
		name: "confirmation",
		message: `是否查詢： ${a} 學年度 ${b === 10 ? '上學期' : '下學期'} 的資料？`,
		choices: [
			{ name: "是", value: true },
			{ name: "否 (重新輸入)", value: false },
		],
		pageSize: 2,
	}]);

	// 彌彰看到會扣光分數的三元運算子
	const [year, semester]: Array<number> = (confirmation) ? [a, b] : await (async () => {
		const { year, semester } = await inquirer.prompt([
			{
				type: "number",
				name: "year",
				message: "請輸入年份(民國年，最早為 109 年)",
				default: a,
				validate: (input: unknown) => (
					typeof input === "number" &&
					Number.isInteger(input) &&
					input >= 109 && // NTHU 的資料從 109 年開始有
					input <= time.getFullYear() - 1911) ||
					"請輸入有效範圍的數字",
			},
			{
				type: "list",
				name: "semester",
				message: "請選擇學期",
				choices: [
					{ name: "上學期", value: 10 },
					{ name: "下學期", value: 20 },
				],
				default: b,
				pageSize: 2,
			},
		]);
		return [year, semester];
	})();
	const name = `NTHU_${year}_${semester / 10}.html`;

	const url = "https://www.ccxp.nthu.edu.tw/ccxp/INQUIRE/JH/8/8.4/8.4.2/JH84202.php"
	const payload = new FormData();
	payload.append('ACIXSTORE', await ACIXSTORE);
	payload.append('qyt', `${year}|${semester}`);
	payload.append('kwc', '');      // TODO 課程名稱，要用 Big5 編碼
	payload.append('kwt', '');      // TODO 教師姓名，要用 Big5 編碼
	payload.append('sort', 'ckey'); // 排序欄位(科號/課程名稱)
	payload.append('Submit', '%BDT%A9w+Submit');

	const headers = {
		Accept: "application/json, text/plain, */*",
	};

	try {
		console.info(`正在查詢： ${year} 學年度 ${semester === 10 ? '上學期' : '下學期'} 的資料...`);
		const response = (await axios.post(url, payload, { headers, responseType: 'arraybuffer' }));

		const finalResult = decoder.decode(response.data); // TODO 把回上一頁 Back 的按鈕拿掉

		if (!finalResult.includes('課程')) {
			if (finalResult.includes('session is interrupted')) {
				throw new Error('ACIXSTORE 無效或已過期，請重新獲取。');
			}
			throw new Error('查詢失敗。請檢查 ACIXSTORE、學年或學期是否有誤。');
		}

		const head = `<!DOCTYPE html>` +
			`<html>` +
			`<head>` +
			`<meta charset="UTF-8">` +
			`</head>` +
			`</html>`;
		fs.writeFileSync(path + name, head + finalResult);
		console.info(`已將結果存成 ${name} 。`);
	} catch (err) {
		console.error('錯誤：', err);
	}
}
async function main(account: string, password: string) {
	console.log("=== 自動腳本啟動 (版本 1.1.2 - 獲取加退選人數) ===");

	const token = NTHU_login(account, password) // TODO 解決內部print影響inquirer
		.catch(async (err) => {
			console.error('❌ 登入或驗證碼獲取失敗，無法繼續：\n', err);
			process.exit(1); // 改天失敗率太高再把底下取消註釋 給人手動輸入token
			//console.info('請手動輸入 ACIXSTORE：');
			//const { token } = await inquirer.prompt([{
			//	type: "input",
			//	name: "token",
			//	message: "請貼上 ACIXSTORE 值",
			//}]);
			//return token;
		});
	console.info('\n' + '========= 登入成功！ =========' + '\n');
	const { mode } = await inquirer.prompt([{
		type: "list",
		name: "mode",
		message: `請選擇運行模式：`,
		choices: [
			{ name: "下載成績資料", value: 'GradeData' },
			{ name: "下載所有成績資料", value: 'AllGradeData' },
			{ name: "查詢選課人數", value: 'Enrollment' },
		],
		pageSize: 5,
	}]);

	switch (mode) {
		case 'GradeData':
			await gradeData(token, year, semester, skipConfirm);
			break;
		case 'AllGradeData': { // 批次下載 109-114 年的資料
			const arr: Array<10 | 20> = [10, 20];
			for (let i = 109; i <= 114; i++) {
				for (const semester of arr) {
					await gradeData(token, i, semester, true);
					await delay(500); // 避免請求過於頻繁
				}
			}
			break;
		}
		case 'Enrollment': {
			const { courseId } = await inquirer.prompt([{
				type: "list",
				name: "courseId",
				message: "請輸入開課單位 (例如：GE)",
				choices: dept,
				default: "GE",
				pageSize: 25,
			}]);
			await enrollment(token, courseId);
			break;
		}
	}
}

await main(account, password);