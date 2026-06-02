/**
 * Swiss High German (de-CH) string builders — formal Sie, ss not ß.
 */

export function noEszet(s) {
  return s.replace(/ß/g, "ss");
}

/** Full curated translations keyed like en/sk. */
export function buildDeCatalog(en, sk) {
  const de = {};

  for (const key of Object.keys(en)) {
    de[key] = translateEntry(key, en[key], sk[key]);
  }
  return de;
}

function translateEntry(key, en, sk) {
  const handlers = [
    translateExact,
    translateNav,
    translateSidebar,
    translateLogin,
    translateDashboard,
    translateSettings,
    translateTenant,
    translateEstimates,
    translateSubscription,
    translateCommon,
    translateQuotes,
    translateProjects,
    translateProjectsNew,
    translateWorkTypes,
    translateDraft,
    translateMembers,
    translateBilling,
    translateHelp,
    translateOnboarding,
  ];
  for (const fn of handlers) {
    const v = fn(key, en, sk);
    if (v != null) return noEszet(v);
  }
  return noEszet(autoFromEn(en));
}

function translateExact(key, en, sk) {
  const map = {
    "common.loading": "Wird geladen…",
    "common.refresh": "Aktualisieren",
    "common.optional": "optional",
    "common.cancel": "Abbrechen",
    "common.save": "Speichern",
    "common.edit": "Bearbeiten",
    "common.delete": "Löschen",
    "login.loading": "Anmeldung läuft…",
    "projects.new.aiPromptPlaceholder":
      "z. B. Kunde möchte ein Bad renovieren — Fliesen, Bodenbelag und Sanitär ersetzen…",
    "projects.new.method.ai": "Mit AI",
    "projects.new.preview.methodAi": "Mit AI",
    "projects.new.step.method": "Erstellungsmethode",
    "projects.new.preview.method": "Erstellungsmethode",
    "projects.new.submit": "Auftragskonzept erstellen",
    "projects.new.preview.title": "Konzeptvorschau",
    "projects.new.preview.statusValue": "Anfrage",
    "projects.new.preview.nextStepValue": "Angebot oder Planung",
    "projects.new.submitAi": "Entwurf mit AI erstellen",
    "projects.new.submitCopy": "Kopie als neuen Konzept erstellen",
    "sidebar.item.team.attendance": "Zeiterfassung",
    "onboarding.feature.attendance": "Zeiterfassung",
    "dashboard.quick.reportIssue": "Problem melden",
    "dashboard.workspace.personal": "Persönlicher Arbeitsbereich",
    "dashboard.workspace.team": "Team-Arbeitsbereich",
    "dashboard.hero.badge.companyWorkspace": "Firmenarbeitsbereich",
    "dashboard.hero.badge.personalWorkspace": "Persönlicher Arbeitsbereich",
    "settings.subdomain.teamOnly":
      "Wechseln Sie zum Firmenarbeitsbereich, um eine Firmen-Subdomain zu konfigurieren.",
    "onboarding.step.done.subtitle": "Ihr Profil und Arbeitsbereich sind bereit.",
    "onboarding.step.personal.subtitle":
      "Wir verwenden Ihren persönlichen Arbeitsbereich — es wird keine Firma angelegt.",
    "companyContext.ariaLabel": "Aktive Firma",
    "companyContext.tagline": "Firmenverwaltung",
    "companyContext.settings": "Firmeneinstellungen",
    "settings.language.title": "Sprache",
    "settings.language.description": "Wählen Sie die Anzeigesprache der Oberfläche.",
    "settings.language.label": "Anzeigesprache",
    "app.brand": "Staveto",
    "header.openMenu": "Menü öffnen",
    "header.closeMenu": "Menü schliessen",
    "header.switchWorkspace": "Arbeitsbereich wechseln",
    "header.userMenu": "Benutzermenü",
    "header.profile": "Profil",
    "workspace.personalShort": "Persönlich",
    "join.loading": "Wird geladen…",
    "join.processing": "Arbeitsbereich wird beigetreten…",
    "join.error": "Ungültiger oder abgelaufener Einladungslink.",
    "join.goToApp": "Zur App",
    "i18n.aria.loading": "Wird geladen",
    "projects.new.stepper.aria": "Ablauf Auftragserstellung",
    "onboarding.progress": "Schritt {{current}} von {{total}}",
  };
  return map[key] ?? null;
}

function translateNav(key, en, sk) {
  const m = {
    "nav.dashboard": "Übersicht",
    "nav.overview": "Übersicht",
    "nav.quotes": "Angebote",
    "nav.projects": "Aufträge",
    "nav.projectsPersonal": "Meine Aufträge",
    "nav.members": "Mitglieder",
    "nav.billing": "Abrechnung",
    "nav.settings": "Einstellungen",
    "nav.help": "Hilfe",
    "nav.estimates": "Kalkulationen",
    "nav.subscription": "Abonnement",
    "nav.account": "Konto",
    "nav.logout": "Abmelden",
  };
  return m[key] ?? null;
}

function translateSidebar(key, en, sk) {
  if (!key.startsWith("sidebar.")) return null;
  const m = {
    "sidebar.work": "Arbeit",
    "sidebar.team": "Team",
    "sidebar.system": "System",
    "sidebar.ariaLabel": "Hauptnavigation",
    "sidebar.comingSoon": "Demnächst",
    "sidebar.expand": "Seitenleiste erweitern",
    "sidebar.collapse": "Seitenleiste einklappen",
    "sidebar.mobile.openSection": "Hauptseite öffnen",
    "sidebar.section.overview": "Firmenübersicht",
    "sidebar.section.jobs": "Aufträge",
    "sidebar.section.team": "Team",
    "sidebar.section.finance": "Finanzen",
    "sidebar.section.documents": "Dokumente",
    "sidebar.section.more": "Mehr",
    "sidebar.item.overview.dashboard": "Übersicht",
    "sidebar.item.overview.activity": "Aktivität",
    "sidebar.item.overview.reports": "Berichte",
    "sidebar.item.jobs.all": "Alle Aufträge",
    "sidebar.item.jobs.concepts": "Auftragskonzepte",
    "sidebar.item.jobs.active": "Aktive Aufträge",
    "sidebar.item.jobs.new": "Neuer Auftrag",
    "sidebar.item.jobs.tasks": "Aufgaben",
    "sidebar.item.jobs.issues": "Meldungen",
    "sidebar.item.jobs.planning": "Planung",
    "sidebar.item.team.members": "Teammitglieder",
    "sidebar.item.team.leave": "Ferien / Krankheit",
    "sidebar.item.team.roles": "Rollen & Berechtigungen",
    "sidebar.item.finance.quotes": "Angebote",
    "sidebar.item.finance.invoices": "Rechnungen",
    "sidebar.item.finance.expenses": "Ausgaben",
    "sidebar.item.finance.exports": "Exporte",
    "sidebar.item.documents.all": "Alle Dokumente",
    "sidebar.item.documents.photos": "Baustellenfotos",
    "sidebar.item.documents.contracts": "Verträge",
    "sidebar.item.documents.upload": "Hochladen",
    "sidebar.item.more.customers": "Kunden",
    "sidebar.item.more.settings": "Firmeneinstellungen",
    "sidebar.item.more.billing": "Abonnement & Abrechnung",
    "sidebar.item.more.subscription": "Abonnement",
    "sidebar.item.more.help": "Hilfe",
    "sidebar.item.more.language": "Sprache",
  };
  return m[key] ?? null;
}

