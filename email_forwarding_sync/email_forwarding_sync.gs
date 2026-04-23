///////////////////////////////////////////////////////////////////////////////
// Setup:
//   1) Attach this script to a Google Cloud Project so it can manage
//      Google Groups. Project Settings > Google Cloud Platform (GCP)
//      Project > Change project > paste the project number.
//   2) Enable the following via Services (formerly "Advanced Google
//      Services"):
//        * Admin Directory API
//        * Group Settings API
//      Follow the consent link when prompted.
//   3) Populate the following Script Properties under
//      Project Settings > Script Properties. None may be committed to
//      git — they identify the specific deployment.
//        * SPREADSHEET_ID      — id of the calling spreadsheet this
//                                script reads from (from the sheet URL,
//                                between /d/ and /edit)
//        * STAKE_NAME          — human-readable stake name, used in
//                                outgoing email subjects and bodies
//        * DOMAIN              — domain that owns the Google Groups
//                                (e.g. example.org)
//        * EMAIL_ADMIN_ADDRESS — address to notify when manual admin
//                                action is required
//   4) Set up a daily trigger for:
//        * public_createGroups
//        * public_syncGroups
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads a required script property. Throws a clear error if unset so
 * the root cause surfaces instead of a downstream null/empty failure.
 * Called at module load.
 */
function getScriptProperty_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (value == null || value === '') {
    throw new Error(
      'Script property "' + key + '" is not set. See the setup notes ' +
      'at the top of email_forwarding_sync.gs for the full list of ' +
      'required properties.'
    );
  }
  return value;
}

var SPREADSHEET_ID_KEY = 'SPREADSHEET_ID';
var STAKE_NAME_KEY = 'STAKE_NAME';
var DOMAIN_KEY = 'DOMAIN';
var EMAIL_ADMIN_ADDRESS_KEY = 'EMAIL_ADMIN_ADDRESS';

var SPREADSHEET_ID = getScriptProperty_(SPREADSHEET_ID_KEY);
var STAKE_NAME = getScriptProperty_(STAKE_NAME_KEY);
var DOMAIN = getScriptProperty_(DOMAIN_KEY);
var EMAIL_ADMIN_ADDRESS = getScriptProperty_(EMAIL_ADMIN_ADDRESS_KEY);
var EMAILS_SENT_SHEET = 'Emails Sent';
var MAX_EMAILS_TO_SEND = 92;
var HISTORY_SHEET = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('HISTORY');
var ERRORS_SHEET = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('ERRORS').clear().appendRow(['Date', 'Error']);
var SHEETS_TO_IGNORE = [EMAILS_SENT_SHEET, HISTORY_SHEET.getName(), ERRORS_SHEET.getName(), 'Indexers', 'Instructions', '_log', '_config', '_position_overrides'];
var ORGANIZATION_COL = 0; // Column A
var GROUP_EMAIL_COL = 1; // Column B
var POSITION_COL = 2; // Column C
var NAME_COL = 3;        // Column D — reserved; this script does not read it.
var PERSONAL_EMAILS_COL = 4; // Column E

// Required row-1 headers on every per-ward tab. Must match the schema
// calling_sheet/Snapshot.gs enforces (the two scripts share this
// spreadsheet, so a layout that's valid for one must be valid for the
// other). Comparison is case-insensitive and whitespace-tolerant.
var EXPECTED_WARD_HEADERS = ['Organization', 'Forwarding Email', 'Position', 'Name'];

function debug_logHistory() {
  logHistory('Test');
}

/**
 * NOTE: This function is automatically called everyday @ 4am.
 *
 * Creates any new groups found in the sheet without adding members.  According to
 * documentation, after creating a Google Group you should wait several minutes 
 * before adding members.
 */
