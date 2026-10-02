/*!
 * LUCID Availability – config.js
 * ------------------------------------------------------------------
 * Enige plek met instellingen. Er staan hier BEWUST GEEN geheimen:
 * deze repository en dit bestand zijn publiek.
 *
 * submitEndpoint
 *   Leeg ('')  → studenten krijgen de veilige knop "Download beschikbaarheidsbestand".
 *   Ingevuld   → er verschijnt ook "Beschikbaarheid indienen". De JSON wordt dan
 *                (na een duidelijke melding) naar dit adres gestuurd.
 *   Bedoeld voor de URL van de Google Apps Script-webapp uit backend/google-apps-script/.
 *   Zo'n URL is géén geheim: het script draait server-side onder het LUCID-account,
 *   zonder wachtwoord of API-sleutel in de website. Zie docs/EMAIL-INDIENEN.md.
 */
window.LUCID = window.LUCID || {};
window.LUCID.config = {
  /** E-mailadres van de coördinator (voor de handmatige verzendinstructie). */
  contactEmail: 'lucideducation.info@gmail.com',

  /** URL van de indien-service (Google Apps Script web app). Leeg = uitgeschakeld. */
  submitEndpoint: '',

  /** Bewaartermijn van een niet-afgerond concept op dit toestel (dagen). */
  draftMaxAgeDays: 7
};