function translateLogin(key, en, sk) {
  const m = {
    "login.title": "Anmeldung",
    "login.google": "Mit Google anmelden",
    "login.error": "Anmeldung fehlgeschlagen",
  };
  return m[key] ?? null;
}

function translateDashboard(key, en, sk) {
  if (!key.startsWith("dashboard.")) return null;
  const m = {
    "dashboard.title": "Firmenübersicht",
    "dashboard.titlePersonal": "Persönliche Übersicht",
    "dashboard.welcome": "Willkommen bei Staveto Office",
    "dashboard.subtitle": "Schneller Überblick über Aufträge, Team und Finanzen.",
    "dashboard.estimates": "Kalkulationen",
    "dashboard.newEstimate": "Neue Kalkulation",
    "dashboard.createManage": "Angebote erstellen und verwalten",
    "dashboard.quickActions": "Schnellaktionen",
    "dashboard.stats": "Übersicht",
    "dashboard.today": "Heute",
    "dashboard.recentActivity": "Letzte Aktivität",
    "dashboard.comingSoon": "Demnächst",
    "dashboard.stat.activeProjects": "Aktive Projekte",
    "dashboard.stat.quotes": "Angebote",
    "dashboard.stat.openTasks": "Offene Aufgaben",
    "dashboard.stat.expensesMonth": "Ausgaben diesen Monat",
    "dashboard.stat.missingAttendance": "Fehlende Zeiterfassung",
    "dashboard.stat.siteIssues": "Meldungen auf der Baustelle",
    "dashboard.quick.newQuote": "Neues Angebot",
    "dashboard.quick.newProject": "Neuer Auftrag",
    "dashboard.quick.calendar": "Kalender öffnen",
    "dashboard.quick.addExpense": "Ausgabe erfassen",
    "dashboard.quick.uploadDoc": "Dokument hochladen",
    "dashboard.quick.inviteMember": "Teammitglied einladen",
    "dashboard.today.plannedWork": "Geplante Arbeiten",
    "dashboard.today.tasksToday": "Aufgaben für heute",
    "dashboard.today.openIssues": "Offene Meldungen",
    "dashboard.today.quotesPending": "Angebote mit ausstehender Rückmeldung",
    "dashboard.empty.noData": "Noch keine Daten verfügbar.",
    "dashboard.empty.calendarHint": "Verfügbar, sobald das Kalendermodul aktiviert ist.",
    "dashboard.empty.noActivity": "Hier ist noch keine Aktivität.",
    "dashboard.manager.title": "Staveto Manager",
    "dashboard.manager.description":
      "Web-App zur Verwaltung von Aufträgen, Team, Planung, Angeboten und Dokumenten.",
    "dashboard.manager.openProjects": "Aufträge öffnen",
    "dashboard.greeting": "Guten Morgen, {{name}}",
    "dashboard.todayBrief": "Hier ist die heutige Firmenübersicht.",
    "dashboard.primaryNewJob": "Neuer Auftrag",
    "dashboard.secondaryNewQuote": "Neues Angebot",
    "dashboard.metric.activeJobs": "Aktive Aufträge",
    "dashboard.metric.issues": "Meldungen",
    "dashboard.metric.draftJobs": "Auftragskonzepte",
    "dashboard.metric.quotesAction": "Angebote mit Handlungsbedarf",
    "dashboard.metric.team": "Team",
    "dashboard.attention.title": "Erfordert Aufmerksamkeit",
    "dashboard.attention.empty": "Sie haben noch keine Hinweise.",
    "dashboard.activeJobs.title": "Aktive Aufträge",
    "dashboard.activeJobs.viewAll": "Alle Aufträge anzeigen",
    "dashboard.activeJobs.empty": "Noch keine Aufträge.",
    "dashboard.activeJobs.createFirst": "Ersten Auftrag erstellen",
    "dashboard.today.section": "Heutiger Betrieb",
    "dashboard.today.planning": "Heutige Planung",
    "dashboard.today.assignees": "Zugewiesene Mitarbeitende",
    "dashboard.today.issues": "Offene Meldungen",
    "dashboard.today.deadlines": "Anstehende Termine",
    "dashboard.today.planningEmpty": "Verfügbar, sobald die Planung aktiviert ist.",
    "dashboard.nextStep.noJobs": "Starten Sie mit Ihrem ersten Auftrag.",
    "dashboard.nextStep.hasJobs": "Planung ergänzen oder Angebot für Ihre Aufträge erstellen.",
    "dashboard.nextStep.cta.createJob": "Neuer Auftrag",
    "dashboard.nextStep.cta.newQuote": "Neues Angebot",
    "dashboard.hero.greeting.morning": "Guten Morgen, {{name}}",
    "dashboard.hero.greeting.day": "Guten Tag, {{name}}",
    "dashboard.hero.greeting.evening": "Guten Abend, {{name}}",
    "dashboard.hero.manageCompany": "Sie verwalten {{company}}",
    "dashboard.hero.companyTagline":
      "Heute haben Sie einen klaren Überblick über Aufträge, Team und Finanzen.",
    "dashboard.hero.personalSubtitle": "Dies ist Ihr persönlicher Arbeitsbereich.",
    "dashboard.hero.badge.business": "Geschäftlich",
    "dashboard.hero.badge.activeCompany": "Aktive Firma",
    "dashboard.hero.badge.trial": "Testphase",
    "dashboard.hero.badge.solo": "Einzelunternehmen",
    "dashboard.hero.badge.free": "Kostenlos",
    "dashboard.hero.fact.activeJobs": "{{count}} aktive Aufträge",
    "dashboard.hero.fact.teamCount": "{{count}} Teammitglieder",
    "dashboard.hero.fact.quotes": "{{count}} Angebote",
    "dashboard.hero.editCompanyProfile": "Firmenprofil bearbeiten",
    "dashboard.hero.createCompany": "Firma erstellen",
    "dashboard.hero.companyFallback": "Ihre Firma",
    "dashboard.hero.statusBadges": "Status Arbeitsbereich",
    "dashboard.draftJobs.title": "Auftragskonzepte & Anfragen",
    "dashboard.draftJobs.viewAll": "Alle Konzepte anzeigen",
    "dashboard.draftJobs.empty": "Noch keine Auftragskonzepte.",
    "dashboard.draftJobs.createFirst": "Auftragskonzept erstellen",
    "dashboard.quotesAction.title": "Angebote mit Handlungsbedarf",
    "dashboard.quotesAction.viewAll": "Alle Angebote anzeigen",
    "dashboard.quotesAction.empty": "Keine Angebote mit ausstehender Aktion.",
    "dashboard.team.title": "Team",
    "dashboard.team.viewMembers": "Teammitglieder",
    "dashboard.team.soloHint": "Laden Sie Kolleginnen und Kollegen ein, um Aufträge und Planung zu teilen.",
    "dashboard.today.companyTitle": "Heute in Ihrer Firma",
    "dashboard.today.companyBrief": "Kurzer Überblick über Aufträge, Anfragen, Angebote und Team.",
    "dashboard.today.activeJobs": "Aktive Aufträge",
    "dashboard.today.activeJobsCount": "{{count}} aktive Aufträge in Ausführung",
    "dashboard.today.draftRequests": "Anfragen & Konzepte",
    "dashboard.today.draftRequestsCount": "{{count}} Konzepte in der Verkaufsphase",
    "dashboard.today.quotesAction": "Angebote",
    "dashboard.today.quotesActionCount": "{{count}} Angebote erfordern Ihre Aufmerksamkeit",
    "dashboard.today.team": "Team",
    "dashboard.today.teamCount": "{{count}} aktive Teammitglieder",
    "dashboard.attention.emptyCompany":
      "Derzeit nichts Dringendes. Prüfen Sie aktive Aufträge und Angebote unten.",
    "dashboard.attention.waitingCustomer": "Kundenanfragen warten",
    "dashboard.attention.draftJobs": "Auftragskonzepte zu bearbeiten",
    "dashboard.attention.quotesAction": "Angebote mit Handlungsbedarf",
    "dashboard.attention.activeJobs": "Aktive Aufträge in Arbeit",
    "dashboard.attention.delayedJobs": "Pausierte Aufträge",
    "dashboard.nextStep.draftJobs":
      "Prüfen Sie Auftragskonzepte und aktivieren Sie die besten als Aufträge.",
    "dashboard.nextStep.waitingCustomer": "Einige Kundenanfragen erwarten Ihre Rückmeldung.",
    "dashboard.nextStep.quotesAction":
      "Schliessen Sie Angebote ab oder senden Sie ausstehende Angebote.",
    "dashboard.nextStep.hasJobsCompany":
      "Halten Sie die Ausführung auf Kurs — planen Sie Arbeiten oder aktualisieren Sie ein Angebot.",
    "dashboard.nextStep.cta.reviewConcepts": "Auftragskonzepte öffnen",
    "dashboard.nextStep.cta.reviewRequests": "Anfragen prüfen",
    "dashboard.nextStep.cta.reviewQuotes": "Angebote öffnen",
    "dashboard.nextStep.delayedJobs": "Einige aktive Aufträge sind pausiert und brauchen evtl. Ihre Aufmerksamkeit.",
    "dashboard.nextStep.cta.reviewDelayed": "Pausierte Aufträge prüfen",
    "dashboard.delayedJobs.title": "Pausierte Aufträge",
    "dashboard.delayedJobs.viewAll": "Aktive Aufträge anzeigen",
    "dashboard.delayedJobs.empty": "Keine pausierten Aufträge.",
    "dashboard.delayedJobs.none": "Derzeit keine pausierten Aufträge.",
    "dashboard.results.title": "Firmenergebnisse",
    "dashboard.results.comingSoon":
      "Umsatz- und Margenübersicht erscheint hier nach Aktivierung der Finanzmodule.",
  };
  return m[key] ?? null;
}

