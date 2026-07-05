// ═══════════════════════════════════════════════════════════════════════════
//  SCRWA — Automated Google Sheet Backup
//  Backup.gs  |  Part of SCRWA GAS project
//
//  What it does:
//    • Copies the entire Google Sheet as a new spreadsheet to Drive
//    • Organises backups in: My Drive / SCRWA_Backups / YYYY-MM /
//    • Keeps last N backups per month (auto-deletes oldest)
//    • Runs on schedule: Daily + Weekly full backup
//    • Menu: SCRWA Receipts → 💾 Backup Now
//
//  Backup naming:
//    SCRWA_Backup_2026-07-05_1300_Daily.xlsx
//    SCRWA_Backup_2026-07-06_0600_Weekly.xlsx
//
//  Retention policy:
//    Daily  → keep last 7
//    Weekly → keep last 4
//    Manual → keep last 5
// ═══════════════════════════════════════════════════════════════════════════

var BACKUP_SS_ID        = '1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA';
var BACKUP_FOLDER_NAME  = 'SCRWA_Backups';
var BACKUP_KEEP_DAILY   = 7;
var BACKUP_KEEP_WEEKLY  = 4;
var BACKUP_KEEP_MANUAL  = 5;

// ── Main backup function ────────────────────────────────────────────────────
function runBackup(type) {
  type = type || 'Manual';
  var tz      = 'Asia/Calcutta';
  var now     = new Date();
  var dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var timeStr = Utilities.formatDate(now, tz, 'HHmm');
  var monthStr = Utilities.formatDate(now, tz, 'yyyy-MM');

  // File name
  var fileName = 'SCRWA_Backup_' + dateStr + '_' + timeStr + '_' + type;

  // Get or create backup folder → month subfolder
  var rootFolder   = getOrCreateDriveFolder(BACKUP_FOLDER_NAME, DriveApp.getRootFolder());
  var monthFolder  = getOrCreateDriveFolder(monthStr, rootFolder);

  // Copy spreadsheet as Google Sheets file
  var sourceFile   = DriveApp.getFileById(BACKUP_SS_ID);
  var backupFile   = sourceFile.makeCopy(fileName, monthFolder);

  Logger.log('✅ Backup created: ' + fileName + ' → ' + backupFile.getId());

  // Apply retention policy
  applyRetention(monthFolder, type);

  return {
    success:   true,
    fileName:  fileName,
    fileId:    backupFile.getId(),
    timestamp: Utilities.formatDate(now, tz, 'dd-MMM-yyyy HH:mm'),
    type:      type
  };
}

// ── Scheduled: Daily backup ─────────────────────────────────────────────────
function runDailyBackup() {
  var result = runBackup('Daily');
  Logger.log('Daily backup: ' + JSON.stringify(result));
}

// ── Scheduled: Weekly backup ────────────────────────────────────────────────
function runWeeklyBackup() {
  var result = runBackup('Weekly');
  Logger.log('Weekly backup: ' + JSON.stringify(result));
}

// ── Manual: run from menu ───────────────────────────────────────────────────
function runManualBackup() {
  try {
    var result = runBackup('Manual');
    SpreadsheetApp.getUi().alert(
      '✅ Backup Complete!\n\n' +
      '📁 File: ' + result.fileName + '\n' +
      '🕐 Time: ' + result.timestamp + '\n' +
      '📂 Saved to: My Drive / ' + BACKUP_FOLDER_NAME + ' / ' + result.fileName.substring(13, 20)
    );
  } catch(err) {
    SpreadsheetApp.getUi().alert('❌ Backup failed:\n' + err.toString());
  }
}

// ── Retention: delete oldest beyond limit ──────────────────────────────────
function applyRetention(folder, type) {
  var limit = type === 'Daily'  ? BACKUP_KEEP_DAILY
            : type === 'Weekly' ? BACKUP_KEEP_WEEKLY
            : BACKUP_KEEP_MANUAL;

  // Get all files of this type in folder, sorted by date (oldest first)
  var files = [];
  var iter  = folder.getFiles();
  while (iter.hasNext()) {
    var f = iter.next();
    var name = f.getName();
    // Only consider files matching this type
    if (name.indexOf('_' + type) >= 0) {
      files.push({ file: f, date: f.getDateCreated() });
    }
  }

  // Sort oldest first
  files.sort(function(a, b) { return a.date - b.date; });

  // Delete oldest beyond limit
  var toDelete = files.length - limit;
  for (var i = 0; i < toDelete; i++) {
    Logger.log('🗑️ Deleting old backup: ' + files[i].file.getName());
    files[i].file.setTrashed(true);
  }
}

// ── Helper: get or create Drive folder ─────────────────────────────────────
function getOrCreateDriveFolder(name, parent) {
  var iter = parent.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parent.createFolder(name);
}

// ── Trigger setup ───────────────────────────────────────────────────────────
function setupBackupTriggers() {
  // Remove existing backup triggers
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runDailyBackup' ||
        t.getHandlerFunction() === 'runWeeklyBackup') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Daily backup — every day at 2am IST
  ScriptApp.newTrigger('runDailyBackup')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();

  // Weekly backup — every Sunday at 3am IST
  ScriptApp.newTrigger('runWeeklyBackup')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .create();

  SpreadsheetApp.getUi().alert(
    '✅ Backup Triggers Installed!\n\n' +
    '📅 Daily backup  → every day at 2:00 AM\n' +
    '📅 Weekly backup → every Sunday at 3:00 AM\n\n' +
    'Backups saved to: My Drive / SCRWA_Backups / YYYY-MM /\n\n' +
    'Retention:\n' +
    '  Daily  → last 7 kept\n' +
    '  Weekly → last 4 kept\n' +
    '  Manual → last 5 kept'
  );
}

function removeBackupTriggers() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runDailyBackup' ||
        t.getHandlerFunction() === 'runWeeklyBackup') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  SpreadsheetApp.getUi().alert('Backup triggers removed (' + removed + ' deleted).');
}

// ── Show backup status ──────────────────────────────────────────────────────
function showBackupStatus() {
  try {
    var rootFolder  = DriveApp.getRootFolder();
    var iter        = rootFolder.getFoldersByName(BACKUP_FOLDER_NAME);
    if (!iter.hasNext()) {
      SpreadsheetApp.getUi().alert('No backups found yet.\nRun a manual backup first.');
      return;
    }
    var backupRoot = iter.next();
    var months     = [];
    var mIter      = backupRoot.getFolders();
    while (mIter.hasNext()) months.push(mIter.next());

    // Sort months newest first
    months.sort(function(a, b) { return b.getName().localeCompare(a.getName()); });

    var msg = '📂 SCRWA Backup Status\n';
    msg    += '═══════════════════════\n';
    var totalFiles = 0;

    months.slice(0, 3).forEach(function(mFolder) {
      var fIter = mFolder.getFiles();
      var count = 0;
      var latest = '';
      while (fIter.hasNext()) {
        var f = fIter.next();
        count++;
        totalFiles++;
        if (!latest) latest = f.getName();
      }
      msg += '\n📅 ' + mFolder.getName() + ' → ' + count + ' backup(s)\n';
      msg += '   Latest: ' + (latest || 'none') + '\n';
    });

    msg += '\n══════════════════════\n';
    msg += 'Total backups: ' + totalFiles;
    SpreadsheetApp.getUi().alert(msg);

  } catch(err) {
    SpreadsheetApp.getUi().alert('Error reading backup status:\n' + err.toString());
  }
}
