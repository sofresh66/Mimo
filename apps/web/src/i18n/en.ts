import type { DeepPartial } from './types';
import type { Messages } from './fr';

/** Traduction anglaise (partielle) : les clés absentes retombent sur le français. */
const en: DeepPartial<Messages> = {
  common: {
    loading: 'Loading…',
    back: 'Back',
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    continue: 'Continue',
    level: 'Level {level}',
  },
  welcome: {
    title: 'Welcome to {app}',
    tagline: 'The companion that grows with your family',
    whoPlays: 'Who is playing?',
    parentSpace: 'Parent area',
    login: 'Sign in',
    register: 'Create a parent account',
  },
  child: {
    hello: 'Hello {name} 👋',
    play: 'Play',
    feed: 'Feed',
    explore: 'Explore',
    missions: 'Missions',
    inventory: 'Inventory',
    collection: 'Creaturepedia',
  },
};

export default en;