function translateSettings(key, en, sk) {
  if (!key.startsWith("settings.")) return null;
  const m = {
    "settings.registeredCompany.title": "Sie haben eine registrierte Firma",
    "settings.registeredCompany.body":
      "{{company}} ist in Staveto bereit. Wechseln Sie zur Verwaltung von Aufträgen, Team und Angeboten unter Ihrer Firma.",
    "settings.registeredCompany.switch": "Zur Firma wechseln",
    "settings.registeredCompany.openOverview": "Firmenübersicht öffnen",
    "settings.generalHint": "Konto- und Arbeitsbereich-Einstellungen.",
    "settings.subdomain.title": "Firmen-Subdomain",
    "settings.subdomain.description":
      "Reservieren Sie eine Subdomain für Ihren Firmenarbeitsbereich. DNS richten Sie separat ein.",
    "settings.subdomain.slugLabel": "Subdomain (Slug)",
    "settings.subdomain.preview": "Vorschau",
    "settings.subdomain.dnsNote":
      "Speichern legt nur den Slug in Staveto ab. Wildcard-DNS und Hosting konfigurieren Sie separat (siehe docs/staveto-subdomains.md).",
    "settings.subdomain.save": "Subdomain speichern",
    "settings.subdomain.saved": "Subdomain gespeichert.",
    "settings.subdomain.saveError": "Subdomain konnte nicht gespeichert werden.",
    "settings.subdomain.loadError": "Organisation konnte nicht geladen werden.",
    "settings.subdomain.adminOnly": "Nur Arbeitsbereich-Administratoren können die Subdomain ändern.",
    "settings.subdomain.current": "Aktuelle URL",
    "settings.subdomain.taken": "Diese Subdomain ist bereits vergeben.",
    "settings.subdomain.available": "Diese Subdomain ist verfügbar.",
  };
  return m[key] ?? null;
}

function translateTenant(key, en, sk) {
  const m = {
    "tenant.notFoundTitle": "Arbeitsbereich nicht gefunden",
    "tenant.notFoundBody": "Für die Subdomain «{{slug}}» existiert kein Firmenarbeitsbereich.",
    "tenant.accessDeniedTitle": "Zugriff verweigert",
    "tenant.accessDeniedBody":
      "Sie sind kein Mitglied von {{name}} ({{slug}}). Bitten Sie Ihre Administration um eine Einladung.",
    "tenant.goToApp": "Zu app.staveto.com",
    "tenant.joinInvite": "Einladung annehmen",
  };
  return m[key] ?? null;
}

function translateEstimates(key, en, sk) {
  if (!key.startsWith("estimates.")) return null;
  const m = {
    "estimates.title": "Kalkulationen",
    "estimates.new": "Neue Kalkulation",
    "estimates.subtitle": "Erstellen und verwalten Sie Ihre Angebote und Kalkulationen.",
    "estimates.noEstimates": "Noch keine Kalkulationen",
    "estimates.createFirst": "Erstellen Sie Ihre erste Kalkulation.",
    "estimates.view": "Anzeigen",
    "estimates.titleCol": "Titel",
    "estimates.clientCol": "Kunde",
    "estimates.statusCol": "Status",
    "estimates.totalCol": "Total",
    "estimates.loadError": "Kalkulationen konnten nicht geladen werden",
  };
  return m[key] ?? null;
}

