// ========================================
// ProjectE 専用 Google Apps Script
// ========================================
// 重要: このファイルは projectE 専用です。
// projectD とは完全に独立したデータ管理を行います。
// ========================================

// projectE 専用のスプレッドシートID
// 名称: 「バック側座席管理シート」
// TODO: Google スプレッドシートを作成後、ここにIDを設定してください
const PROJECTE_SPREADSHEET_ID = "1CXvmZNF3aknq07RCq9LCZwteJGSsVfU4UW9IGXA0rt0";

/**
 * GET リクエスト処理
 * 座席データを取得して返す
 */
function doGet() {
  try {
    if (PROJECTE_SPREADSHEET_ID === "YOUR_PROJECTE_SPREADSHEET_ID_HERE") {
      throw new Error("スプレッドシートIDが設定されていません。code.gs の10行目を確認してください。");
    }
    const spreadsheet = SpreadsheetApp.openById(PROJECTE_SPREADSHEET_ID);
    const sheet = spreadsheet.getSheets()[0]; // 最初のシート
    const data = sheet.getRange(1, 1).getValue();
    
    const response = {
      status: "success",
      data: data ? JSON.parse(data) : {}
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error("GET Error: " + error.toString());
    const response = {
      status: "error",
      message: error.toString()
    };
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * POST リクエスト処理
 * 座席データを保存する
 */
function doPost(e) {
  try {
    if (PROJECTE_SPREADSHEET_ID === "YOUR_PROJECTE_SPREADSHEET_ID_HERE") {
      throw new Error("スプレッドシートIDが設定されていません。");
    }
    const spreadsheet = SpreadsheetApp.openById(PROJECTE_SPREADSHEET_ID);
    const sheet = spreadsheet.getSheets()[0];
    
    let rawData = e.postData.contents;
    if (!rawData) {
       throw new Error("受信データが空です。");
    }
    
    // データのバリデーション（JSONとして正しいか）
    const postData = JSON.parse(rawData);
    sheet.getRange(1, 1).setValue(JSON.stringify(postData));
    
    const response = {
      status: "success",
      message: "データを保存しました"
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error("POST Error: " + error.toString());
    const response = {
      status: "error",
      message: error.toString()
    };
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
