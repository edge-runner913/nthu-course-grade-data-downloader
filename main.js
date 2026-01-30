import axios from "axios";
import { TextDecoder } from "util";
import fs from "fs";
import inquirer from "inquirer";
// ================ 手動設定區域 =================
const ACIXSTORE = '你的ACIXSTORE值'; // token，請自行從瀏覽器的 cookie 取得
// ================== configs ===================
const year = 114; // 預設民國年
const semester = 10; // 10: 上學期, 20: 下學期
const skipConfirm = false; // 是否跳過確認步驟
// ==============================================
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main(token, a, b, skip) {
    if (token === '' || token === '你的ACIXSTORE值') {
        console.warn('請先設定 ACIXSTORE 值');
        ({ token } = await inquirer.prompt([{
                type: "input",
                name: "token",
                message: "請貼上 ACIXSTORE 值",
            }]));
    }
    // 確保 data 資料夾存在
    const path = './data/';
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
    const time = new Date();
    const { confirmation } = (skip) ? { confirmation: true } : await inquirer.prompt([{
            type: "list",
            name: "confirmation",
            message: `確定查詢： ${a} 學年度 ${b === 10 ? '上學期' : '下學期'} 的資料？`,
            choices: [
                { name: "是", value: true },
                { name: "否 (重新輸入)", value: false },
            ],
            pageSize: 2,
        }]);
    // 彌彰看到會扣光分數的三元運算子
    const [year, semester] = (confirmation) ? [a, b] : await (async () => {
        const { year, semester } = await inquirer.prompt([
            {
                type: "number",
                name: "year",
                message: "請輸入年份(民國年，109 年以後)",
                default: a,
                validate: (input) => (typeof input === "number" &&
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
    //const name = `NTHU_${year}之${semester / 10}_${(time.getMonth() + 1)}-${time.getDate()}_${time.getHours()}-${time.getMinutes()}-${time.getSeconds()}.html`;
    const name = `NTHU_${year}_${semester / 10}.html`;
    const url = "https://www.ccxp.nthu.edu.tw/ccxp/INQUIRE/JH/8/8.4/8.4.2/JH84202.php";
    const payload = new FormData();
    payload.append('ACIXSTORE', token);
    payload.append('qyt', `${year}|${semester}`);
    payload.append('kwc', ''); // 課程名稱，要用 Big5 編碼
    payload.append('kwt', ''); // 教師姓名，要用 Big5 編碼
    payload.append('sort', 'ckey');
    payload.append('Submit', '%BDT%A9w+Submit');
    const headers = {
        Accept: "application/json, text/plain, */*",
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': url
    };
    try {
        console.info(`正在查詢： ${a} 學年度 ${b === 10 ? '上學期' : '下學期'} 的資料...`);
        const response = (await axios.post(url, payload, { headers, responseType: 'arraybuffer' }));
        const decoder = new TextDecoder('big5');
        const finalResult = decoder.decode(response.data);
        if (!finalResult.includes('課程')) {
            throw new Error('轉碼後的內容似乎不正確，請檢查 ACIXSTORE、學年或學期是否有誤。');
        }
        const head = `<!DOCTYPE html>` +
            `<html>` +
            `<head>` +
            `<meta charset="UTF-8">` +
            `</head>` +
            `</html>`;
        fs.writeFileSync(path + name, head + finalResult);
        console.info(`已將結果存成 ${name} 。`);
    }
    catch (err) {
        console.error('錯誤：' + err);
    }
}
await main(ACIXSTORE, year, semester, skipConfirm);
// 批次下載 101-114 年的資料
/*
const arr: Array<10 | 20> = [10, 20];
for (let i = 108; i <= 114; i++) {
    for (const seme of arr) {
        await main(i, seme, true);
        await delay(500); // 避免請求過於頻繁
    }
}
*/ 