function translateSubscription(key, en, sk) {
  if (!key.startsWith("subscription.") && !key.startsWith("paywall.")) return null;
  const m = {
    "subscription.title": "Abonnement",
    "subscription.planSingle": "Staveto Pro",
    "subscription.planSingleDescription": "14 Tage kostenlos testen, danach CHF 14.99/Monat",
    "subscription.statusTrial": "Testphase aktiv",
    "subscription.statusActive": "Bezahlt aktiv",
    "subscription.statusExpired": "Abgelaufen",
    "subscription.trialRemainingDays": "Noch {{count}} Tage",
    "subscription.trialExpired": "Testphase abgelaufen. Bitte abonnieren.",
    "subscription.proActive": "Pro aktiv",
    "subscription.renewsAt": "Verlängert am {{date}}",
    "subscription.firstLoginTrialTitle": "Willkommen bei Staveto",
    "subscription.firstLoginTrialMessage":
      "Staveto ist eine kostenpflichtige Anwendung. Die ersten 14 Tage nutzen Sie gratis.",
    "subscription.activatePro": "Pro aktivieren",
    "subscription.contactSupport": "Support kontaktieren zum Abonnieren",
    "subscription.webNote": "Im Web abonnieren Sie über die Mobile App oder kontaktieren den Support.",
    "paywall.benefit1": "Unbegrenzte Projekte",
    "paywall.benefit2": "Unbegrenzte Aufgaben pro Projekt",
    "paywall.benefit3": "Unbegrenzte Ausgaben",
    "paywall.benefit4": "Rechnungs-OCR & Export",
  };
  return m[key] ?? null;
}

function translateCommon(key, en, sk) {
  return translateExact(key, en, sk);
}

function translateQuotes(key, en, sk) {
  if (!key.startsWith("quotes.")) return null;
  const m = {
    "quotes.title": "Angebote",
    "quotes.subtitle":
      "Offizielle Angebotsentwürfe in Firestore — verknüpft mit Aufträgen, wenn aus einem Konzept erstellt.",
    "quotes.new": "Neues Angebot",
    "quotes.newSubtitle": "Eigenständiges Angebot erstellen (nicht mit einem Auftrag verknüpft).",
    "quotes.empty": "Noch keine Angebote",
    "quotes.emptyHint":
      "Erfassen Sie Positionen im Auftragskonzept, dann erstellen Sie ein Angebot — oder legen Sie hier ein neues Angebot an.",
    "quotes.goProjects": "Zu den Aufträgen",
    "quotes.colTitle": "Titel",
    "quotes.colClient": "Kunde",
    "quotes.colProject": "Auftrag",
    "quotes.colStatus": "Status",
    "quotes.colTotal": "Total",
    "quotes.view": "Öffnen",
    "quotes.loadError": "Angebote konnten nicht geladen werden",
    "quotes.saveError": "Angebot konnte nicht gespeichert werden",
    "quotes.createError": "Angebot konnte nicht erstellt werden",
    "quotes.deleteError": "Angebot konnte nicht gelöscht werden",
    "quotes.notFound": "Angebot nicht gefunden",
    "quotes.backToList": "Zurück zu Angeboten",
    "quotes.detailTitle": "Angebot",
    "quotes.linkedProject": "Verknüpfter Entwurf / Auftrag",
    "quotes.sectionDetails": "Angebotsdetails",
    "quotes.sectionLines": "Positionen",
    "quotes.sectionLinesHint":
      "Material und Arbeit aus dem Auftragskonzept werden beim Erstellen aus einem Entwurf übernommen.",
    "quotes.fieldTitle": "Angebotstitel",
    "quotes.validation.title": "Titel ist erforderlich",
    "quotes.validation.client": "Kundenname ist erforderlich",
    "quotes.validation.items": "Fügen Sie mindestens eine Position hinzu",
    "quotes.status.draft": "Entwurf",
    "quotes.status.sent": "Gesendet",
    "quotes.status.accepted": "Angenommen",
    "quotes.status.rejected": "Abgelehnt",
    "quotes.markSent": "Als gesendet markieren",
    "quotes.markAccepted": "Als angenommen markieren",
    "quotes.markRejected": "Als abgelehnt markieren",
    "quotes.createFromProject": "Firestore-Angebot erstellen",
    "quotes.legacyNote": "Ältere In-Memory-Kalkulationen (Dev MVP):",
    "quotes.legacyLink": "Legacy-Kalkulationen",
    "quotes.legacyBanner":
      "Diese Ansicht nutzt den alten In-Memory-Kalkulationsspeicher (nur Entwicklung). Für echte Angebote verknüpft mit Aufträgen verwenden Sie",
    "quotes.legacyBannerLink": "Angebote im Manager",
  };
  return m[key] ?? null;
}

