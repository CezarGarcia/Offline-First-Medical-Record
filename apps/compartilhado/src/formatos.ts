/**
 * Formatação para as telas: datas no horário de Brasília (D-23), CPF, telefone, números com vírgula.
 * Sem dependências: o portal e o app cliente usam o mesmo arquivo.
 */

export const FUSO_HORARIO = 'America/Sao_Paulo';

const partesDaData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_HORARIO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partes(iso: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const parte of partesDaData.formatToParts(new Date(iso))) resultado[parte.type] = parte.value;
  return resultado;
}

/** "28/10/2026 11:20" no horário de Brasília. */
export function dataHora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const p = partes(iso);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** "28/10/2026 11:20:05": para os logs, onde os segundos importam. */
export function dataHoraComSegundos(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const p = partes(iso);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** "11:20" no horário de Brasília. */
export function hora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const p = partes(iso);
  return `${p.hour}:${p.minute}`;
}

/** O dia (AAAA-MM-DD) em Brasília de um instante: usado para filtrar por período. */
export function diaEmBrasilia(iso: string): string {
  const p = partes(iso);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * O instante UTC em que começa (ou termina) um dia em Brasília, para os filtros "de" e "até" das rotas.
 * Brasília está em UTC−3 o ano inteiro desde 2019 (sem horário de verão).
 */
export function inicioDoDia(dia: string): string {
  return new Date(`${dia}T00:00:00.000-03:00`).toISOString();
}

export function fimDoDia(dia: string): string {
  return new Date(`${dia}T23:59:59.999-03:00`).toISOString();
}

/** "1980-05-10" vira "10/05/1980" (data sem hora: não depende de fuso). */
export function data(dia: string | null | undefined): string | null {
  if (!dia) return null;
  const [ano, mes, diaDoMes] = dia.split('-');
  return `${diaDoMes}/${mes}/${ano}`;
}

/** Idade em anos completos na data de referência (AAAA-MM-DD). */
export function idade(nascimento: string | null | undefined, referencia: string): number | null {
  if (!nascimento || nascimento > referencia) return null;
  const [an, mn, dn] = nascimento.split('-').map(Number) as [number, number, number];
  const [ar, mr, dr] = referencia.split('-').map(Number) as [number, number, number];
  let anos = ar - an;
  if (mr < mn || (mr === mn && dr < dn)) anos -= 1;
  return anos;
}

export function cpf(valor: string | null | undefined): string | null {
  if (!valor) return null;
  return /^\d{11}$/.test(valor) ? `${valor.slice(0, 3)}.${valor.slice(3, 6)}.${valor.slice(6, 9)}-${valor.slice(9)}` : valor;
}

/** Com DDD: "(51) 99999-0000" ou "(51) 3714-0000". Outros formatos aparecem como vieram. */
export function telefone(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const d = valor.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

const formatoDeNumero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3, useGrouping: false });

/** Com vírgula e sem zeros à toa: 200 → "200", 0.5 → "0,5", 36.6 → "36,6". */
export function numero(valor: number | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  return formatoDeNumero.format(valor);
}

/** O número da ficha: os 8 últimos caracteres do ID, em maiúsculas (D-37). */
export function numeroDaFicha(id: string): string {
  return id.replace(/-/g, '').slice(-8).toUpperCase();
}

export function gravidadeGlasgow(total: number): string {
  if (total >= 13) return 'leve';
  if (total >= 9) return 'moderado';
  return 'grave';
}

/** Para buscas: sem acento e sem diferença entre maiúsculas e minúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
