/**
 * Identité de marque centralisée. Pour renommer l'application, modifier ce fichier
 * (ou surcharger via les variables d'environnement NEXT_PUBLIC_APP_NAME côté web).
 */
export const brand = {
  appName: 'Mimo',
  shortName: 'Mimo',
  tagline: 'Le compagnon qui grandit avec ta famille',
  description:
    'Mimo est un compagnon virtuel bienveillant pour les enfants, piloté par les parents.',
  themeColor: '#7c5cff',
  backgroundColor: '#fff8f0',
  /** Domaine utilisé dans les e-mails de démonstration. Jamais en production. */
  demoEmailDomain: 'mimo.local',
} as const;

export type Brand = typeof brand;