function translateProjects(key, en, sk) {
  if (!key.startsWith("projects.")) return null;
  if (key.startsWith("projects.new.") || key.startsWith("projects.workType.") || key.startsWith("projects.draft.")) {
    return null;
  }
  const m = {
    "projects.empty": "Keine Aufträge",
    "projects.noName": "Ohne Titel",
    "projects.searchPlaceholder": "Aufträge suchen…",
    "projects.count": "Aufträge",
    "projects.nameCol": "Name",
    "projects.addressCol": "Adresse",
    "projects.updatedCol": "Aktualisiert",
    "projects.view": "Öffnen",
    "projects.createProject": "Auftrag erstellen",
    "projects.createComingSoon": "Demnächst — Mobile App verwenden",
    "projects.emptyHint":
      "Erstellen Sie einen Auftragsentwurf aus einer Kundenanfrage oder einen aktiven Auftrag.",
    "projects.accessDenied": "Kein Zugriff",
    "projects.accessDeniedHint": "Sie haben in diesem Kontext keinen Zugriff auf diese Aufträge.",
    "projects.tabOverview": "Übersicht",
    "projects.tabTasks": "Aufgaben",
    "projects.tabExpenses": "Ausgaben",
    "projects.tasksEmpty": "Keine Aufgaben",
    "projects.tasksToggle": "Status umschalten",
    "projects.expensesEmpty": "Keine Ausgaben",
    "projects.expensesTotal": "Total",
    "projects.newProject": "Neuer Auftrag",
    "projects.nameLabel": "Name",
    "projects.namePlaceholder": "Auftragstitel",
    "projects.addressLabel": "Adresse",
    "projects.addressPlaceholder": "Strasse, Nummer",
    "projects.cityLabel": "Ort",
    "projects.cityPlaceholder": "Ort",
    "projects.newTaskPlaceholder": "Titel der neuen Aufgabe",
    "projects.addTask": "Aufgabe hinzufügen",
    "projects.addExpense": "Ausgabe hinzufügen",
    "projects.editExpense": "Ausgabe bearbeiten",
    "projects.expenseDate": "Datum",
    "projects.expenseCurrency": "Währung",
    "projects.expenseCategory": "Kategorie",
    "projects.expenseCategory.MATERIAL": "Material",
    "projects.expenseCategory.WORK": "Arbeit",
    "projects.expenseCategory.OTHER": "Sonstiges",
    "projects.expenseCategory.TRAVEL": "Reise",
    "projects.expenseTitlePlaceholder": "Beschreibung der Ausgabe",
    "projects.expenseNotePlaceholder": "Notiz (optional)",
    "projects.expenseConfirmDelete": "Diese Ausgabe löschen?",
    "projects.titleJobs": "Aufträge",
    "projects.createJob": "Neuer Auftrag",
    "projects.filter.all": "Alle",
    "projects.filter.concepts": "Auftragskonzepte",
    "projects.filter.active": "Aktiv",
    "projects.filter.waiting": "Warten auf Kunde",
    "projects.filter.closed": "Abgelehnt / archiviert",
    "projects.customerCol": "Kunde",
    "projects.statusCol": "Status",
    "projects.lifecycle.concept": "Entwurf",
    "projects.lifecycle.waitingCustomer": "Warten auf Kunde",
    "projects.lifecycle.readyQuote": "Bereit für Angebot",
    "projects.lifecycle.quoteSent": "Angebot gesendet",
    "projects.lifecycle.accepted": "Angenommen",
    "projects.lifecycle.rejected": "Abgelehnt",
    "projects.lifecycle.activeJob": "Aktiver Auftrag",
    "projects.lifecycle.planned": "Geplant",
    "projects.lifecycle.paused": "Pausiert",
    "projects.lifecycle.completed": "Abgeschlossen",
    "projects.lifecycle.archived": "Archiviert",
    "projects.source.manual": "Manuell",
    "projects.source.email": "E-Mail",
    "projects.source.phone": "Telefon",
    "projects.source.photo": "Fotos",
    "projects.source.document": "Dokument",
    "projects.source.social": "Social Media",
    "projects.source.web": "Web",
    "projects.companyContext": "Aufträge für {{company}}",
    "projects.jobDetailLabel": "Auftrag",
  };
  return m[key] ?? null;
}

