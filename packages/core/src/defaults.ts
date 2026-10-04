/** Configuration par défaut d'un nouveau compte client créé « à partir de rien ». */

export interface AccountSettings {
  intro: string; // bandeau d'introduction de la section Program Management
  kanbanGuide: string; // mode d'emploi de l'onglet Kanban
  governanceIntro: string; // callout de la comitologie
  governanceInternalTitle: string;
  governanceJointTitle: string;
  governanceInternalSupportLabel: string; // « Support »
  governanceJointSupportLabel: string; // « Piloté par »
  sprintMethodology: string;
  labels: {
    leader: string; // « Leader Wifirst »
    prescriber: string; // « Prescripteur La Poste »
  };
}

export interface AccountModules {
  program: boolean;
  finance: boolean;
  provisioning: boolean;
}

export const defaultModules: AccountModules = { program: true, finance: true, provisioning: true };

export function defaultSettings(clientName: string): AccountSettings {
  return {
    intro: `Pilotage du compte ${clientName} : faits marquants, cartes en vigilance ou en alerte, kanban du sprint en cours, séances et gouvernance.`,
    kanbanGuide: [
      "**Créer un livrable** : bouton « Nouvelle carte » du kanban ou d'une colonne.",
      "**Vigilance / Alerte** : renseigner le niveau sur la carte et détailler dans Alertes / arbitrages ; sans vigilance ni alerte, les actions vont dans Prochaines étapes. La carte remonte dans « Cartes en vigilance ou en alerte » jusqu'à ce qu'elle soit terminée.",
      "**Déplacer une carte** : glisser-déposer entre colonnes, ou changer son statut dans la carte.",
      "**Changer de sprint** : onglet Gouvernance, tableau Sprints, bouton « Basculer au sprint suivant » (les cartes non terminées suivent).",
    ].join("\n"),
    governanceIntro: "Deux étages : ce que nous pilotons en interne, et ce que nous partageons avec le client.",
    governanceInternalTitle: "Comitologie interne Wifirst",
    governanceJointTitle: `Comitologie conjointe avec ${clientName}`,
    governanceInternalSupportLabel: "Support",
    governanceJointSupportLabel: "Piloté par",
    sprintMethodology:
      "Le build est découpé en sprints qui se terminent sur une échéance client. Chaque sprint porte au maximum cinq à dix livrables par stream, suivis en Program weekly.",
    labels: { leader: "Leader Wifirst", prescriber: `Prescripteur ${clientName}` },
  };
}

type OptionSeed = { label: string; emoji?: string; color?: string; meta?: Record<string, unknown> };

export const defaultOptions: Record<string, OptionSeed[]> = {
  CARD_STATUS: [
    { label: "À faire", color: "slate" },
    { label: "En cours", color: "blue" },
    { label: "Standby", color: "amber" },
    { label: "Terminé", color: "teal", meta: { done: true } },
  ],
  ALERT_LEVEL: [
    { label: "Vigilance", emoji: "🟡", color: "amber" },
    { label: "Alerte", emoji: "🔴", color: "red" },
  ],
  HIGHLIGHT_TYPE: [
    { label: "Avancée", emoji: "✅", color: "teal" },
    { label: "Jalon atteint", emoji: "🏁", color: "blue" },
    { label: "Décision", emoji: "⚖️", color: "violet" },
    { label: "Difficulté", emoji: "⚠️", color: "red" },
  ],
  STREAM_STATUS: [
    { label: "Avancement nominal", emoji: "🟢", color: "teal" },
    { label: "Attente prérequis client", emoji: "🟠", color: "ocre" },
    { label: "Alerte", emoji: "🔴", color: "red" },
  ],
  TOPIC_THEME: [
    { label: "Build", color: "blue" },
    { label: "Run", color: "teal" },
    { label: "Commercial", color: "ocre" },
  ],
  TOPIC_NATURE: [
    { label: "Alerte", emoji: "🔴", color: "red" },
    { label: "Arbitrage", emoji: "⚖️", color: "violet" },
    { label: "Information", emoji: "ℹ️", color: "blue" },
  ],
  RISK_TYPE: [
    { label: "Risque", color: "red" },
    { label: "Arbitrage", color: "violet" },
  ],
  RISK_STATUS: [
    { label: "Ouvert", color: "amber" },
    { label: "Arbitré", color: "blue" },
    { label: "Clos", color: "teal", meta: { closed: true } },
  ],
  RISK_CRITICALITY: [
    { label: "Haute", color: "red" },
    { label: "Moyenne", color: "amber" },
    { label: "Basse", color: "slate" },
  ],
};

export const defaultMeetingTypes = [
  {
    name: "Program weekly",
    emoji: "📰",
    frequency: "Hebdomadaire",
    description: "Revue des livrables du sprint, faits marquants de la semaine et alertes.",
    blocks: ["HIGHLIGHTS", "ALERT_CARDS", "PLANNING"] as const,
    settings: {},
    guide:
      "**Nouvelle séance** : bouton « Nouvelle séance » (vide) ou « À partir de la précédente » (faits marquants recopiés à la nouvelle date, on ne modifie ensuite que ce qui a changé).",
  },
  {
    name: "Comité projet client",
    emoji: "📊",
    frequency: "Hebdomadaire",
    description: "Statut des streams présenté au client à chaque comité projet.",
    blocks: ["STREAM_STATUS"] as const,
    settings: { statusLabel: "Statut", progressLabel: "Avancement", alertsLabel: "Alertes & prérequis client" },
    guide:
      "**Nouvelle séance** : les streams marqués « ligne de séance » sont créés vides. « À partir de la précédente » recopie statuts, avancement et alertes.",
  },
  {
    name: "Strategic Committee",
    emoji: "🎯",
    frequency: "Hebdomadaire pendant le build",
    description: "Vision macro du compte, alertes et arbitrages au niveau management.",
    blocks: ["TOPICS"] as const,
    settings: { decisionLabel: "Arbitrage ou décision demandée" },
    guide:
      "**En séance** : saisir les décisions dans « Arbitrage ou décision demandée » sur une ligne « Décision : … ». « À partir de la précédente » recopie les sujets sans les lignes « Décision : … ».",
  },
];
