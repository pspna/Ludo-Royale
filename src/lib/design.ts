// Shared product tokens. Board colors remain theme-aware for owned customizations.
export const DESIGN = {
  colors: { background: '#FAF7FF', secondary: '#F3EDFF', surface: '#FFFFFF',
    lavender: '#EEE2FF', text: '#11122E', muted: '#555674', border: '#E7DDF5',
    purple: '#7427E8', violet: '#A43DFF', pink: '#FF347A', gold: '#FFC928', blue: '#238CFF' },
  space: { xs: 4, sm: 8, md: 12, lg: 20, xl: 28, section: 32 },
  radius: { control: 14, card: 22, hero: 28, pill: 999 },
  type: { title: 28, heading: 20, body: 14, caption: 12 },
  motion: { step: 145, press: 120 },
  layout: { homeMax: 1080, gameMax: 900, boardMax: 620, touch: 44 },
  pastels: { create_room: '#FFE8F0', join_room: '#E5F8ED', classic: '#EEE2FF',
    quick: '#FFF1CF', practice: '#E4F0FF' },
} as const;
