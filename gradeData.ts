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
import { path, decoder, loading, extractText } from "./utils.js";

export interface Course {
	Semester: string
	'Course No': string
	'Course Name': string
	Teacher: string
	Enrollment: string
	'Avg GPA'?: number
	'Std Dev (GPA)'?: number
	'Avg (Percent)'?: number
	'Std Dev (Percent)'?: number
}

export async function gradeData(ACIXSTORE: string | Promise<string>, a: number, b: 10 | 20, skip?: boolean): Promise<{ format: Course[], year: number, semester: 10 | 20 }> {
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
	const [year, semester]: [number, 10 | 20] = (confirmation) ? [a, b] : await (async () => {
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
		const loader_remove = loading(); // 開始 loading 動畫

		console.info(`正在查詢： ${year} 學年度 ${semester === 10 ? '上學期' : '下學期'} 的資料...`);
		const response = await axios.post(url, payload, { headers, responseType: 'arraybuffer' })
			.then((arrayBuffer) => decoder.decode(new Uint8Array(arrayBuffer.data)))
			.then((html) => html.replace(/<p><input[^>]*Back[^<]*><\/p>/g, '')); // 把回上一頁 Back 的按鈕拿掉

		loader_remove();



		if (!response.includes('課程')) {
			if (response.includes('session is interrupted')) {
				throw new Error('ACIXSTORE 無效或已過期，請重新獲取。');
			}
			throw new Error('查詢失敗。請檢查 ACIXSTORE、學年或學期是否有誤。');
		}

		const format = await formatCourses(response);

		fs.writeFileSync(path + name, response.replace('charset=big5', 'charset=UTF-8'));
		console.info(`已將結果存成 ${name} 。`);
		return {
			format,
			year,
			semester
		};
	} catch (err) {
		console.error('錯誤：', err);
		return { format: [], year: a, semester: b };
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

		const courseId = extractText(cells[0]);
		const courseName = extractText(cells[1]);
		const teacher = extractText(cells[2]);
		const enrollment = parseInt(extractText(cells[3]) || "0");

		const gpa_average = parseFloat(extractText(cells[4])) || undefined; // GPA Avg
		const gpa_stddev = parseFloat(extractText(cells[5])) || ((gpa_average !== undefined) ? 0 : undefined); // GPA Std Dev
		const pct_average = parseFloat(extractText(cells[6])) || undefined; // Score Avg
		const pct_stddev = parseFloat(extractText(cells[7])) || ((pct_average !== undefined) ? 0 : undefined); // Score Std Dev

		const semester = courseId.slice(0, 3) + '-' + courseId[3];

		dataArray.push({
			Semester: semester,
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
