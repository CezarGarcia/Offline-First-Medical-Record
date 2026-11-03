/**
 * Gravação local (docs/07, seção 7.3): online ou offline, o caminho é um só (D-11). Numa única transação do
 * SQLite, o registro entra como PENDENTE, a fila ganha o item com o JSON exato da requisição e o log local
 * registra a ação. Online, o motor de sincronização envia logo depois.
 */
import { diaEmBrasilia } from '@compartilhado/formatos';
import { uuid7 } from '@compartilhado/ids';
import type { MedicamentoAdministrado, Origem, ProfissionalResumo } from '@compartilhado/tipos';
import {
  type DadosAtendimento,
  type DadosPessoa,
  type DadosProntuario,
  FORMATO_EMAIL,
  validarAtendimento,
  validarPessoa,
  validarProntuario,
} from '@compartilhado/validacao';
import type {
  AtendimentoLocal,
  DestinatarioDoEmail,
  PedidoDeEmailLocal,
  PessoaLocal,
  ProntuarioLocal,
} from '../../comum/contrato';
import type { Auditoria } from './auditoria';
import type { BancoLocal } from './banco';
import type { EstadoConectividade } from './conectividade';
import { ErroDoNucleo } from './erros';
import type { RepositorioAtendimentos } from './repositorios/atendimentos';
import type { RepositorioMedicamentos } from './repositorios/medicamentos';
import type { LinhaDaFila, RepositorioOutbox } from './repositorios/outbox';
import type { RepositorioPessoas } from './repositorios/pessoas';
import type { RepositorioProntuarios } from './repositorios/prontuarios';

interface Dependencias {
  banco: BancoLocal;
  pessoas: RepositorioPessoas;
  prontuarios: RepositorioProntuarios;
  atendimentos: RepositorioAtendimentos;
  medicamentos: RepositorioMedicamentos;
  outbox: RepositorioOutbox;
  auditoria: Auditoria;
  conectividade: EstadoConectividade;
  profissional: () => ProfissionalResumo | null;
  dispositivo: () => { id: string; nome: string } | null;
  agora: () => Date;
}

const vazioViraNulo = (texto: string | null | undefined): string | null => {
  const limpo = texto?.trim();
  return limpo ? limpo : null;
};

export class ServicoDeRegistros {
  constructor(private readonly d: Dependencias) {}

  criarPessoa(dados: DadosPessoa): PessoaLocal {
    const problemas = validarPessoa(dados, diaEmBrasilia(this.d.agora().toISOString()));
    if (problemas.length) throw ErroDoNucleo.validacao(problemas);
    const origem = this.origem();
    const contato = {
      nome: vazioViraNulo(dados.contato?.nome),
      parentesco: vazioViraNulo(dados.contato?.parentesco),
      telefone: vazioViraNulo(dados.contato?.telefone),
      email: vazioViraNulo(dados.contato?.email),
    };
    const temContato = Object.values(contato).some(Boolean);
    const pessoa = {
      id: uuid7(),
      nome: dados.nome.trim(),
      cpf: vazioViraNulo(dados.cpf),
      dataNascimento: dados.dataNascimento ?? null,
      sexo: dados.sexo ?? null,
      telefone: vazioViraNulo(dados.telefone),
      email: vazioViraNulo(dados.email),
      contato: temContato ? contato : null,
      origem,
    };
    // O corpo exato de POST /api/pessoa (docs/06, seção 6.4)
    const payload = { ...pessoa };
    this.d.banco.transacao(() => {
      this.d.pessoas.inserirLocal(pessoa);
      this.enfileirar('CRIAR_PESSOA', pessoa.id, payload, origem);
      this.d.auditoria.registrar('PESSOA_CRIADA', { pessoaId: pessoa.id });
    });
    return this.d.pessoas.buscar(pessoa.id) as PessoaLocal;
  }

  criarProntuario(pessoaId: string, dados: DadosProntuario): ProntuarioLocal {
    if (!this.d.pessoas.buscar(pessoaId)) throw new ErroDoNucleo('NAO_ENCONTRADO', 'Pessoa não encontrada neste aparelho.');
    const problemas = validarProntuario(dados);
    if (problemas.length) throw ErroDoNucleo.validacao(problemas);
    const origem = this.origem();
    const prontuario = {
      id: uuid7(),
      pessoaId,
      tipoSanguineo: dados.tipoSanguineo ?? null,
      alergias: vazioViraNulo(dados.alergias),
      comorbidades: vazioViraNulo(dados.comorbidades),
      medicamentosUsoContinuo: vazioViraNulo(dados.medicamentosUsoContinuo),
      observacoes: vazioViraNulo(dados.observacoes),
      origem,
    };
    this.d.banco.transacao(() => {
      this.d.prontuarios.inserirLocal(prontuario);
      this.enfileirar('CRIAR_PRONTUARIO', prontuario.id, prontuario, origem);
      this.d.auditoria.registrar('PRONTUARIO_CRIADO', { prontuarioId: prontuario.id, pessoaId });
    });
    return this.d.prontuarios.buscar(prontuario.id) as ProntuarioLocal;
  }

