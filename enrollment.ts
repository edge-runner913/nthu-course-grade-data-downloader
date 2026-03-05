import axios from "axios";
import fs from "fs";

import 'dotenv/config';
import {
	HTMLOptionElement,
	HTMLTableCellElement,
	HTMLTableElement,
	parseHTML,
} from "linkedom/worker";
import { decoder, loading } from "./utils.js";

export interface Enrollment {
	'Course No': string
	'Course Name': string
	GE_Category?: value
	Teacher: string
	Time: string
	Size: value
	Current: number
	Remaining: value
	Random: number
}

type value = null | number;

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

		const format = formatCourses(response);

		fs.writeFileSync(name, response.replace('charset=big5', 'charset=UTF-8')); // 直接把 big5 換成 UTF-8 就好啦
		console.info(`已將結果存成 ${name} 。`);
		return format;
	} catch (err) {
		console.error('錯誤：', err);
	}
}

export async function formatCourses(html: string, dataArray: Array<Enrollment> = [])
	: Promise<Enrollment[]> {
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

		const courseNo = cells[0].textContent?.trim().replace(/\s+/g, ' ') || "";

		const divCourseName = cells[1].querySelector("div");
		const courseNameHtml = divCourseName?.innerHTML || "";
		const courseName = courseNameHtml.split(/<br>/i)[0].replace(/<[^>]*>?/gm, '').trim();

		const divTeacher = cells[2].querySelector("div");
		const teacherHtml = divTeacher?.innerHTML || "";
		const teacher = teacherHtml.split(/<br>/i)[0].replace(/<[^>]*>?/gm, '').trim();

		const ifNaN = <T = null>(str: string, other: T | null = null) => isNaN(parseFloat(str)) ? other : parseFloat(str);
		const ge = courseNo.includes("GE") ? 1 : 0; // GE 課程會多一欄「通識類別」
		let GE_Category: number | null | undefined;
		if (ge) {
			const GE_CategoryStr = cells[3].textContent?.trim() || "";
			switch (GE_CategoryStr) {
				case "向度1": GE_Category = 1; break;
				case "向度2": GE_Category = 2; break;
				case "向度3": GE_Category = 3; break;
				case "向度4": GE_Category = 4; break;
				default: GE_Category = null;
			}
		}

		const time = cells[3 + ge].textContent?.trim() || "";
		const limitStr = ifNaN(cells[4 + ge].textContent?.trim());
		const currentStr = <number>ifNaN(cells[5 + ge].textContent?.trim(), 0);
		const remainingStr = ifNaN(cells[6 + ge].textContent?.trim());
		const randomStr = <number>ifNaN(cells[7 + ge].textContent?.trim(), 0);

		dataArray.push({
			'Course No': courseNo,
			'Course Name': courseName,
			GE_Category: GE_Category,
			Teacher: teacher,
			Time: time,
			Size: limitStr,
			Current: currentStr,
			Remaining: remainingStr,
			Random: randomStr,
		});
	}
	return dataArray;
}