function translateProjectsNew(key, en, sk) {
  if (!key.startsWith("projects.new.")) return null;
  const m = {
    "projects.new.title": "Neuer Auftrag",
    "projects.new.subtitle":
      "Erfassen Sie die Kundenanfrage. Sie können den Auftrag später bestätigen und in die Ausführung überführen.",
    "projects.new.subtitleV2":
      "Beginnen Sie mit der Wahl des Arbeitstyps. Danach ordnen Sie einen Kontakt zu und wählen Sie die Erstellungsmethode.",
    "projects.new.step.type": "Auftragstyp",
    "projects.new.step.contact": "Kontakt",
    "projects.new.step.concept": "Konzept",
    "projects.new.step.customer": "Kunde",
    "projects.new.step.job": "Auftrag",
    "projects.new.step1Title": "Welchen Auftragstyp erstellen Sie?",
    "projects.new.step2Title": "Für wen ist dieser Auftrag?",
    "projects.new.step2Lead":
      "Sie können einen Kontakt jetzt oder später hinzufügen. Bei Kundenaufträgen empfehlen wir, den Kunden sofort zuzuordnen.",
    "projects.new.contact.existing": "Bestehenden Kontakt wählen",
    "projects.new.contact.existingDesc": "Durchsuchen Sie gespeicherte Kunden und Firmen.",
    "projects.new.contact.new": "Neuen Kontakt erstellen",
    "projects.new.contact.newDesc": "Name, E-Mail und Telefon in wenigen Feldern.",
    "projects.new.contact.none": "Ohne Kontakt fortfahren",
    "projects.new.contact.noneDesc": "Kontakt später im Auftragsdetail ergänzen.",
    "projects.new.contact.noneInfo":
      "Wir erstellen den Auftrag ohne verknüpften Kontakt. Sie können ihn später im Auftragsdetail ergänzen.",
    "projects.new.contact.warning":
      "Bei Kundenaufträgen empfehlen wir einen Kunden zuzuordnen. Sie können dennoch ohne fortfahren.",
    "projects.new.contactSearchPlaceholder": "Kontakt oder Firma suchen…",
    "projects.new.preview.contactUnassigned": "Nicht zugeordnet",
    "projects.new.preview.methodManual": "Manuell",
    "projects.new.preview.methodCopy": "Kopie aus Projekt",
    "projects.new.preview.laterShort": "Nach der Erstellung können Sie:",
    "projects.new.preview.laterPhotos": "Fotos und Dokumente ergänzen",
    "projects.new.preview.laterMaterials": "Material und Arbeit erfassen",
    "projects.new.preview.laterQuote": "ein Angebot vorbereiten",
    "projects.new.preview.laterPlanning": "die Ausführung planen",
    "projects.new.step3Title": "Wie möchten Sie den Auftrag erstellen?",
    "projects.new.method.manualDesc": "Ich erfasse die Grunddaten selbst.",
    "projects.new.method.aiDesc": "AI erstellt anhand Ihrer Beschreibung einen Entwurf.",
    "projects.new.method.copy": "Aus früherem Projekt kopieren",
    "projects.new.method.copyDesc":
      "Struktur, Aufgaben oder Material aus einem ähnlichen Auftrag übernehmen.",
    "projects.new.shortDescription": "Kurzbeschreibung / Anfrage",
    "projects.new.shortDescriptionPlaceholder": "Kurze Zusammenfassung des Auftrags oder der Kundenanfrage…",
    "projects.new.aiPrompt": "Beschreiben Sie den Auftrag oder fügen Sie die Kundennachricht ein…",
    "projects.new.aiHelper":
      "AI kann Auftragstitel, Aufgaben, Rückfragen und Unterlagen für ein Angebot vorschlagen.",
    "projects.new.aiDefaultName": "Neuer Auftrag (AI-Entwurf)",
    "projects.new.copyProjectPlaceholder": "Ähnliches Projekt suchen…",
    "projects.new.copy.copyTasks": "Aufgabenstruktur kopieren",
    "projects.new.copy.copyQuoteItems": "Materialpositionen kopieren",
    "projects.new.copy.copyNotes": "Notizen kopieren",
    "projects.new.copy.copyDocuments": "Text aus Dokumenten / Notizen kopieren",
    "projects.new.step4Title": "Bereit zum Erstellen des Konzepts",
    "projects.new.step4Lead": "Prüfen Sie die Zusammenfassung und erstellen Sie das Auftragskonzept.",
    "projects.new.continue": "Weiter",
    "projects.new.back": "Zurück",
    "projects.new.validation.method": "Wählen Sie die Erstellungsmethode.",
    "projects.new.validation.aiPrompt": "Geben Sie eine Beschreibung für den AI-Entwurf ein.",
    "projects.new.validation.copyProject": "Wählen Sie ein Projekt zum Kopieren.",
    "projects.new.section1Title": "1. Kunde",
    "projects.new.section1Lead": "Wählen Sie einen bestehenden Kunden oder erstellen Sie einen neuen.",
    "projects.new.section2Title": "2. Auftrag",
    "projects.new.section2Lead": "Benennen Sie den Auftrag und wählen Sie die Art der Arbeit.",
    "projects.new.preview.customer": "Kunde",
    "projects.new.preview.customerNew": "Neuer Kunde",
    "projects.new.preview.customerOptional": "Optional",
    "projects.new.preview.customerNotSelected": "Nicht gewählt",
    "projects.new.preview.type": "Typ",
    "projects.new.preview.typeNotSelected": "Nicht gewählt",
    "projects.new.preview.nextStep": "Nächster Schritt",
    "projects.new.preview.laterTitle": "Nach der Erstellung können Sie ergänzen:",
    "projects.new.optionalDetails": "Optionale Angaben",
    "projects.new.sectionBasics": "Grundinformationen",
    "projects.new.customerRequiredHint":
      "Verknüpfen Sie den Auftrag mit einem Kunden — bestehend oder neu.",
    "projects.new.customerModeLabel": "Kundenquelle",
    "projects.new.customerMode.existing": "Bestehender Kunde",
    "projects.new.customerMode.new": "Neuer Kunde",
    "projects.new.customerSearchPlaceholder": "Kunde oder Firma suchen…",
    "projects.new.customerListLabel": "Kunden",
    "projects.new.customerSearchEmpty": "Kein Kunde entspricht Ihrer Suche.",
    "projects.new.customersEmpty": "Sie haben noch keine Kunden.",
    "projects.new.createCustomerCta": "Neuen Kunden erstellen",
    "projects.new.changeCustomer": "Kunde ändern",
    "projects.new.newCustomerName": "Name oder Firmenname",
    "projects.new.newCustomerNamePlaceholder": "z. B. Muster AG",
    "projects.new.customerTypeLabel": "Kundentyp",
    "projects.new.customerType.person": "Person",
    "projects.new.customerType.company": "Firma",
    "projects.new.extendedCustomerFields": "UID, MWST-Nr., Adresse",
    "projects.new.customerIco": "UID",
    "projects.new.customerTaxId": "MWST-Nr. / UID",
    "projects.new.customerAddress": "Adresse",
    "projects.new.jobName": "Auftragstitel",
    "projects.new.location": "Ausführungsort",
    "projects.new.locationPlaceholder": "Strasse, Ort oder Baustellenname",
    "projects.new.advancedSection": "Erweiterte Angaben",
    "projects.new.internalNote": "Interne Notiz",
    "projects.new.helpTitle": "Was erhalten Sie?",
    "projects.new.help.concept": "Ein Auftragskonzept in der Verkaufsphase",
    "projects.new.help.customer": "Kunde mit dem Auftrag verknüpft",
    "projects.new.help.photos": "Platz für Fotos und Notizen",
    "projects.new.help.quote": "Möglichkeit, ein Angebot vorzubereiten",
    "projects.new.help.planning": "Planung und Ausführung später",
    "projects.new.validation.customer": "Wählen Sie einen Kunden.",
    "projects.new.validation.customerName": "Name oder Firmenname ist erforderlich.",
    "projects.new.nextSteps.title": "Empfohlene nächste Schritte",
    "projects.new.nextSteps.request": "Kundenanfrage ergänzen",
    "projects.new.nextSteps.photos": "Fotos oder Dokumente hinzufügen",
    "projects.new.nextSteps.materials": "Material und Arbeit erfassen",
    "projects.new.nextSteps.quote": "Angebot erstellen",
    "projects.new.nextSteps.delivery": "In Ausführung überführen",
    "projects.new.nextSteps.hint":
      "Diese Schritte können Sie schrittweise auf der Auftragsdetailseite erledigen.",
    "projects.new.sectionWorkType": "Auftragstyp",
    "projects.new.sectionWorkTypeHint":
      "Wählen Sie den passenden Typ — hilfreich für Angebote und künftige AI-Vorschläge.",
    "projects.new.customerOptional":
      "Kundendaten sind bei interner Arbeit und Eigenbau optional.",
    "projects.new.validation.workType": "Bitte wählen Sie einen Auftragstyp.",
    "projects.new.sectionCustomer": "Kunde",
    "projects.new.sectionJob": "Auftrag",
    "projects.new.sectionLocation": "Ausführungsort",
    "projects.new.sectionLocationHint": "Optional — hilfreich für Angebot und Planung.",
    "projects.new.nextStepInfo":
      "Nach dem Entwurf können Sie Material, Arbeit erfassen und ein Angebot vorbereiten.",
    "projects.new.backToList": "Zurück zu Aufträgen",
    "projects.new.validation.name": "Auftragstitel ist erforderlich.",
    "projects.new.validation.request": "Beschreibung der Kundenanfrage ist erforderlich.",
    "projects.new.submitError": "Auftrag konnte nicht erstellt werden. Bitte erneut versuchen.",
    "projects.new.customerRequest": "Kundenanfrage",
    "projects.new.customerRequestPlaceholder": "Beschreiben Sie den Kundenbedarf…",
    "projects.new.customerName": "Kundenname",
    "projects.new.customerEmail": "E-Mail",
    "projects.new.customerPhone": "Telefon",
    "projects.new.source": "Quelle der Anfrage",
  };
  return m[key] ?? null;
}

function translateWorkTypes(key, en, sk) {
  if (!key.startsWith("projects.workType.") && key !== "projects.draft.workTypeAiNote") return null;
  const m = {
    "projects.workType.service_inspection": "Service / Besichtigung",
    "projects.workType.service_inspection.hint": "Schnelle Kontrolle, Reparatur oder Einsatz vor Ort.",
    "projects.workType.customer_job": "Kundenauftrag",
    "projects.workType.customer_job.hint": "Übliche Arbeit mit Angebot und Ausführung.",
    "projects.workType.large_construction_project": "Grösseres Bauprojekt",
    "projects.workType.large_construction_project.hint": "Mehr Phasen, Personen und Planung.",
    "projects.workType.own_build": "Eigenbau",
    "projects.workType.own_build.hint": "Arbeit für eigene Firmenzwecke.",
    "projects.workType.internal_project": "Internes Projekt",
    "projects.workType.internal_project.hint": "Interne Arbeit ohne externen Kunden.",
    "projects.draft.workTypeAiNote":
      "Der Auftragstyp hilft AI später, Material, Arbeit, Kundenfragen und Angebote vorzuschlagen.",
  };
  return m[key] ?? null;
}