  criarAtendimento(prontuarioId: string, dados: DadosAtendimento): AtendimentoLocal {
    if (!this.d.prontuarios.buscar(prontuarioId)) {
      throw new ErroDoNucleo('NAO_ENCONTRADO', 'Prontuário não encontrado neste aparelho.');
    }
    const problemas = validarAtendimento(dados, this.d.agora());
    dados.medicamentos.forEach((m, i) => {
      if (m.medicamentoId && !this.d.medicamentos.buscar(m.medicamentoId)) {
        problemas.push({ campo: `medicamentos.${i}.medicamentoId`, mensagem: 'medicamento não encontrado neste aparelho' });
      }
    });
    if (problemas.length) throw ErroDoNucleo.validacao(problemas);

    const origem = this.origem();
    const glasgow =
      dados.glasgow && dados.glasgow.ocular !== null && dados.glasgow.verbal !== null && dados.glasgow.motora !== null
        ? { ocular: dados.glasgow.ocular, verbal: dados.glasgow.verbal, motora: dados.glasgow.motora }
        : null;
    const sinais = dados.sinaisVitais ?? {};
    const sinaisVitais = {
      paSistolica: sinais.paSistolica ?? null,
      paDiastolica: sinais.paDiastolica ?? null,
      frequenciaCardiaca: sinais.frequenciaCardiaca ?? null,
      frequenciaRespiratoria: sinais.frequenciaRespiratoria ?? null,
      spo2: sinais.spo2 ?? null,
      temperatura: sinais.temperatura ?? null,
      glicemia: sinais.glicemia ?? null,
    };
    const temSinais = Object.values(sinaisVitais).some((v) => v !== null);
    const medicamentos: MedicamentoAdministrado[] = dados.medicamentos.map((m) => ({
      id: uuid7(),
      medicamentoId: m.medicamentoId,
      nome: this.d.medicamentos.buscar(m.medicamentoId)?.nome ?? '',
      dose: m.dose as number,
      unidade: m.unidade,
      via: m.via,
      horario: new Date(m.horario).toISOString(),
      observacao: vazioViraNulo(m.observacao),
    }));
    const atendimento = {
      id: uuid7(),
      prontuarioId,
      dataHora: new Date(dados.dataHora).toISOString(),
      localOcorrencia: vazioViraNulo(dados.localOcorrencia),
      tipoOcorrencia: dados.tipoOcorrencia as NonNullable<DadosAtendimento['tipoOcorrencia']>,
      queixaPrincipal: dados.queixaPrincipal.trim(),
      triagem: {
        protocolo: dados.triagem.protocolo as NonNullable<DadosAtendimento['triagem']['protocolo']>,
        cor: dados.triagem.cor as NonNullable<DadosAtendimento['triagem']['cor']>,
      },
      glasgow: glasgow ? { ...glasgow, total: glasgow.ocular + glasgow.verbal + glasgow.motora } : null,
      sinaisVitais: temSinais ? sinaisVitais : null,
      medicamentos,
      procedimentos: vazioViraNulo(dados.procedimentos),
      desfecho: {
        tipo: dados.desfecho.tipo as NonNullable<DadosAtendimento['desfecho']['tipo']>,
        destino: dados.desfecho.tipo === 'ENCAMINHADO_HOSPITAL' ? vazioViraNulo(dados.desfecho.destino) : null,
      },
      observacoes: vazioViraNulo(dados.observacoes),
      origem,
    };
    // O corpo de POST /api/atendimento: sem o total do Glasgow e sem os nomes (o servidor calcula e preenche)
    const payload = {
      ...atendimento,
      glasgow,
      sinaisVitais: temSinais ? sinaisVitais : null,
      medicamentos: medicamentos.map(({ nome: _nome, ...item }) => item),
    };
    this.d.banco.transacao(() => {
      this.d.atendimentos.inserirLocal(atendimento);
      this.enfileirar('CRIAR_ATENDIMENTO', atendimento.id, payload, origem);
      this.d.auditoria.registrar('ATENDIMENTO_CRIADO', { atendimentoId: atendimento.id, prontuarioId });
    });
    return this.d.atendimentos.buscar(atendimento.id) as AtendimentoLocal;
  }

