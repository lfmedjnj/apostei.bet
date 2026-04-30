// ===== FAROL — Google Apps Script Web App =====
// Deploy as: Execute as "Me" | Who has access: "Anyone"
// Returns the Theorical DB sheet as CSV (GET) so the front-end can fetch
// it without CORS or auth issues.

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Find the sheet — tries "Theorical DB", "Theoretical DB", falls back to first sheet
    var sheet = ss.getSheets().find(function(s) {
      return /theorical|theoretical/i.test(s.getName());
    }) || ss.getSheets()[0];

    var data = sheet.getDataRange().getValues();

    // Convert 2D array to CSV string
    var csv = data.map(function(row) {
      return row.map(function(cell) {
        var val = cell instanceof Date
          ? Utilities.formatDate(cell, ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy')
          : String(cell === null || cell === undefined ? '' : cell);
        // Wrap in quotes if contains comma, newline or quote
        if (val.search(/[",\n]/) >= 0) {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',');
    }).join('\n');

    return ContentService
      .createTextOutput(csv)
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    return ContentService
      .createTextOutput('ERROR: ' + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}