function translateDraft(key, en, sk) {
  if (!key.startsWith("projects.draft.")) return null;
  const m = {
    "projects.draft.hint":
      "Dies ist ein Entwurf — noch kein aktiver Baustellenauftrag. Ergänzen Sie Details, bereiten Sie ein Angebot vor und aktivieren Sie nach Kundenannahme.",
    "projects.draft.prepareQuote": "Angebot vorbereiten",
    "projects.draft.openEstimates": "Kalkulationen öffnen (Entwurf)",
    "projects.draft.waitingCustomer": "Warten auf Kunde",
    "projects.draft.markAccepted": "Als angenommen markieren",
    "projects.draft.convert": "In aktiven Auftrag überführen",
    "projects.draft.convertTitle": "In aktiven Auftrag überführen?",
    "projects.draft.convertDescription":
      "Möchten Sie diesen Entwurf wirklich in einen aktiven Auftrag überführen? Danach können Sie Aufgaben und Ausgaben planen.",
    "projects.draft.convertConfirm": "Überführen",
    "projects.draft.actionError": "Aktion fehlgeschlagen. Bitte erneut versuchen.",
    "projects.draft.sectionRequest": "Kundenanfrage",
    "projects.draft.sectionContact": "Kontakt",
    "projects.draft.sectionMaterials": "Unterlagen",
    "projects.draft.sectionAi": "AI-Analyse",
    "projects.draft.sectionQuote": "Angebotsentwurf",
    "projects.draft.sectionMissing": "Fehlende Informationen",
    "projects.draft.sectionActivity": "Aktivität",
    "projects.draft.sectionEmail": "E-Mail-Kommunikation",
    "projects.draft.customerName": "Name",
    "projects.draft.customerEmail": "E-Mail",
    "projects.draft.customerPhone": "Telefon",
    "projects.draft.materialsPlaceholder": "Dokumente und Fotos können ergänzt werden, sobald der Speicher aktiv ist.",
    "projects.draft.aiPlaceholder":
      "Der AI-Assistent hilft künftig, die Anfrage zusammenzufassen, Lücken zu finden und eine Angebotsstruktur vorzuschlagen.",
    "projects.draft.quotePlaceholder": "Angebotserstellung wird in einer späteren Phase hier verknüpft.",
    "projects.draft.emailPlaceholder":
      "E-Mail-Kommunikation ist verfügbar, sobald Gmail oder Firmen-E-Mail verbunden ist.",
    "projects.draft.activityPlaceholder": "Statusänderungen und Notizen erscheinen hier.",
    "projects.draft.missing.scope": "Klarer Leistungsumfang",
    "projects.draft.missing.address": "Ausführungsadresse",
    "projects.draft.missing.deadline": "Gewünschter Termin",
    "projects.draft.missing.budget": "Budgethinweis",
    "projects.draft.missing.contacts": "Kontakt vor Ort",
    "projects.draft.sectionDocuments": "Dokumente & Fotos",
    "projects.draft.sectionQuoteItems": "Material & Arbeit",
    "projects.draft.quoteItemsHint":
      "Erstellen Sie das Angebot positionsweise. Material und Arbeit bleiben getrennt für klare Preise.",
    "projects.draft.exportPdf": "PDF exportieren",
    "projects.draft.sendQuote": "Angebot an Kunden senden",
    "projects.draft.quoteItem.materials": "Material",
    "projects.draft.quoteItem.work": "Arbeit",
    "projects.draft.quoteItem.add": "Position hinzufügen",
    "projects.draft.quoteItem.empty":
      "Noch keine Positionen. Erfassen Sie Material oder Arbeit für das Angebot.",
    "projects.draft.quoteItem.name": "Beschreibung",
    "projects.draft.quoteItem.qty": "Menge",
    "projects.draft.quoteItem.unit": "Einheit",
    "projects.draft.quoteItem.unitPrice": "Einzelpreis",
    "projects.draft.quoteItem.total": "Total",
    "projects.draft.quoteItem.vat": "MWST %",
    "projects.draft.quoteItem.vatLine": "MWST ({{percent}}%)",
    "projects.draft.quoteItem.notes": "Bedingungen / interne Notiz",
    "projects.draft.quoteItem.notesPlaceholder": "z. B. Gültigkeit 30 Tage, Zahlungsbedingungen…",
    "projects.draft.quoteItem.subtotal": "Zwischentotal",
    "projects.draft.quoteItem.grandTotal": "Total inkl. MWST",
    "projects.draft.quoteItem.disclaimer":
      "Nur interner Entwurf — unverbindlich bis Sie das offizielle Angebot exportieren und senden.",
    "projects.draft.quoteItem.newItem": "Neue Position",
    "projects.draft.quoteItem.needItems":
      "Fügen Sie mindestens eine Position hinzu, bevor Sie den Kalkulationseditor öffnen.",
    "projects.draft.quoteItem.loadError": "Angebotspositionen konnten nicht geladen werden.",
    "projects.draft.quoteItem.saveError": "Speichern fehlgeschlagen. Bitte erneut versuchen.",
  };
  return m[key] ?? null;
}

function translateMembers(key, en, sk) {
  if (!key.startsWith("members.")) return null;
  const m = {
    "members.teamOnly": "Nur im Team-Arbeitsbereich. Bitte wechseln Sie zum Firmenarbeitsbereich.",
    "members.invite": "Mitglied einladen",
    "members.sendInvite": "Einladung senden",
    "members.membersList": "Mitglieder",
    "members.pendingInvites": "Ausstehende Einladungen",
    "members.nameCol": "Name",
    "members.emailCol": "E-Mail",
    "members.roleCol": "Rolle",
    "members.statusCol": "Status",
    "members.roleAdmin": "Administrator",
    "members.roleMember": "Mitglied",
    "members.remove": "Entfernen",
    "members.revoke": "Widerrufen",
    "members.confirmRemove": "Dieses Mitglied entfernen?",
    "members.confirmRevoke": "Diese Einladung widerrufen?",
    "members.seatsUsed": "Belegte Plätze",
    "members.plan": "Plan",
  };
  return m[key] ?? null;
}

function translateBilling(key, en, sk) {
  if (!key.startsWith("billing.")) return null;
  const m = {
    "billing.teamOnly": "Nur im Team-Arbeitsbereich. Bitte wechseln Sie zum Firmenarbeitsbereich.",
    "billing.planTitle": "Abrechnung",
    "billing.planDescription": "Verwalten Sie Team-Plan und Plätze.",
    "billing.plan": "Plan",
    "billing.seatLimit": "Platzlimit",
    "billing.seatsUsed": "Belegte Plätze",
    "billing.status": "Status",
    "billing.trialExpired": "Testphase abgelaufen",
    "billing.seatLimitReached": "Platzlimit erreicht",
    "billing.contactSupportHint": "Kontaktieren Sie den Support für Upgrade oder Verlängerung der Testphase.",
    "billing.upgradePlan": "Plan upgraden",
    "billing.upgradeComingSoon": "Demnächst",
    "billing.contactSupport": "Support kontaktieren",
  };
  return m[key] ?? null;
}