  /** O pedido de e-mail também passa pela fila: feito offline, sai quando a conexão voltar (D-16). */
  pedirEmail(atendimentoId: string, destinatario: DestinatarioDoEmail): PedidoDeEmailLocal {
    const atendimento = this.d.atendimentos.buscar(atendimentoId);
    if (!atendimento) throw new ErroDoNucleo('NAO_ENCONTRADO', 'Atendimento não encontrado neste aparelho.');
    const prontuario = this.d.prontuarios.buscar(atendimento.prontuarioId);
    const pessoa = prontuario ? this.d.pessoas.buscar(prontuario.pessoaId) : null;
    const email = vazioViraNulo(destinatario.email);
    if (destinatario.tipo === 'OUTRO' && (!email || !FORMATO_EMAIL.test(email))) {
      throw ErroDoNucleo.validacao([{ campo: 'destinatario.email', mensagem: email ? 'formato inválido (esperado: email)' : 'campo obrigatório' }]);
    }
    if (destinatario.tipo === 'PACIENTE' && !pessoa?.email) {
      throw new ErroDoNucleo('PACIENTE_SEM_EMAIL', 'O paciente não tem e-mail no cadastro. Escolha outro destinatário.');
    }
    if (destinatario.tipo === 'FAMILIAR' && !pessoa?.contato?.email) {
      throw new ErroDoNucleo('FAMILIAR_SEM_EMAIL', 'O contato do familiar não tem e-mail no cadastro. Escolha outro destinatário.');
    }
    // O ID do item da fila é o ID do pedido: a chave de idempotência do ms-docs (D-36)
    const id = uuid7();
    const payload = {
      atendimentoId,
      id,
      destinatario: destinatario.tipo === 'OUTRO' ? { tipo: 'OUTRO', email } : { tipo: destinatario.tipo },
    };
    const profissional = this.exigirProfissional();
    this.d.banco.transacao(() => {
      this.d.outbox.adicionar({
        id,
        tipo: 'ENVIAR_EMAIL',
        entidadeId: atendimentoId,
        payload,
        criadoPorId: profissional.id,
        criadoEm: this.d.agora().toISOString(),
      });
      this.d.auditoria.registrar('EMAIL_SOLICITADO', { atendimentoId, pedidoId: id, destinatario: destinatario.tipo });
    });
    return pedidoDeEmail(this.d.outbox.buscar(id) as LinhaDaFila);
  }

  emailsDoAtendimento(atendimentoId: string): PedidoDeEmailLocal[] {
    return this.d.outbox.doTipo('ENVIAR_EMAIL', atendimentoId).map(pedidoDeEmail);
  }

  private enfileirar(tipo: 'CRIAR_PESSOA' | 'CRIAR_PRONTUARIO' | 'CRIAR_ATENDIMENTO', entidadeId: string, payload: unknown, origem: Origem): void {
    this.d.outbox.adicionar({ id: uuid7(), tipo, entidadeId, payload, criadoPorId: origem.criadoPorId, criadoEm: origem.criadoEm });
  }

  /** Quem, quando, onde e como (docs/05, bloco de origem). O modo é a posição da chave na hora de salvar. */
  private origem(): Origem {
    const profissional = this.exigirProfissional();
    const dispositivo = this.d.dispositivo();
    return {
      criadoPorId: profissional.id,
      criadoPorNome: profissional.nome,
      criadoPorRegistro: `${profissional.tipoRegistro} ${profissional.registro}`,
      criadoEm: this.d.agora().toISOString(),
      dispositivoId: dispositivo?.id ?? null,
      dispositivoNome: dispositivo?.nome ?? null,
      modo: this.d.conectividade.atual,
    };
  }

  private exigirProfissional(): ProfissionalResumo {
    const profissional = this.d.profissional();
    if (!profissional) throw ErroDoNucleo.semSessao();
    return profissional;
  }
}

export function pedidoDeEmail(linha: LinhaDaFila): PedidoDeEmailLocal {
  const payload = JSON.parse(linha.payload) as { atendimentoId: string; destinatario: DestinatarioDoEmail };
  return {
    id: linha.id,
    atendimentoId: payload.atendimentoId,
    destinatario: payload.destinatario,
    status: linha.status,
    ultimoErro: linha.ultimo_erro,
    resultado: linha.resultado ? JSON.parse(linha.resultado) : null,
    criadoEm: linha.criado_em,
  };
}
