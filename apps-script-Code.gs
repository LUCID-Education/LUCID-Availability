/**
 * LUCID Availability – indien-service (Google Apps Script web app)
 * ====================================================================
 * Ontvangt een beschikbaarheidsbestand van de studentenpagina en
 *   1. stuurt het als JSON-bijlage naar de coördinator (via het eigen Gmail-account);
 *   2. bewaart een kopie in een Google Drive-map (optioneel).
 *
 * WAAROM DIT VEILIG IS
 *   - Dit script draait op de servers van Google onder het account
 *     lucideducation.info@gmail.com. Er is GEEN wachtwoord, API-sleutel of token
 *     nodig in de website of in GitHub.
 *   - Instellingen (ontvanger, Drive-map) staan in de "Script properties" van dit
 *     project, niet in de publieke repository.
 *   - Elke aanvraag wordt streng gecontroleerd (grootte, structuur, namen, tijden).
 *   - Eenvoudige rate limit tegen misbruik/spam.
 *
 * INSTALLATIE: zie docs/EMAIL-INDIENEN.md (stap voor stap).
 */

var MAX_BODY_BYTES = 300 * 1024;          // ruim voldoende voor 62 dagen
var MAX_PER_10_MIN = 40;                  // globale limiet tegen misbruik
var ALLOWED_STATUSES = ['unavailable', 'physical', 'online'];
var TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') return reply_(false, 'Lege aanvraag.');
    if (e.postData.contents.length > MAX_BODY_BYTES) return reply_(false, 'Aanvraag te groot.');
    if (!rateLimitOk_()) return reply_(false, 'Te veel aanvragen. Probeer het later opnieuw.');

    var payload = JSON.parse(e.postData.contents);
    if (!payload || payload.type !== 'lucid-availability-submission') return reply_(false, 'Onbekend type.');
    var doc = payload.document;
    var problem = validate_(doc);
    if (problem) return reply_(false, problem);

    var fullName = clean_(doc.participant.firstName) + ' ' + clean_(doc.participant.lastName);
    var filename = 'LUCID_Availability_' + safe_(doc.participant.firstName) + '_' + safe_(doc.participant.lastName) +
      '_' + doc.period.start + '_' + doc.period.end + '.json';
    var json = JSON.stringify(doc, null, 2);
    var blob = Utilities.newBlob(json, 'application/json', filename);

    var props = PropertiesService.getScriptProperties();
    var recipient = props.getProperty('RECIPIENT') || Session.getEffectiveUser().getEmail();
    var folderId = props.getProperty('DRIVE_FOLDER_ID');

    if (folderId) DriveApp.getFolderById(folderId).createFile(blob.copyBlob());

    var s = doc.summary || {};
    MailApp.sendEmail({
      to: recipient,
      subject: '[LUCID Availability] ' + fullName + ' (' + doc.period.start + ' – ' + doc.period.end + ')',
      body: 'Nieuwe beschikbaarheid ontvangen via LUCID Availability.\n\n' +
        'Naam: ' + fullName + '\n' +
        'Periode: ' + doc.period.start + ' t/m ' + doc.period.end + '\n' +
        'Ingediend op: ' + String(doc.submittedAt).slice(0, 40) + '\n' +
        'Fysiek: ' + Math.round((Number(s.physicalMinutes) || 0) / 6) / 10 + ' uur, online: ' + Math.round((Number(s.onlineMinutes) || 0) / 6) / 10 + ' uur\n\n' +
        'Het JSON-bestand zit in de bijlage. Sleep het in de coördinatorpagina.\n',
      attachments: [blob],
      name: 'LUCID Availability'
    });
    return reply_(true);
  } catch (err) {
    console.error(err);
    return reply_(false, 'Serverfout.');
  }
}

function doGet() {
  return reply_(true, 'LUCID Availability indien-service is actief.');
}

/* ---------------- hulpfuncties ---------------- */

function reply_(ok, message) {
  var out = { ok: ok };
  if (message) out[ok ? 'message' : 'error'] = message;
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function rateLimitOk_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var cache = CacheService.getScriptCache();
    var n = Number(cache.get('count') || 0) + 1;
    cache.put('count', String(n), 600);
    return n <= MAX_PER_10_MIN;
  } finally { lock.releaseLock(); }
}

function clean_(s) {
  return String(s || '').replace(/[\u0000-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}
function safe_(s) {
  return clean_(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Onbekend';
}

function validate_(doc) {
  if (!doc || doc.schema !== 'lucid-availability' || doc.version !== 1) return 'Ongeldig schema.';
  if (doc.timezone !== 'Europe/Brussels' || doc.slotMinutes !== 15) return 'Ongeldige tijdzone of blokgrootte.';
  if (!doc.participant || !clean_(doc.participant.firstName) || !clean_(doc.participant.lastName)) return 'Naam ontbreekt.';
  if (!doc.period || !DATE_RE.test(doc.period.start) || !DATE_RE.test(doc.period.end) || doc.period.end < doc.period.start) return 'Ongeldige periode.';
  var days = (new Date(doc.period.end + 'T00:00:00Z') - new Date(doc.period.start + 'T00:00:00Z')) / 86400000 + 1;
  if (!(days >= 1 && days <= 62)) return 'Periode te lang.';
  if (!doc.days || typeof doc.days !== 'object') return 'Beschikbaarheid ontbreekt.';
  var keys = Object.keys(doc.days);
  if (keys.length > 62) return 'Te veel dagen.';
  for (var i = 0; i < keys.length; i++) {
    if (!DATE_RE.test(keys[i])) return 'Ongeldige datum.';
    var list = doc.days[keys[i]];
    if (!Array.isArray(list) || list.length > 96) return 'Ongeldige dag.';
    for (var j = 0; j < list.length; j++) {
      var it = list[j];
      if (!it || !TIME_RE.test(it.start) || !(TIME_RE.test(it.end) || it.end === '24:00')) return 'Ongeldige tijd.';
      if (ALLOWED_STATUSES.indexOf(it.status) < 0) return 'Ongeldige status.';
      if (it.end !== '24:00' && it.end <= it.start) return 'Eindtijd vóór begintijd.';
    }
  }
  return null;
}