function public_createGroups() {
  // Read all the defined groups
  var newGroups = extractAllGroups();
  Logger.log('Found %s defined groups.', newGroups.length);
  
  // Search for duplicates
  for (var i = 0; i < newGroups.length; ++i) {
    var cnt = 0;
    for (var j = 0; j < newGroups.length; ++j) {
      if (newGroups[i].groupId == newGroups[j].groupId) {
        ++cnt;
      }
    }
    if (cnt != 1) {
      logError('Group defined more than once: ' + newGroups[i].groupId);
    }
  }
  
  // Read all the current groups
  var currentGroups = readAllGroups(false, newGroups);
  Logger.log('Found %s existing groups.', currentGroups.length);
  var currentGroupIds = toGroupIds(currentGroups);
  
  // Create newly defined groups
  for (var i = 0; i < newGroups.length; ++i) {
    var newGroup = newGroups[i];
    if (!currentGroupIds.contains(newGroup.groupId)) {
      createGroup(newGroup);
    }
  }
}

/**
 * NOTE: This function is automatically called everyday @ 5am.
 *
 * Syncs the name, description, and members defined in the spreadsheet with the Google Group.
 */
function public_syncGroups() {
  // Read all the defined groups
  var newGroups = extractAllGroups();
  
  // Read all the current groups
  var currentGroups = readAllGroups(true, newGroups);
  
  for (var i = 0; i < newGroups.length; ++i) {
    syncGroup(newGroups[i], currentGroups);
  }
}

/**
 * Run this manually to delete any Google Groups that are no longer used (i.e. defined in the spreadsheet).
 */
function public_deleteGroups() {
  // Read all the defined groups
  var definedGroups = extractAllGroups();
  Logger.log('Found %s defined groups.', definedGroups.length);
  var definedGroupIds = toGroupIds(definedGroups);
  
  // Read all the current groups
  var currentGroups = readAllGroups(false, definedGroups);
  Logger.log('Found %s existing groups.', currentGroups.length);
  
  // Delete groups that are no longer defined
  for (var i = 0; i < currentGroups.length; ++i) {
    var currentGroup = currentGroups[i];
    if (!definedGroupIds.contains(currentGroup.groupId)) {
      deleteGroup(currentGroup.groupId);
    }
  }
}

/**
 * Send an email to all group members indicating their current status and request them to notify
 * the stake if anything has changed.
 *
 * Only MAX_EMAILS_TO_SEND will be sent per run every email sent will be recorded in the 'Emails Sent'
 * sheet, so when it is run again duplicate emails will not be resent.  This is to avoid the limit
 * that Google places on emails sent per day.  
 *
 * NOTE: When testing, populate the test email accounts in the 'restrictEmailsTo' variable.
 */
var restrictEmailsTo = [];
function public_sendUpdateRequestEmails() {
  // Read all the defined groups
  var allGroups = extractAllGroups();

  var aliasEmailCnt = 0;
  var cnt = 0;
  var emailsToGroups = {};
  for (var i = 0; i < allGroups.length; ++i) {
    var group = allGroups[i];
    for (var j = 0; j < group.members.length; ++j) {
      var email = group.members[j];
      if (email.endsWith('@' + DOMAIN)) {
        ++aliasEmailCnt;
        continue;
      }
      if (emailsToGroups[email]) {
        emailsToGroups[email].push(group);
      } else {
        ++cnt;
        emailsToGroups[email] = [group];
      }
    }
  }
  
  // Read all emails alread sent
  var emailsAlreadySent = extractEmailsSent();
  
  Logger.log('Found %s unique emails.', cnt);
  var emailsSent = 0;
  for (var email in emailsToGroups) {
    if (emailsToGroups.hasOwnProperty(email)) {
      var groups = emailsToGroups[email];
      var groupStrs = [];
      groups.forEach(function(grp) {grp.members = []; groupStrs.push(grp.toString());});
      Logger.log('%s: %s', email, groupStrs.join(','));
      if (emailsAlreadySent.contains(email)) {
        Logger.log('Email already sent to: %s', email);
        continue;
      }
      if (restrictEmailsTo.length == 0 || restrictEmailsTo.contains(email)) {
        sendUpdateRequestEmail(email, groups);
        appendToEmailsSent(email);
        ++emailsSent;
      }
    }
    if (emailsSent >= MAX_EMAILS_TO_SEND) {
      Logger.log('Sent max number of emails: %s', emailsSent);
      break;
    }
  }
  Logger.log('Sent %s emails.', emailsSent);
}

/**
 * Updates the settings of all groups.  Use this when you change the default settings.
 */
