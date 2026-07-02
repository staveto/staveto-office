import type { Locale } from "@/i18n/translations";

export const AGENT_TRANSLATIONS: Record<Locale, Record<string, string>> = {
  en: {
    "agent.summary.basicMode": "AI advisor is running in basic mode.",
    "agent.summary.localChecksComplete": "Local checks complete.",
    "agent.summary.analysisComplete": "Analysis complete.",
    "agent.summary.noWorkspace": "Select an active workspace to use the AI advisor.",
    "agent.insights.localCompanyCountryMissing.title": "Registered country is missing",
    "agent.insights.localCompanyCountryMissing.message":
      "Set the registered company country so market rules, tax labels and document defaults apply correctly.",
    "agent.insights.localCompanyCountryMissing.reason":
      "Company country is empty on the active workspace.",
    "agent.insights.localCompanyCountryMissing.action.label": "Open company settings",
    "agent.insights.localCompanyCountryMissing.action.description":
      "Go to company profile and select the registered country.",
    "agent.insights.localChVatMissing.title": "MWST/UID may be missing for Switzerland",
    "agent.insights.localChVatMissing.message":
      "Swiss company documents often need VAT/MWST identifiers. Add them before exporting customer documents.",
    "agent.insights.localChVatMissing.reason":
      "Company country is CH and VAT/MWST field appears empty.",
    "agent.insights.localCompanyLegalName.title": "Legal company name is missing",
    "agent.insights.localCompanyLegalName.message":
      "Add the legal name used on quotes and invoices.",
    "agent.insights.localCompanyLegalName.reason": "Legal name field is empty.",
    "agent.insights.localCompanyLogo.title": "Company logo is not uploaded",
    "agent.insights.localCompanyLogo.message":
      "Upload a logo to improve exported documents and customer-facing PDFs.",
    "agent.insights.localCompanyLogo.reason": "Logo URL is missing in company profile.",
    "agent.insights.localQuoteCurrencyMismatch.title": "Quote currency differs from company currency",
    "agent.insights.localQuoteCurrencyMismatch.message":
      "Review the quote currency before sending it to the customer.",
    "agent.insights.localQuoteCurrencyMismatch.reason":
      "Quote currency does not match active company currency.",
    "agent.insights.localQuoteCustomerEmail.title": "Customer email is missing",
    "agent.insights.localQuoteCustomerEmail.message":
      "Add a customer email if you plan to send the quote digitally.",
    "agent.insights.localQuoteCustomerEmail.reason": "Customer email field is empty.",
    "agent.insights.localQuoteNoTasks.title": "Accepted quote without project tasks",
    "agent.insights.localQuoteNoTasks.message":
      "Consider creating or reviewing project tasks so execution can start.",
    "agent.insights.localQuoteNoTasks.reason":
      "Quote is accepted but linked project has no tasks.",
    "agent.insights.localQuoteNoTasks.action.label": "Review linked project",
    "agent.insights.localQuoteNoTasks.action.description":
      "Open the related project and plan the first tasks.",
    "agent.insights.localProjectNoMembers.title": "No team members assigned",
    "agent.insights.localProjectNoMembers.message":
      "Assign at least one responsible person before work starts on site.",
    "agent.insights.localProjectNoMembers.reason":
      "Project has no assigned members in the active workspace.",
    "agent.insights.localProjectLocation.title": "Project location is missing",
    "agent.insights.localProjectLocation.message":
      "Add the site address for planning, logistics and field coordination.",
    "agent.insights.localProjectLocation.reason": "Location field is empty.",
    "agent.insights.localProjectNoTasks.title": "Project has no tasks yet",
    "agent.insights.localProjectNoTasks.message":
      "Break the job into phases and tasks so the team knows what to do next.",
    "agent.insights.localProjectNoTasks.reason": "Task list is empty.",
    "agent.insights.localProjectDocsScope.title": "Documents attached but scope may be incomplete",
    "agent.insights.localProjectDocsScope.message":
      "Use the AI project assistant to extract scope, phases and tasks from attached documents.",
    "agent.insights.localProjectDocsScope.reason":
      "Project has attachments but no extracted scope signal was provided.",
    "agent.insights.localProjectDocsScope.action.label": "Open AI project assistant",
    "agent.insights.localProjectDocsScope.action.description":
      "Review or regenerate the project plan from existing documents.",
    "agent.insights.localProjectDocsScope.action.confirmationText": "Open AI project assistant",
    "agent.insights.localWizardBriefShort.title": "Project description is very short",
    "agent.insights.localWizardBriefShort.message":
      "Add more detail about scope, exclusions, deadlines and site conditions to improve the AI draft.",
    "agent.insights.localWizardBriefShort.reason": "Brief length is under 40 characters.",
    "agent.insights.localWizardAttachments.title": "Attachments can power the AI draft",
    "agent.insights.localWizardAttachments.message":
      "Continue to the draft step so Staveto can read your PDFs and propose phases, tasks and materials.",
    "agent.insights.localWizardAttachments.reason": "Attachments are present in the wizard.",
    "agent.insights.localWizardAttachments.action.label": "Continue with AI draft",
    "agent.insights.localWizardAttachments.action.description":
      "Move to the AI draft step using the uploaded documents.",
    "agent.insights.localWizardAttachments.action.confirmationText": "Continue with AI draft",
    "agent.insights.localWizardLocation.title": "Location is not filled in",
    "agent.insights.localWizardLocation.message":
      "Add the site location so planning and logistics are clearer in the draft.",
    "agent.insights.localWizardLocation.reason": "Location field is empty in the wizard.",
    "agent.insights.localDashboardDelayed.title": "Delayed jobs need attention",
    "agent.insights.localDashboardDelayed.message":
      "Review active projects with delays in the current workspace.",
    "agent.insights.localDashboardDelayed.reason":
      "Dashboard reports delayed jobs in scoped workspace metrics.",
    "agent.insights.localDashboardDelayed.action.label": "Open projects",
    "agent.insights.localDashboardDelayed.action.description":
      "Review delayed jobs in the project list.",
    "agent.insights.localDashboardNext.title": "Start from the active workspace",
    "agent.insights.localDashboardNext.message":
      "Use projects, quotes and company settings in the current workspace only.",
    "agent.insights.localDashboardNext.reason":
      "Dashboard advice is scoped to activeWorkspaceId.",
    "agent.insights.localUnsavedChanges.title": "Unsaved changes on this screen",
    "agent.insights.localUnsavedChanges.message":
      "Save or discard your changes before leaving this screen.",
    "agent.insights.localUnsavedChanges.reason": "Screen context reports unsavedChanges=true.",
  },
  sk: {
    "agent.summary.basicMode": "AI poradca beží v základnom režime.",
    "agent.summary.localChecksComplete": "Lokálne kontroly dokončené.",
    "agent.summary.analysisComplete": "Analýza dokončená.",
    "agent.summary.noWorkspace": "Vyberte aktívny pracovný priestor pre AI poradcu.",
    "agent.insights.localCompanyCountryMissing.title": "Chýba registrovaná krajina firmy",
    "agent.insights.localCompanyCountryMissing.message":
      "Nastavte registrovanú krajinu firmy, aby sa správne uplatnili trhové pravidlá, daňové označenia a predvolené dokumenty.",
    "agent.insights.localCompanyCountryMissing.reason":
      "Krajina firmy nie je vyplnená v aktívnom pracovnom priestore.",
    "agent.insights.localCompanyCountryMissing.action.label": "Otvoriť nastavenia firmy",
    "agent.insights.localCompanyCountryMissing.action.description":
      "Prejdite do profilu firmy a vyberte registrovanú krajinu.",
    "agent.insights.localChVatMissing.title": "Pre Švajčiarsko môže chýbať MWST/UID",
    "agent.insights.localChVatMissing.message":
      "Vo švajčiarskych firemných dokumentoch býva potrebný identifikátor DPH/MWST. Doplňte ho pred odoslaním zákazníkovi.",
    "agent.insights.localChVatMissing.reason":
      "Krajina firmy je CH a pole DPH/MWST vyzerá prázdne.",
    "agent.insights.localCompanyLegalName.title": "Chýba obchodné meno firmy",
    "agent.insights.localCompanyLegalName.message":
      "Doplňte obchodné meno, ktoré sa používa na ponukách a faktúrach.",
    "agent.insights.localCompanyLegalName.reason": "Pole obchodného mena je prázdne.",
    "agent.insights.localCompanyLogo.title": "Logo firmy nie je nahraté",
    "agent.insights.localCompanyLogo.message":
      "Nahrajte logo pre lepší vzhľad exportovaných dokumentov a PDF pre zákazníkov.",
    "agent.insights.localCompanyLogo.reason": "V profile firmy chýba URL loga.",
    "agent.insights.localQuoteCurrencyMismatch.title": "Mena ponuky sa líši od meny firmy",
    "agent.insights.localQuoteCurrencyMismatch.message":
      "Skontrolujte menu ponuky pred odoslaním zákazníkovi.",
    "agent.insights.localQuoteCurrencyMismatch.reason":
      "Mena ponuky sa nezhoduje s aktívnou firemnou menou.",
    "agent.insights.localQuoteCustomerEmail.title": "Chýba e-mail zákazníka",
    "agent.insights.localQuoteCustomerEmail.message":
      "Doplňte e-mail zákazníka, ak plánujete ponuku poslať digitálne.",
    "agent.insights.localQuoteCustomerEmail.reason": "Pole e-mailu zákazníka je prázdne.",
    "agent.insights.localQuoteNoTasks.title": "Prijatá ponuka bez úloh na zákazke",
    "agent.insights.localQuoteNoTasks.message":
      "Zvážte vytvorenie alebo kontrolu úloh na zákazke, aby sa dalo začať s realizáciou.",
    "agent.insights.localQuoteNoTasks.reason":
      "Ponuka je prijatá, ale prepojená zákazka nemá úlohy.",
    "agent.insights.localQuoteNoTasks.action.label": "Otvoriť prepojenú zákazku",
    "agent.insights.localQuoteNoTasks.action.description":
      "Prejdite na súvisiacu zákazku a naplánujte prvé úlohy.",
    "agent.insights.localProjectNoMembers.title": "Nie sú priradení členovia tímu",
    "agent.insights.localProjectNoMembers.message":
      "Priraďte aspoň jednu zodpovednú osobu pred začiatkom prác na stavbe.",
    "agent.insights.localProjectNoMembers.reason":
      "Zákazka nemá priradených členov v aktívnom pracovnom priestore.",
    "agent.insights.localProjectLocation.title": "Chýba lokalita zákazky",
    "agent.insights.localProjectLocation.message":
      "Doplňte adresu stavby pre plánovanie, logistiku a koordináciu na mieste.",
    "agent.insights.localProjectLocation.reason": "Pole lokality je prázdne.",
    "agent.insights.localProjectNoTasks.title": "Zákazka zatiaľ nemá úlohy",
    "agent.insights.localProjectNoTasks.message":
      "Rozdeľte zákazku na fázy a úlohy, aby tím vedel, čo robiť ďalej.",
    "agent.insights.localProjectNoTasks.reason": "Zoznam úloh je prázdny.",
    "agent.insights.localProjectDocsScope.title": "Sú prílohy, ale rozsah môže byť neúplný",
    "agent.insights.localProjectDocsScope.message":
      "Použite AI asistenta zákazky na extrakciu rozsahu, fáz a úloh z priložených dokumentov.",
    "agent.insights.localProjectDocsScope.reason":
      "Zákazka má prílohy, ale chýba signál o extrahovanom rozsahu.",
    "agent.insights.localProjectDocsScope.action.label": "Otvoriť AI asistenta zákazky",
    "agent.insights.localProjectDocsScope.action.description":
      "Skontrolujte alebo znovu vygenerujte plán zákazky z existujúcich dokumentov.",
    "agent.insights.localProjectDocsScope.action.confirmationText": "Otvoriť AI asistenta zákazky",
    "agent.insights.localWizardBriefShort.title": "Popis zákazky je veľmi krátky",
    "agent.insights.localWizardBriefShort.message":
      "Doplňte viac detailov o rozsahu, výnimkách, termínoch a podmienkach na stavbe pre lepší AI návrh.",
    "agent.insights.localWizardBriefShort.reason": "Dĺžka popisu je pod 40 znakov.",
    "agent.insights.localWizardAttachments.title": "Prílohy môžu podporiť AI návrh",
    "agent.insights.localWizardAttachments.message":
      "Pokračujte na krok návrhu, aby Staveto vedelo spracovať PDF a navrhnúť fázy, úlohy a materiály.",
    "agent.insights.localWizardAttachments.reason": "Vo sprievodcovi sú priložené súbory.",
    "agent.insights.localWizardAttachments.action.label": "Pokračovať s AI návrhom",
    "agent.insights.localWizardAttachments.action.description":
      "Prejdite na krok AI návrhu s nahratými dokumentmi.",
    "agent.insights.localWizardAttachments.action.confirmationText": "Pokračovať s AI návrhom",
    "agent.insights.localWizardLocation.title": "Lokalita nie je vyplnená",
    "agent.insights.localWizardLocation.message":
      "Doplňte miesto realizácie, aby bolo plánovanie a logistika v návrhu jasnejšie.",
    "agent.insights.localWizardLocation.reason": "Pole lokality je vo sprievodcovi prázdne.",
    "agent.insights.localDashboardDelayed.title": "Oneskorené zákazky vyžadujú pozornosť",
    "agent.insights.localDashboardDelayed.message":
      "Skontrolujte aktívne zákazky s meškaním v aktuálnom pracovnom priestore.",
    "agent.insights.localDashboardDelayed.reason":
      "Prehľad hlási oneskorené zákazky v rámci workspace metrik.",
    "agent.insights.localDashboardDelayed.action.label": "Otvoriť zákazky",
    "agent.insights.localDashboardDelayed.action.description":
      "Skontrolujte oneskorené zákazky v zozname projektov.",
    "agent.insights.localDashboardNext.title": "Začnite v aktívnom pracovnom priestore",
    "agent.insights.localDashboardNext.message":
      "Pracujte len so zákazkami, ponukami a nastaveniami firmy v aktuálnom priestore.",
    "agent.insights.localDashboardNext.reason":
      "Rady prehľadu sú obmedzené na activeWorkspaceId.",
    "agent.insights.localUnsavedChanges.title": "Na tejto obrazovke sú neuložené zmeny",
    "agent.insights.localUnsavedChanges.message":
      "Pred odchodom zo obrazovky zmeny uložte alebo zahoďte.",
    "agent.insights.localUnsavedChanges.reason":
      "Kontext obrazovky hlási unsavedChanges=true.",
  },
  de: {
    "agent.summary.basicMode": "Der KI-Berater läuft im Basismodus.",
    "agent.summary.localChecksComplete": "Lokale Prüfungen abgeschlossen.",
    "agent.summary.analysisComplete": "Analyse abgeschlossen.",
    "agent.summary.noWorkspace":
      "Wählen Sie einen aktiven Arbeitsbereich für den KI-Berater.",
    "agent.insights.localCompanyCountryMissing.title": "Registriertes Land fehlt",
    "agent.insights.localCompanyCountryMissing.message":
      "Legen Sie das registrierte Firmenland fest, damit Marktregeln, Steuerbezeichnungen und Dokumentstandards korrekt gelten.",
    "agent.insights.localCompanyCountryMissing.reason":
      "Das Firmenland ist im aktiven Arbeitsbereich leer.",
    "agent.insights.localCompanyCountryMissing.action.label": "Firmeneinstellungen öffnen",
    "agent.insights.localCompanyCountryMissing.action.description":
      "Öffnen Sie das Firmenprofil und wählen Sie das registrierte Land.",
    "agent.insights.localChVatMissing.title": "MWST/UID fehlt möglicherweise für die Schweiz",
    "agent.insights.localChVatMissing.message":
      "Schweizer Firmendokumente benötigen oft MWST/UID. Ergänzen Sie diese vor dem Versand.",
    "agent.insights.localChVatMissing.reason":
      "Firmenland ist CH und das MWST-Feld scheint leer zu sein.",
    "agent.insights.localCompanyLegalName.title": "Rechtlicher Firmenname fehlt",
    "agent.insights.localCompanyLegalName.message":
      "Ergänzen Sie den rechtlichen Namen für Angebote und Rechnungen.",
    "agent.insights.localCompanyLegalName.reason": "Das Feld für den rechtlichen Namen ist leer.",
    "agent.insights.localCompanyLogo.title": "Firmenlogo fehlt",
    "agent.insights.localCompanyLogo.message":
      "Laden Sie ein Logo hoch, um exportierte Dokumente und PDFs zu verbessern.",
    "agent.insights.localCompanyLogo.reason": "Logo-URL fehlt im Firmenprofil.",
    "agent.insights.localQuoteCurrencyMismatch.title": "Angebotswährung weicht von Firmenwährung ab",
    "agent.insights.localQuoteCurrencyMismatch.message":
      "Prüfen Sie die Angebotswährung vor dem Versand an den Kunden.",
    "agent.insights.localQuoteCurrencyMismatch.reason":
      "Die Angebotswährung entspricht nicht der aktiven Firmenwährung.",
    "agent.insights.localQuoteCustomerEmail.title": "Kunden-E-Mail fehlt",
    "agent.insights.localQuoteCustomerEmail.message":
      "Ergänzen Sie die Kunden-E-Mail, wenn Sie das Angebot digital senden möchten.",
    "agent.insights.localQuoteCustomerEmail.reason": "Das Feld Kunden-E-Mail ist leer.",
    "agent.insights.localQuoteNoTasks.title": "Angenommenes Angebot ohne Projektaufgaben",
    "agent.insights.localQuoteNoTasks.message":
      "Erstellen oder prüfen Sie Projektaufgaben, damit die Ausführung starten kann.",
    "agent.insights.localQuoteNoTasks.reason":
      "Angebot ist angenommen, aber das verknüpfte Projekt hat keine Aufgaben.",
    "agent.insights.localQuoteNoTasks.action.label": "Verknüpftes Projekt öffnen",
    "agent.insights.localQuoteNoTasks.action.description":
      "Öffnen Sie das zugehörige Projekt und planen Sie die ersten Aufgaben.",
    "agent.insights.localProjectNoMembers.title": "Keine Teammitglieder zugewiesen",
    "agent.insights.localProjectNoMembers.message":
      "Weisen Sie mindestens eine verantwortliche Person zu, bevor die Arbeit beginnt.",
    "agent.insights.localProjectNoMembers.reason":
      "Dem Projekt sind im aktiven Arbeitsbereich keine Mitglieder zugewiesen.",
    "agent.insights.localProjectLocation.title": "Projektstandort fehlt",
    "agent.insights.localProjectLocation.message":
      "Ergänzen Sie die Baustellenadresse für Planung, Logistik und Koordination.",
    "agent.insights.localProjectLocation.reason": "Das Standortfeld ist leer.",
    "agent.insights.localProjectNoTasks.title": "Projekt hat noch keine Aufgaben",
    "agent.insights.localProjectNoTasks.message":
      "Teilen Sie den Auftrag in Phasen und Aufgaben auf, damit das Team weiß, was als Nächstes zu tun ist.",
    "agent.insights.localProjectNoTasks.reason": "Die Aufgabenliste ist leer.",
    "agent.insights.localProjectDocsScope.title": "Anhänge vorhanden, Umfang evtl. unvollständig",
    "agent.insights.localProjectDocsScope.message":
      "Nutzen Sie den KI-Projektassistenten, um Umfang, Phasen und Aufgaben aus Dokumenten zu extrahieren.",
    "agent.insights.localProjectDocsScope.reason":
      "Das Projekt hat Anhänge, aber kein Signal für extrahierten Umfang.",
    "agent.insights.localProjectDocsScope.action.label": "KI-Projektassistent öffnen",
    "agent.insights.localProjectDocsScope.action.description":
      "Plan prüfen oder aus vorhandenen Dokumenten neu erzeugen.",
    "agent.insights.localProjectDocsScope.action.confirmationText": "KI-Projektassistent öffnen",
    "agent.insights.localWizardBriefShort.title": "Projektbeschreibung ist sehr kurz",
    "agent.insights.localWizardBriefShort.message":
      "Ergänzen Sie Details zu Umfang, Ausschlüssen, Terminen und Baustellenbedingungen für einen besseren KI-Entwurf.",
    "agent.insights.localWizardBriefShort.reason": "Die Beschreibung ist kürzer als 40 Zeichen.",
    "agent.insights.localWizardAttachments.title": "Anhänge können den KI-Entwurf unterstützen",
    "agent.insights.localWizardAttachments.message":
      "Fahren Sie mit dem Entwurfsschritt fort, damit Staveto PDFs auswerten und Phasen, Aufgaben und Materialien vorschlagen kann.",
    "agent.insights.localWizardAttachments.reason": "Im Assistenten sind Anhänge vorhanden.",
    "agent.insights.localWizardAttachments.action.label": "Mit KI-Entwurf fortfahren",
    "agent.insights.localWizardAttachments.action.description":
      "Weiter zum KI-Entwurfsschritt mit hochgeladenen Dokumenten.",
    "agent.insights.localWizardAttachments.action.confirmationText": "Mit KI-Entwurf fortfahren",
    "agent.insights.localWizardLocation.title": "Standort ist nicht ausgefüllt",
    "agent.insights.localWizardLocation.message":
      "Ergänzen Sie den Ausführungsort für klarere Planung und Logistik im Entwurf.",
    "agent.insights.localWizardLocation.reason": "Das Standortfeld im Assistenten ist leer.",
    "agent.insights.localDashboardDelayed.title": "Verzögerte Aufträge brauchen Aufmerksamkeit",
    "agent.insights.localDashboardDelayed.message":
      "Prüfen Sie aktive Projekte mit Verzögerungen im aktuellen Arbeitsbereich.",
    "agent.insights.localDashboardDelayed.reason":
      "Das Dashboard meldet verzögerte Aufträge in den Workspace-Kennzahlen.",
    "agent.insights.localDashboardDelayed.action.label": "Projekte öffnen",
    "agent.insights.localDashboardDelayed.action.description":
      "Verzögerte Aufträge in der Projektliste prüfen.",
    "agent.insights.localDashboardNext.title": "Im aktiven Arbeitsbereich starten",
    "agent.insights.localDashboardNext.message":
      "Nutzen Sie Projekte, Angebote und Firmeneinstellungen nur im aktuellen Arbeitsbereich.",
    "agent.insights.localDashboardNext.reason":
      "Dashboard-Hinweise sind auf activeWorkspaceId beschränkt.",
    "agent.insights.localUnsavedChanges.title": "Nicht gespeicherte Änderungen auf diesem Bildschirm",
    "agent.insights.localUnsavedChanges.message":
      "Speichern oder verwerfen Sie Ihre Änderungen, bevor Sie die Seite verlassen.",
    "agent.insights.localUnsavedChanges.reason":
      "Der Bildschirmkontext meldet unsavedChanges=true.",
  },
};
