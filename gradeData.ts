import axios from "axios";
import fs from "fs";
import inquirer from "inquirer";

import 'dotenv/config';
import {
	HTMLOptionElement,
	HTMLTableCellElement,
	HTMLTableElement,
	parseHTML,
} from "linkedom/worker";
import { path, decoder, loading } from "./utils.js";

export interface Course {
	Semester: string
	'Course No': string
	'Course Name': string
	Teacher: string
	Enrollment: string
	'Avg GPA': value
	'Std Dev (GPA)': value
	'Avg (Percent)': value
	'Std Dev (Percent)': value
}
type value = null | number;

export async function gradeData(ACIXSTORE: string | Promise<string>, a: number, b: 10 | 20, skip?: boolean): Promise<Course[]> {
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
		const loader = loading(); // 開始 loading 動畫

		console.info(`正在查詢： ${year} 學年度 ${semester === 10 ? '上學期' : '下學期'} 的資料...`);
		const response = await axios.post(url, payload, { headers, responseType: 'arraybuffer' })
			.then((arrayBuffer) => decoder.decode(new Uint8Array(arrayBuffer.data))); // TODO 把回上一頁 Back 的按鈕拿掉

		loader();



		if (!response.includes('課程')) {
			if (response.includes('session is interrupted')) {
				throw new Error('ACIXSTORE 無效或已過期，請重新獲取。');
			}
			throw new Error('查詢失敗。請檢查 ACIXSTORE、學年或學期是否有誤。');
		}

		const format = formatCourses(response); // TODO 格式化資料，抽取成 JSON

		fs.writeFileSync(path + name, response.replace('charset=big5', 'charset=UTF-8'));
		console.info(`已將結果存成 ${name} 。`);
		return format;
	} catch (err) {
		console.error('錯誤：', err);
		return [];
	}
}

export async function formatCourses(html: string, dataArray: Course[] = []): Promise<Course[]> {
	const doc = parseHTML(html).document;
	const tables = doc.querySelectorAll("table");
	const table = Array.from(tables).find((n) =>
		(n.textContent?.trim() ?? "").startsWith("科號"),
	) as HTMLTableElement | undefined;

	const rows = Array.from(table?.querySelectorAll("tr") ?? []);

	for (let i = 2; i < rows.length; i++) {
		const row = rows[i];
		const cells = Array.from(row.querySelectorAll("td")) as HTMLTableCellElement[]; // 每一格

		if (cells.length < 8) continue;

		// 直接依序取出 Sub-表格展開後的對應位置
		const courseId = cells[0].textContent?.trim();
		const courseName = cells[1].textContent?.trim();
		const teacher = cells[2].textContent?.trim();
		const enrollment = parseInt(cells[3].textContent?.trim() || "0");

		const gpa_average = parseFloat(cells[4].textContent?.trim()) || null; // GPA Avg
		const gpa_stddev = parseFloat(cells[5].textContent?.trim()) || null;  // GPA Std Dev
		const pct_average = parseFloat(cells[6].textContent?.trim()) || null; // Score Avg
		const pct_stddev = parseFloat(cells[7].textContent?.trim()) || null;  // Score Std Dev

		dataArray.push({
			Semester: "",
			'Course No': courseId,
			'Course Name': courseName,
			Teacher: teacher,
			Enrollment: enrollment.toString(),
			'Avg GPA': gpa_average,
			'Std Dev (GPA)': gpa_stddev,
			'Avg (Percent)': pct_average,
			'Std Dev (Percent)': pct_stddev
		});
	}
	return dataArray;
}