function public_updateAllGroupSettings() {
  var groups = readAllGroups(false);
  for (var i = 0; i < groups.length; ++i) {
    updateGroupSettings(groups[i].groupId);
  }
}

function debug_logAllGroupsFromSpreadsheet() {
  var groups = extractAllGroups();
  Logger.log('Extracted %s groups.', groups.length);
  Logger.log('Extracted Groups: ' + groups);
}

function debug_logAllGroups() {
  var groups = readAllGroups(true);
  Logger.log('Found %s groups.', groups.length);
  Logger.log('Existing Groups: ' + groups);
}

function debug_checkSpreadsheetForDuplicateGroups() {
  // Read all the defined groups
  var allGroups = extractAllGroups();
  
  // Set Denormalized groupId
  for (var i = 0; i < allGroups.length; ++i) {
    var group = allGroups[i];
    group.denormGroupId = group.groupId.trim().toLowerCase().replace('.', '');
  }
  
  for (var i = 0; i < allGroups.length; ++i) {
    var group = allGroups[i];
    var matches = [];
    for (var j = 0; j < allGroups.length; ++j) {
      var checkGroup = allGroups[j];
      if (i != j && group.denormGroupId === checkGroup.denormGroupId) {
        matches.push(checkGroup);
      }
    }
    if (matches.length > 0) {
      logError('Found duplicate groups for ' + group + ': ' + matches);
    }
  }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Syncs the name, description, and members for a single group to the Google Group.
 *
 * @param groupUpdate - The Group as defined in the spreadsheet.
 * @param groups - The list of all Google Groups.
 */
function syncGroup(groupUpdate, groups) {
  //Logger.log('Syncing Group: ' + groupUpdate.groupId);
  var group;
  for (var i = 0; i < groups.length; ++i) {
    if (groups[i].groupId === groupUpdate.groupId) {
      group = groups[i];
      break;
    }
  }
  
  if (group) { // UPDATE
    if (group.position != groupUpdate.position) {
      AdminDirectory.Groups.update({"name": groupUpdate.position}, groupUpdate.groupId);
      logHistory('Updated Group Name(' + groupUpdate.groupId + '): ' + groupUpdate.position);
    }
    if (group.googleDescription != groupUpdate.description()) {
      AdminDirectory.Groups.update({"description": groupUpdate.description()}, groupUpdate.groupId);
      logHistory('Updated Group Description(' + groupUpdate.groupId + '): ' + groupUpdate.description());
    }
      
    // Delete removed members
    for (var i = 0; i < group.members.length; ++i) {
      var member = group.members[i];
      if (!groupUpdate.members.contains(member)) {
        removeGroupMember(groupUpdate.groupId, member);
      }
    }
    
    // Add new members
    for (var i = 0; i < groupUpdate.members.length; ++i) {
      var member = groupUpdate.members[i];
      if (group.members.contains(member)) {
        //Logger.log('%s is already a member of %s', member, groupUpdate.groupId);
      } else {
        addGroupMember(groupUpdate, member);
      }
    }
  } else { // CREATE
    logError('Group does not exist: ' + groupUpdate.groupId);
  }
}

/**
 * Returns the emails listed in the EMAILS_SENT_SHEET sheet.  (If the sheet does not exist, it will be created.)
 */
function extractEmailsSent() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(EMAILS_SENT_SHEET);
  if (sheet == null) {
    sheet = spreadsheet.insertSheet(EMAILS_SENT_SHEET);
  }
  
  var emails = [];
  var values = sheet.getDataRange().getDisplayValues();
  for (var i = 0; i < values.length; ++i) {
    emails.push(values[i][0]);
  }
  
  return emails;
}

/**
 * Appends {@code email} to the EMAILS_SENT_SHEET sheet.
 */
function appendToEmailsSent(email) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(EMAILS_SENT_SHEET);
  var lastRow = sheet.getDataRange().getLastRow();
  var cell = sheet.getRange('A1');
  cell.offset(lastRow, 0).setValue(email);
}

/**
 * Appends {@code change} to the HISTORY_SHEET.
 */
