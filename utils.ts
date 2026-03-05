// ================ 手動設定區域 =================

export const account: string = '你的帳號';
export const password: string = '你的密碼';


// ================== configs ===================
export const year: number = 114;				// 預設民國年
export const semester: 10 | 20 = 10;			// 10: 上學期, 20: 下學期
export const skipConfirm = false;				// 是否跳過確認步驟
export const path = './data/';					// 儲存資料的路徑
// ==============================================


export const decoder = new TextDecoder('big5'); // NTHU 的系統使用 Big5 編碼

export const loading = (hint = "正在從 NTHU 下載資料...") => {
	const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
	let i = 0;
	return setInterval(() => {
		process.stdout.write(`\r\r${frames[i++ % frames.length]} ${hint}`);
	}, 100);
}