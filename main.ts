import fs from "fs";
import inquirer from "inquirer";
import { NTHU_login } from "nthu-auto-login-and-acixstore-getter"; // 自己寫的登入系統
import 'dotenv/config';
import file from './dept.json' with { type: "json" };
import {
	gradeData,
	formatCourses,
	Course
} from "./gradeData.js";
import { enrollment } from "./enrollment.js";
import { year, semester, skipConfirm, path, decoder, loading, account, password } from "./utils.js";

interface Choices {
	name: string;
	value: string;
}
const dept = file as Choices[]; // 讀取開課單位列表




const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


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
		case 'GradeData': {
			const format = await gradeData(token, year, semester, skipConfirm);
			fs.writeFileSync(path + "formatted_courses.json", JSON.stringify(format, null, 4));
			break;
		}
		case 'AllGradeData': { // 批次下載 109-114 年的資料
			const arr: Array<10 | 20> = [10, 20];
			const courses: Course[] = [];
			for (let i = 109; i <= 114; i++) {
				for (const semester of arr) {
					const courseData = await gradeData(token, i, semester, true);
					courses.push(...courseData);
					await delay(500); // 避免請求過於頻繁
				}
			}
			fs.writeFileSync(path + "full_courses.json", JSON.stringify(courses, null, 4));
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