function logHistory(change) {
  Logger.log('HISTORY: ' + change);
  HISTORY_SHEET.insertRowBefore(2);
  HISTORY_SHEET.getRange("A2:B2").setValues([[new Date().toLocaleString(), change]]);
}

/**
 * Appends {@code error} to the ERRORS_SHEET.
 */
function logError(error) {
  Logger.log('ERROR: ' + error);
  ERRORS_SHEET.appendRow([new Date(), error]);
}

/**
 * Appends {@code error} to the ERRORS_SHEET and sends an email to the Email Admin.
 */
function logAndEmailError(error) {
  logError(error);
  
  var subject = 'ACTION REQUIRED: Error Encountered Processing Email Forwarding Address Updates';
  var body =   'Stake Email Admin,<br/><br/>'
             + 'The following error was encountered while processing updates to the Email Forwarding Addresses sheet:<br/>'
             + '<b>' + error + '</b><br/><br/>'
             + 'Please check for data errors in the sheet.'
             + '<br/><br/>Thanks,<br/>Your Friendly Email Forwarding Addresses Sync Script';
  sendEmail(EMAIL_ADMIN_ADDRESS, subject, body);
}

/**
 * Returns all email aliases extracted from the spreadsheet.
 */
function extractAllGroups() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Read all the defined groups
  var sheets = spreadsheet.getSheets();
  var groups = [];
  for (var i = 0; i < sheets.length; ++i) {
    var sheet = sheets[i];
    if (!SHEETS_TO_IGNORE.contains(sheet.getName())) {
      groups = groups.concat(extractGroups(sheet));
    }
  }
  
  return groups;
}

/**
 * Returns all email aliases extracted from a single sheet.
 *
 * Aborts the whole sync if the sheet's row-1 headers don't match
 * EXPECTED_WARD_HEADERS — running against a column layout we don't
 * understand would add the wrong people to the wrong groups, which
 * is much worse than failing the cron.
 */
function extractGroups(sheet) {
  var groups = [];
  var unit = sheet.getName().trim();
  var data = sheet.getDataRange().getDisplayValues();

  var headerCheck = verifyWardTabHeaders(data[0] || []);
  if (!headerCheck.ok) {
    var msg = 'Tab "' + sheet.getName() + '" has unexpected column headers. ' +
              'Expected: [' + headerCheck.expected.join(' | ') + ']. ' +
              'Got: [' + headerCheck.got.join(' | ') + ']. ' +
              'Sync aborted — fix row 1 on this tab and re-run.';
    logAndEmailError(msg);
    throw new Error(msg);
  }

  for (var row = 1; row < data.length; ++row) {
    var org = data[row][ORGANIZATION_COL];
    var groupId = data[row][GROUP_EMAIL_COL].toLowerCase().trim();
    var position = data[row][POSITION_COL];
    var groupObj = new Group(groupId, unit, position, org);
    for (var col = PERSONAL_EMAILS_COL; col < data[row].length; ++col) {
      var email = data[row][col];
      if (email.length > 3) {
        addEmailToGroup(email, groupObj);
      }
    }

    if (groupObj.position.length > 0) {
      groups.push(groupObj);
    } else {
      logError('Ignoring group (no position): ' + groupObj.groupId);
    }
  }

  return groups;
}

/**
 * Verifies the first N cells of `headerRow` match EXPECTED_WARD_HEADERS.
 * Returns `{ok: true}` on match; `{ok: false, expected, got}` otherwise.
 * Comparison is case-insensitive and whitespace-tolerant.
 *
 * @param {Array} headerRow The raw values of row 1 (1D array).
 */
function verifyWardTabHeaders(headerRow) {
  var h = headerRow || [];
  var got = [];
  for (var i = 0; i < EXPECTED_WARD_HEADERS.length; ++i) {
    var cell = (h[i] == null) ? '' : String(h[i]);
    got.push(cell.trim());
  }
  for (var j = 0; j < EXPECTED_WARD_HEADERS.length; ++j) {
    if (got[j].toLowerCase() !== EXPECTED_WARD_HEADERS[j].toLowerCase()) {
      return { ok: false, expected: EXPECTED_WARD_HEADERS.slice(), got: got };
    }
  }
  return { ok: true };
}

