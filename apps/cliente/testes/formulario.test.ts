/** O formulário do atendimento: datas no horário de Brasília, a conversão para a API e as regras (docs/09). */
import { doCampoDeDataHora, paraCampoDeDataHora } from '@compartilhado/formatos';
import { validarAtendimento } from '@compartilhado/validacao';
import { describe, expect, it } from 'vitest';
import { type FormularioDoAtendimento, formularioVazio, paraDados } from '../src/renderer/src/formularios/dadosDoAtendimento';

const campos = (f: FormularioDoAtendimento) => validarAtendimento(paraDados(f), new Date()).map((p) => p.campo);

function preenchido(): FormularioDoAtendimento {
  return {
    ...formularioVazio(),
    dataHora: '2026-11-03 10:05:00',
    localOcorrencia: '  BR-386, km 350 ',
    tipoOcorrencia: 'TRAUMA',
    queixaPrincipal: 'Colisão de moto',
    protocolo: 'MANCHESTER',
    cor: 'AMARELO',
    glasgow: { ocular: '4', verbal: '5', motora: '6' },
    sinais: { paSistolica: 130, paDiastolica: 85, frequenciaCardiaca: '', frequenciaRespiratoria: '', spo2: 97, temperatura: 36.6, glicemia: '' },
    medicamentos: [
      {
        chave: 1,
        medicamentoId: '0193f000-0000-7000-8000-000000000501',
        dose: 0.5,
        unidade: 'G',
        via: 'INTRAVENOSA',
        horario: '2026-11-03 10:20:00',
        observacao: '',
      },
    ],
    desfecho: 'LIBERADO_NO_LOCAL',
    destino: 'Hospital que não vale (desfecho não é encaminhamento)',
  };
}

describe('datas e horas no horário de Brasília (D-23)', () => {
  it('o campo mostra a hora de Brasília, qualquer que seja o fuso do computador', () => {
    expect(paraCampoDeDataHora('2026-11-03T13:05:09Z')).toBe('2026-11-03 10:05:09');
    expect(paraCampoDeDataHora('2026-11-04T02:30:00Z')).toBe('2026-11-03 23:30:00');
  });

  it('e volta como instante UTC (Brasília é UTC−3)', () => {
    expect(doCampoDeDataHora('2026-11-03 10:05:00')).toBe('2026-11-03T13:05:00.000Z');
    expect(doCampoDeDataHora('2026-11-03 23:30')).toBe('2026-11-04T02:30:00.000Z');
    expect(doCampoDeDataHora(paraCampoDeDataHora('2026-01-15T08:00:00.000Z'))).toBe('2026-01-15T08:00:00.000Z');
    expect(doCampoDeDataHora('')).toBeNull();
    expect(doCampoDeDataHora('03/11/2026 10:05')).toBeNull();
  });
});

describe('formulário do atendimento → pedido do núcleo', () => {
  it('vazio: só os obrigatórios aparecem (a data e a hora já vêm com o agora)', () => {
    expect(campos(formularioVazio()).sort()).toEqual(['desfecho.tipo', 'queixaPrincipal', 'tipoOcorrencia', 'triagem.cor']);
  });

  it('preenchido: no formato da API, sem erros', () => {
    const f = preenchido();
    expect(campos(f)).toEqual([]);
    const dados = paraDados(f);
    expect(dados.dataHora).toBe('2026-11-03T13:05:00.000Z');
    expect(dados.glasgow).toEqual({ ocular: 4, verbal: 5, motora: 6 });
    // Sinal vital em branco é "não medido" (null), não zero
    expect(dados.sinaisVitais).toEqual({
      paSistolica: 130,
      paDiastolica: 85,
      frequenciaCardiaca: null,
      frequenciaRespiratoria: null,
      spo2: 97,
      temperatura: 36.6,
      glicemia: null,
    });
    expect(dados.medicamentos).toEqual([
      {
        medicamentoId: '0193f000-0000-7000-8000-000000000501',
        dose: 0.5,
        unidade: 'G',
        via: 'INTRAVENOSA',
        horario: '2026-11-03T13:20:00.000Z',
        observacao: '',
      },
    ]);
    // O destino só vale para "encaminhado ao hospital"
    expect(dados.desfecho).toEqual({ tipo: 'LIBERADO_NO_LOCAL', destino: null });
  });

  it('Glasgow: os três itens, ou nenhum', () => {
    expect(paraDados({ ...preenchido(), glasgow: { ocular: null, verbal: null, motora: null } }).glasgow).toBeNull();
    expect(campos({ ...preenchido(), glasgow: { ocular: '4', verbal: null, motora: '6' } })).toEqual(['glasgow']);
  });

  it('encaminhado ao hospital pede o destino', () => {
    expect(campos({ ...preenchido(), desfecho: 'ENCAMINHADO_HOSPITAL', destino: '  ' })).toEqual(['desfecho.destino']);
    expect(paraDados({ ...preenchido(), desfecho: 'ENCAMINHADO_HOSPITAL', destino: 'HBB' }).desfecho.destino).toBe('HBB');
  });

  it('cor de outro protocolo não passa (o START não tem laranja)', () => {
    expect(campos({ ...preenchido(), protocolo: 'START', cor: 'LARANJA' })).toEqual(['triagem.cor']);
  });

  it('sinais vitais: faixa, número inteiro e uma casa decimal na temperatura (como no servidor)', () => {
    const sinais = preenchido().sinais;
    expect(campos({ ...preenchido(), sinais: { ...sinais, spo2: 101 } })).toEqual(['sinaisVitais.spo2']);
    expect(campos({ ...preenchido(), sinais: { ...sinais, frequenciaCardiaca: 98.5 } })).toEqual(['sinaisVitais.frequenciaCardiaca']);
    expect(campos({ ...preenchido(), sinais: { ...sinais, temperatura: 36.65 } })).toEqual(['sinaisVitais.temperatura']);
    expect(campos({ ...preenchido(), sinais: { ...sinais, temperatura: 24.9 } })).toEqual(['sinaisVitais.temperatura']);
  });

  it('medicamento: escolhido do catálogo, dose maior que zero e no máximo 3 casas, via e horário', () => {
    const [linha] = preenchido().medicamentos;
    const com = (mudancas: object) => campos({ ...preenchido(), medicamentos: [{ ...linha!, ...mudancas }] });
    expect(com({ medicamentoId: null })).toEqual(['medicamentos.0.medicamentoId']);
    expect(com({ dose: '' })).toEqual(['medicamentos.0.dose']);
    expect(com({ dose: 0 })).toEqual(['medicamentos.0.dose']);
    expect(com({ dose: 1.0005 })).toEqual(['medicamentos.0.dose']);
    expect(com({ dose: 10_000_000 })).toEqual(['medicamentos.0.dose']);
    expect(com({ via: null, unidade: null })).toEqual(['medicamentos.0.unidade', 'medicamentos.0.via']);
    expect(com({ horario: null })).toEqual(['medicamentos.0.horario']);
  });

  it('data no futuro não passa (um minuto de folga para o relógio do aparelho)', () => {
    const daqui = (ms: number) => paraCampoDeDataHora(new Date(Date.now() + ms).toISOString());
    expect(campos({ ...preenchido(), dataHora: daqui(10 * 60_000) })).toEqual(['dataHora']);
    expect(campos({ ...preenchido(), dataHora: daqui(-60_000) })).toEqual([]);
  });
});
