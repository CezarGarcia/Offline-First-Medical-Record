import type { DetalheDeErro, RespostaDeErro } from '@compartilhado/tipos';

/** Resposta de erro da API, no formato padrão {erro, mensagem, detalhes} (docs/06, seção 6.5). */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes: DetalheDeErro[] = [],
    readonly corpo: RespostaDeErro | null = null,
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }
}

/** O servidor não respondeu (rede caiu, VM fora do ar). */
export class ErroDeRede extends Error {
  constructor() {
    super('Não foi possível falar com o servidor. Confira a conexão e tente de novo.');
    this.name = 'ErroDeRede';
  }
}

export async function erroDaResposta(resposta: Response): Promise<ErroDaApi> {
  let corpo: RespostaDeErro | null = null;
  try {
    corpo = (await resposta.json()) as RespostaDeErro;
  } catch {
    corpo = null;
  }
  if (corpo && typeof corpo.erro === 'string') {
    return new ErroDaApi(resposta.status, corpo.erro, corpo.mensagem, corpo.detalhes ?? [], corpo);
  }
  return new ErroDaApi(resposta.status, 'ERRO_INTERNO', `O servidor respondeu com erro (${resposta.status}).`);
}

/** Texto para mostrar ao usuário, incluindo os campos com problema de um erro de validação. */
export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof ErroDaApi) {
    if (erro.detalhes.length === 0) return erro.message;
    return `${erro.message} ${erro.detalhes.map((d) => `${d.campo}: ${d.mensagem}`).join('; ')}.`;
  }
  if (erro instanceof Error) return erro.message;
  return 'Erro inesperado.';
}