/**
 * emailDetails could be a simple email address or it could contain properties.  Parse
 * all email addresses from emailDetails and add them to group.
 *
 * Example values:
 *   - user@gmail.com
 *   - user@someplace.net [GoogleAccount: user@gmail.com]
 */
function addEmailToGroup(emailDetails, group) {
  var pos = emailDetails.indexOf('[');
  if (pos != -1) {
    var email = emailDetails.substring(0, pos);
    group.addMember(email);
    if (!emailDetails.endsWith(']')) {
      logError('Invalid email string (Missing closing ]): ' + emailDetails);
      return;
    }
    var properties = emailDetails.substring(pos + 1, emailDetails.length - 1);
    if (!properties.startsWith('GoogleAccount:')) {
      logError('Invalid email string (bad properties): ' + properties);
      return;
    }
    var noEmailAccount = properties.substring('GoogleAccount:'.length);
    Logger.log('noEmailAccount: %s', noEmailAccount);
    group.addMember(noEmailAccount, true);
  } else {
    group.addMember(emailDetails);
  }
}

/**
 * Looks up a single Group from Google Groups.
 */
function lookupGroup(groupId) {
  var group = null;
  try {
    var groupData = AdminDirectory.Groups.get(groupId);
    var properties = parseDescription(groupData.description);
    group = new Group(groupData.email, properties['Unit'], groupData.name, properties['Organization']);
    group.googleDescription = groupData.description;
    populateGroupMembers(group);
  } catch(e) {
    if ((e.message.indexOf('Resource Not Found:') != -1) || e.message.indexOf('Not Authorized to access this resource') != -1) {
      //logError('Could not find group: ' + groupId);
      return null;
    }
    else {
      logError('Unexpected Error looking up ' + groupId + ': ' + e);
      throw e;
    }
  }
  
  return group;
}

/**
 * Returns all groups defined in Google Groups.
 */
