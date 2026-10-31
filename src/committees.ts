/**
 * =======================================================================
 * MONUMENT MUN 2027 — CENTRAL COMMITTEES CONFIGURATION
 * =======================================================================
 * Edit this array to replace TBA committees with real committee names,
 * agendas, and descriptions later in one single place.
 * =======================================================================
 */

export interface CommitteeItem {
  id: string; // Identifier used for registrations & database
  name: string; // Committee title (currently TBA)
  monument: string; // Associated monument name
  location: string; // Monument country / location
  agenda: string; // Committee debate topic / agenda
  description: string; // Short summary note
  sentence?: string; // Optional historical note
  layerIndex: number; // Index 0 to 6 for monument artwork
  label: string; // Select option label for forms
}

export const MONUMENT_COMMITTEES: CommitteeItem[] = [
  {
    id: 'Committee 1 (TBA)',
    name: 'Committee 1 (TBA)',
    monument: 'Statue of Liberty',
    location: 'New York, United States',
    agenda: 'To be announced soon',
    description: 'Committee simulation, agenda topic and delegate dossier will be announced soon.',
    layerIndex: 0,
    label: 'Committee 1 (TBA) · Statue of Liberty'
  },
  {
    id: 'Committee 2 (TBA)',
    name: 'Committee 2 (TBA)',
    monument: 'Petra',
    location: 'Jordan',
    agenda: 'To be announced soon',
    description: 'Committee simulation, agenda topic and delegate dossier will be announced soon.',
    layerIndex: 1,
    label: 'Committee 2 (TBA) · Petra'
  },
  {
    id: 'Committee 3 (TBA)',
    name: 'Committee 3 (TBA)',
    monument: 'The Pyramids',
    location: 'Giza, Egypt',
    agenda: 'To be announced soon',
    description: 'Committee simulation, agenda topic and delegate dossier will be announced soon.',
    sentence: 'The oldest wonder on the list and the only ancient one still standing.',
    layerIndex: 2,
    label: 'Committee 3 (TBA) · Pyramids'
  },
  {
    id: 'Committee 4 (TBA)',
    name: 'Committee 4 (TBA)',
    monument: 'Eiffel Tower',
    location: 'Paris, France',
    agenda: 'To be announced soon',
    description: 'Committee simulation, agenda topic and delegate dossier will be announced soon.',
    layerIndex: 3,
    label: 'Committee 4 (TBA) · Eiffel Tower'
  },
  {
    id: 'Committee 5 (TBA)',
    name: 'Committee 5 (TBA)',
    monument: 'Chichén Itzá',
    location: 'Mexico',
    agenda: 'To be announced soon',
    description: 'Committee simulation, agenda topic and delegate dossier will be announced soon.',
    layerIndex: 4,
    label: 'Committee 5 (TBA) · Chichén Itzá'
  },
  {
    id: 'Committee 6 (TBA)',
    name: 'Committee 6 (TBA)',
    monument: 'Colosseum',
    location: 'Rome, Italy',
    agenda: 'To be announced soon',
    description: 'Committee simulation, agenda topic and delegate dossier will be announced soon.',
    layerIndex: 5,
    label: 'Committee 6 (TBA) · Colosseum'
  },
  {
    id: 'Committee 7 (TBA)',
    name: 'Committee 7 (TBA)',
    monument: 'Taj Mahal',
    location: 'Agra, India',
    agenda: 'To be announced soon',
    description: 'Committee simulation, agenda topic and delegate dossier will be announced soon.',
    layerIndex: 6,
    label: 'Committee 7 (TBA) · Taj Mahal'
  }
];

export const COMMITTEE_OPTIONS = MONUMENT_COMMITTEES.map((c) => c.name);