function translateHelp(key, en, sk) {
  if (!key.startsWith("help.")) return null;
  const m = {
    "help.title": "Hilfe & Support",
    "help.subtitle": "Antworten finden und Kontakt aufnehmen.",
    "help.faqTitle": "Häufig gestellte Fragen",
    "help.faq1q": "Wie erstelle ich eine Kalkulation?",
    "help.faq1a": "Gehen Sie zu Kalkulationen → Neue Kalkulation. Erfassen Sie Kunde und Positionen.",
    "help.faq2q": "Wo sind meine Projekte?",
    "help.faq2a": "Projekte werden aus der Staveto Mobile App synchronisiert. Erstellen Sie Projekte dort zuerst.",
    "help.faq3q": "Wie abonniere ich Pro?",
    "help.faq3a": "Nutzen Sie die Staveto Mobile App (iOS/Android) oder kontaktieren Sie den Support.",
    "help.contactTitle": "Support kontaktieren",
    "help.contactText": "Brauchen Sie Hilfe? Schreiben Sie an support@staveto.com",
  };
  return m[key] ?? null;
}

function translateOnboarding(key, en, sk) {
  if (!key.startsWith("onboarding.")) return null;
  const m = {
    "onboarding.back": "Zurück",
    "onboarding.next": "Weiter",
    "onboarding.finish": "Zur App",
    "onboarding.step.welcome.title": "Willkommen bei Staveto",
    "onboarding.step.welcome.subtitle": "Zuerst richten wir Profil und Arbeitsbereich ein.",
    "onboarding.step.profile.title": "Ihr Profil",
    "onboarding.step.profile.subtitle": "Wie sollen wir Sie ansprechen?",
    "onboarding.firstName": "Vorname",
    "onboarding.lastName": "Nachname",
    "onboarding.role.title": "Ihre Rolle",
    "onboarding.role.craftsman": "Handwerker/in",
    "onboarding.role.manager": "Leitung",
    "onboarding.role.accountant": "Buchhaltung",
    "onboarding.role.other": "Andere",
    "onboarding.step.usage.title": "Wie nutzen Sie Staveto?",
    "onboarding.step.usage.subtitle": "Wählen Sie den passenden Arbeitsbereich.",
    "onboarding.usage.personal.title": "Persönlich / Einzelunternehmen",
    "onboarding.usage.personal.description": "Für eigene Aufträge und Projekte.",
    "onboarding.usage.company.title": "Firma / Team",
    "onboarding.usage.company.description": "Für Firma oder Team-Arbeitsbereich.",
    "onboarding.step.workspace.title": "Arbeitsbereich einrichten",
    "onboarding.step.companyChoose.subtitle": "Neue Firma erstellen oder per Einladung beitreten.",
    "onboarding.company.create.title": "Neue Firma erstellen",
    "onboarding.company.create.description": "Firmenarbeitsbereich einrichten und Administrator werden.",
    "onboarding.company.join.title": "Mit Einladung beitreten",
    "onboarding.company.join.description": "Einladungslink aus der E-Mail verwenden.",
    "onboarding.companyName": "Firmenname",
    "onboarding.companyName.placeholder": "z. B. Muster AG",
    "onboarding.step.companyCreate.subtitle": "Geben Sie Ihren Firmennamen ein.",
    "onboarding.step.companyJoin.subtitle": "Öffnen Sie den Einladungslink oder fügen Sie den Token aus der E-Mail ein.",
    "onboarding.join.tokenLabel": "Einladungstoken (optional)",
    "onboarding.join.tokenPlaceholder": "Token aus Einladungslink einfügen",
    "onboarding.join.openLink": "Einladung annehmen",
    "onboarding.join.hint": "Der Einladungslink sieht so aus: /join?token=…",
    "onboarding.step.features.title": "Was interessiert Sie?",
    "onboarding.step.features.subtitle": "Wählen Sie gewünschte Module (optional).",
    "onboarding.feature.quotes": "Angebote",
    "onboarding.feature.projects": "Projekte",
    "onboarding.feature.expenses": "Ausgaben",
    "onboarding.feature.documents": "Dokumente",
    "onboarding.feature.team": "Team",
    "onboarding.feature.calendar": "Kalender",
    "onboarding.feature.invoices": "Rechnungen",
    "onboarding.step.done.title": "Alles bereit!",
    "onboarding.error.required": "Bitte füllen Sie die Pflichtfelder aus.",
    "onboarding.error.save": "Speichern fehlgeschlagen. Bitte erneut versuchen.",
  };
  return m[key] ?? null;
}

function autoFromEn(en) {
  let s = en;
  const pairs = [
    [/\bJobs\b/g, "Aufträge"],
    [/\bjobs\b/g, "Aufträge"],
    [/\bJob\b/g, "Auftrag"],
    [/\bjob\b/g, "Auftrag"],
    [/\bQuotes\b/g, "Angebote"],
    [/\bquotes\b/g, "Angebote"],
    [/\bQuote\b/g, "Angebot"],
    [/\bquote\b/g, "Angebot"],
    [/\bCustomers\b/g, "Kunden"],
    [/\bCustomer\b/g, "Kunde"],
    [/\bcustomer\b/g, "Kunde"],
    [/\bCompany\b/g, "Firma"],
    [/\bcompany\b/g, "Firma"],
    [/\bExpenses\b/g, "Ausgaben"],
    [/\bExpense\b/g, "Ausgabe"],
    [/\bDocuments\b/g, "Dokumente"],
    [/\bAttendance\b/g, "Zeiterfassung"],
    [/\bTasks\b/g, "Aufgaben"],
    [/\bTask\b/g, "Aufgabe"],
    [/\bProjects\b/g, "Projekte"],
    [/\bProject\b/g, "Projekt"],
    [/\bworkspace\b/g, "Arbeitsbereich"],
    [/\bWorkspace\b/g, "Arbeitsbereich"],
    [/\bIssues\b/g, "Meldungen"],
    [/\bIssue\b/g, "Meldung"],
    [/\bSettings\b/g, "Einstellungen"],
    [/\bDashboard\b/g, "Übersicht"],
    [/\bOverview\b/g, "Übersicht"],
    [/\bLoading\.\.\./g, "Wird geladen…"],
    [/\bContinue\b/g, "Weiter"],
    [/\bBack\b/g, "Zurück"],
    [/\bSave\b/g, "Speichern"],
    [/\bCancel\b/g, "Abbrechen"],
    [/\bDelete\b/g, "Löschen"],
    [/\bEdit\b/g, "Bearbeiten"],
  ];
  for (const [re, rep] of pairs) s = s.replace(re, rep);
  return s;
}
