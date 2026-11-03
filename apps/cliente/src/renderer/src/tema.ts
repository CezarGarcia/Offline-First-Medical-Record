import { type MantineColorsTuple, createTheme } from '@mantine/core';

// Azul do MedicalField (o mesmo do cabeçalho do PDF, #0b5394)
const marca: MantineColorsTuple = [
  '#e7f1fb',
  '#cfdff2',
  '#a1bde4',
  '#6f99d6',
  '#467bca',
  '#2c68c3',
  '#1d5ebf',
  '#0b5394',
  '#004487',
  '#003a78',
];

export const tema = createTheme({
  primaryColor: 'marca',
  colors: { marca },
  primaryShade: 7,
  defaultRadius: 'md',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
  headings: { fontWeight: '700' },
});