function readAllGroups(populateMembers, groupsFromSheet) {
  var pageToken;
  var results = [];
  do {
    var page = AdminDirectory.Groups.list({
      domain: DOMAIN,
      pageToken: pageToken
    });
    var groups = page.groups;
    if (groups) {
      for (var i = 0; i < groups.length; i++) {
        var groupData = groups[i];
        var properties = parseDescription(groupData.description);
        var group = new Group(groupData.email, properties['Unit'], groupData.name, properties['Organization']);
        group.googleDescription = groupData.description;
        if (populateMembers) {
          populateGroupMembers(group);
        }
        results.push(group);
      }
    } else {
      Logger.log('No groups found.');
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  
  // Note: There seems to be a bug where this query does not always return all groups.  If there is a Group from
  //       the spreadsheet that we did not find in the query, we'll perform a lookup by ID to see if it exists.
  if (groupsFromSheet) {
    var foundGroupIds = toGroupIds(results);
    for (var i = 0; i < groupsFromSheet.length; i++) {
      var groupId = groupsFromSheet[i].groupId;
      if (!foundGroupIds.contains(groupId)) {
        var group = lookupGroup(groupId);
        if (group) {
          Logger.log('Existing group not found in query: %s', groupId);
          results.push(group);
        }
      }
    }
  }
  
  return results;
}

/**
 * Populates the 'members' field of a Group by looking up it's members.
 */
function populateGroupMembers(group) {
  var pageToken;
  do {
    var page = AdminDirectory.Members.list(group.groupId, {maxResults: 200, pageToken: pageToken});
    var members = page.members
    if (members) {
      for (var i = 0; i < members.length; i++) {
        var member = members[i];
        group.addMember(member.email);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
}

/**
 * Returns the properties defined in the description string.
 */
function parseDescription(desc) {
  var properties = {};
  var tokens = desc.split(',');
  for (var i = 0; i < tokens.length; ++i) {
    var pos = tokens[i].indexOf(':');
    if (pos != -1) {
      var name = tokens[i].substr(0, pos).trim();
      var value = tokens[i].substr(pos + 1).trim();
      properties[name] = value;
    }
  }
       
  return properties;     
}

function toGroupIds(groups) {
  var groupIds = [];
  for (var i = 0; i < groups.length; ++i) {
    groupIds.push(groups[i].groupId);
  }
  
  return groupIds;
}

/**
 * Creates a new Group
 */
function createGroup(group) {
  Logger.log('Creating group...%s', group.toString());
  var newGroup = AdminDirectory.Groups.insert({
    "email": group.groupId,
    "name": group.position,
    "description": group.description(),
    "adminCreated": true
  });
  Logger.log('Created Group(%s)\nfor group data: %s', newGroup, group.toString());
  logHistory('Created Group: ' + group.groupId);
  
  updateGroupSettings(group.groupId);
}

function deleteGroup(groupId) {
  Logger.log('Deleting group...%s', groupId);
  AdminDirectory.Groups.remove(groupId);
  logHistory('Removed Group: ' + groupId);
}

/**
 * Update the GroupSettings for the indicated groupId.
 */
function updateGroupSettings(groupId) {
  var groupSettings = AdminGroupsSettings.newGroups();
  groupSettings.allowExternalMembers = "true";
  groupSettings.whoCanInvite = "ALL_MANAGERS_CAN_INVITE";
  groupSettings.whoCanPostMessage = "ANYONE_CAN_POST";
  groupSettings.whoCanContactOwner = "ALL_MANAGERS_CAN_CONTACT";
  groupSettings.whoCanViewGroup = "ALL_MEMBERS_CAN_VIEW";
  groupSettings.whoCanViewMembership = "ALL_MEMBERS_CAN_VIEW";
  groupSettings.messageModerationLevel = "MODERATE_NONE";
  groupSettings.whoCanLeaveGroup = "ALL_MEMBERS_CAN_LEAVE";
  groupSettings.whoCanJoin = "ALL_IN_DOMAIN_CAN_JOIN";
  groupSettings.whoCanAdd = "ALL_MANAGERS_CAN_ADD";
  groupSettings.whoCanLeaveGroup = "NONE_CAN_LEAVE";
  groupSettings.allowWebPosting = "false";
  groupSettings.allowGoogleCommunication = "false";
  groupSettings.isArchived = "false";
  AdminGroupsSettings.Groups.patch(groupSettings, groupId);
  
  Logger.log('Updated group (%s) settings.', groupId);
}

/**
 * Adds a user to an existing group in the domain.
 */
function addGroupMember(group, userEmail) {
  var groupEmail = group.groupId;
  var member = {
    email: userEmail,
    role: 'MEMBER'
  };
  
  try {
    var noEmailMember = group.isNoEmailMember(userEmail);
    member = AdminDirectory.Members.insert(member, groupEmail);
    logHistory(userEmail + ' added as a ' + (noEmailMember ? 'NO EMAIL ' : '') + 'member of ' + groupEmail);
    
    // Unfortunately, the Google scripting API does not allow us to change the Email delivery setting of
    // a group member to "No email".  We'll send an email to the Stake Email Admin and ask them to do it.
    if (noEmailMember) {
      var pos = groupEmail.indexOf('@');
      var groupName = groupEmail.substring(0, pos);
      var domain = groupEmail.substring(pos + 1);
      var groupsUrl = 'https://groups.google.com/a/' + domain + '/forum/#!managemembers/' + groupName + '/members/active';
      var subject = 'ACTION REQUIRED: Need to make ' + userEmail + ' a NO EMAIL group member';
      var body =   'Stake Email Admin,<br/><br/>'
                 + userEmail + ' was added to ' + groupEmail + ' as a GoogleAccount property, which means it'
                 + ' should not receive any emails.  Please do the following:<br/><ol>'
                 + '<li>Login as admin@' + DOMAIN
                 + '<li>Goto <a href="' + groupsUrl + '">' + groupsUrl + '</a></li>'
                 + '<li>Change the "Email delivery" setting for ' + userEmail + ' to "No email"'
                 + "</ol><br/>Thank you for your help,<br/>Stake Clerk";
      sendEmail(EMAIL_ADMIN_ADDRESS, subject, body);
      logHistory('Sent an email to ' + EMAIL_ADMIN_ADDRESS + ' to ask them to fix the Email delivery preferences for ' + userEmail);
    }
  } catch(e) {
    if (e.message.indexOf('Member already exists.') != -1) {
      logError(userEmail + ' is already a member of ' + groupEmail + "; not adding.  (Note: This typically means there's something special going on with this Google account)");
    }
    else if (e.message.indexOf('Resource Not Found:') != -1) {
      logAndEmailError(userEmail + ' account appears to have been deleted. Not adding to ' + groupEmail + '. (Ignoring error)');
    }
    else {
      logAndEmailError('Error adding ' + userEmail + ' to ' + groupEmail + ': ' + e);
    }
  }
}
  
/**
 * Removes a user from a group in the domain.
 */
function removeGroupMember(groupEmail, userEmail) {
  try {
    AdminDirectory.Members.remove(groupEmail, userEmail);
    // logError(userEmail + ' is causing an error')
    logHistory(userEmail + ' removed as a member of ' + groupEmail);
  } catch(e) {
    if (e.message.indexOf('Resource Not Found:') != -1) {
      logAndEmailError(userEmail + ' account appears to have been deleted. Not removing ' + groupEmail + '. (Ignoring error)');
    }
    else {
      logAndEmailError('Error removing ' + userEmail + ' from ' + groupEmail + ': ' + e);
    }
  }
}

function sendUpdateRequestEmail(to, groups) {
  var subject = STAKE_NAME + ' Stake Email Alias Registration';
  var msg =   to + ",<br/><br/>The " + STAKE_NAME + " Stake has created email aliases to make it easier to send emails to members that are in leadership positions.  "
            + "Your email address is registered with the following email aliases:<br/><ul>";
  for (var i = 0; i < groups.length; ++i) {
    var group = groups[i];
    msg += "<li>" + group.groupId + "(Unit: " + group.unit + ", Calling: " + group.position + ")</li>";
  }
  msg += "</ul>Please note, these email aliases are not connected to LDS Tools, so if your calling has changed this information may be out of date.  "
         + "If this information is not correct, please respond to this email, so we can get it corrected.<br/><br/>"
         + "Thank you for your help,<br/>Stake Clerk";

  sendEmail(to, subject, msg);
}

/**
 * Send the indicated email.
 */
function sendEmail(to, subject, message) {
  var plainText = message.replace('<br/>', '\n').replace('<br>', '\n')
                         .replace('<b>', '').replace('</b>', '')
                         .replace('<font color="blue">', '').replace('</font>', '')
                         .replace('<ul>', '').replace('</ul>', '')
                         .replace('<ol>', '').replace('</ol>', '')
                         .replace('<li>', '* ').replace('</li>', '')
  var options = {
    name: STAKE_NAME + ' Stake Email Admin',
    htmlBody: message,
    replyTo: EMAIL_ADMIN_ADDRESS
  };
 
  GmailApp.sendEmail(to, subject, plainText, options);
  Logger.log('Email Sent to %s.', to);
}


///////////////////////////////
// Define Group class
///////////////////////////////

function Group(groupId, unit, position, org) {
  this.groupId = groupId;
  this.unit = unit;
  this.position = position;
  this.org = org;
  this.members = [];
  this.noEmailMembers = [];
}

Group.prototype.addMember = function(email, noEmail) {
  email = email.toLowerCase().trim();
  this.members.push(email);
  if (noEmail) {
    this.noEmailMembers.push(email);
  }
}

Group.prototype.isNoEmailMember = function(email) {
  return this.noEmailMembers.contains(email);
}

Group.prototype.toString = function() {
  return '\ngroupId: ' + this.groupId + ', unit: ' + this.unit + ', position: ' + this.position + ', org: ' + this.org + ', members: [' + this.members + ']';
}

Group.prototype.description = function() {
  return 'Unit: ' + this.unit + ', Organization: ' + this.org;
}


///////////////////////////////
// Extend String and Array
///////////////////////////////

String.prototype.trim = function () {
  return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
};

String.prototype.startsWith = function(prefix) {
    return this.substring(0, prefix.length) === prefix;
}

String.prototype.endsWith = function(suffix) {
    return this.match(suffix+"$") == suffix;
};

Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
}

