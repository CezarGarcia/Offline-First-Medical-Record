import { describe, expect, it } from 'vitest';
import {
  cpf,
  data,
  dataHora,
  diaEmBrasilia,
  fimDoDia,
  gravidadeGlasgow,
  idade,
  inicioDoDia,
  normalizar,
  numero,
  numeroDaFicha,
  telefone,
} from '@compartilhado/formatos';
import { eUuid, uuid7 } from '@compartilhado/ids';
import { COR, DESFECHO, rotulo } from '@compartilhado/rotulos';
import { origemDoAcesso } from '../src/paginas/LogsAcesso';

describe('formatos compartilhados (portal e app cliente)', () => {
  it('mostra datas no horário de Brasília, seja qual for o fuso do computador', () => {
    expect(dataHora('2026-10-28T14:20:00Z')).toBe('28/10/2026 11:20');
    expect(dataHora(null)).toBeNull();
    // 02:30 UTC ainda é o dia anterior em Brasília
    expect(diaEmBrasilia('2026-10-29T02:30:00Z')).toBe('2026-10-28');
    expect(inicioDoDia('2026-11-03')).toBe('2026-11-03T03:00:00.000Z');
    expect(fimDoDia('2026-11-03')).toBe('2026-11-04T02:59:59.999Z');
    expect(data('1980-05-10')).toBe('10/05/1980');
  });

  it('formata CPF, telefone e números como no PDF', () => {
    expect(cpf('52998224725')).toBe('529.982.247-25');
    expect(telefone('51999990000')).toBe('(51) 99999-0000');
    expect(telefone('5137140000')).toBe('(51) 3714-0000');
    expect(numero(200)).toBe('200');
    expect(numero(0.5)).toBe('0,5');
    expect(numero(36.6)).toBe('36,6');
  });

  it('calcula idade, número da ficha e gravidade do Glasgow', () => {
    expect(idade('1980-05-10', '2026-05-09')).toBe(45);
    expect(idade('1980-05-10', '2026-05-10')).toBe(46);
    expect(idade('2030-01-01', '2026-05-10')).toBeNull();
    expect(numeroDaFicha('01a1a16c-e8b4-79bf-94b4-e9b2eedfce8c')).toBe('EEDFCE8C');
    expect([15, 12, 8].map(gravidadeGlasgow)).toEqual(['leve', 'moderado', 'grave']);
  });

  it('busca sem acento e sem diferença de maiúsculas', () => {
    expect(normalizar('  João ')).toBe('joao');
  });

  it('gera UUID v7 em ordem de criação', () => {
    const primeiro = uuid7(Date.parse('2026-11-03T12:00:00Z'));
    const segundo = uuid7(Date.parse('2026-11-03T12:00:01Z'));
    expect(eUuid(primeiro)).toBe(true);
    expect(primeiro[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(primeiro[19]);
    expect(primeiro < segundo).toBe(true);
  });

  it('traduz os valores das listas fixas e mantém valores desconhecidos', () => {
    expect(rotulo(COR, 'LARANJA')).toBe('Laranja');
    expect(rotulo(DESFECHO, 'ENCAMINHADO_HOSPITAL')).toBe('Encaminhado ao hospital');
    expect(rotulo<string>(COR, 'ROXO')).toBe('ROXO');
  });

  it('resume a origem de um acesso pelo user-agent', () => {
    expect(origemDoAcesso('ms-docs')).toBe('ms-docs (interno)');
    expect(origemDoAcesso('PostmanRuntime/7.43.0')).toBe('Postman');
    expect(origemDoAcesso('Mozilla/5.0 (Windows NT 10.0) Chrome/140')).toBe('Navegador (portal)');
    expect(origemDoAcesso(null)).toBe('—');
  });
});
