import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import { DataHora, Modo, Nulavel, Paginacao, Uuid } from '../esquemas.js';
import { profissionalLogado } from '../plugins/autenticacao.js';
import type { RepositorioLogs } from '../repositorios/logs.js';

const MAX_LOGS_POR_LOTE = 500;

const LogDoCliente = Type.Object(
  {
    id: Uuid,
    profissionalId: Type.Optional(Nulavel(Uuid)),
    dispositivoId: Uuid,
    dispositivoNome: Type.Optional(Nulavel(Type.String({ maxLength: 100 }))),
    dataHora: DataHora,
    acao: Type.String({ pattern: '^[A-Z][A-Z_]{1,49}$' }),
    modo: Modo,
    detalhes: Type.Optional(Nulavel(Type.Record(Type.String(), Type.Unknown()))),
  },
  { additionalProperties: false },
);

const CorpoLogs = Type.Object(
  { logs: Type.Array(LogDoCliente, { maxItems: MAX_LOGS_POR_LOTE }) },
  { additionalProperties: false },
);

const FiltroAcesso = Type.Object({
  servico: Type.Optional(Type.String({ maxLength: 30 })),
  profissionalId: Type.Optional(Uuid),
  metodo: Type.Optional(Type.String({ maxLength: 10 })),
  status: Type.Optional(Type.Integer({ minimum: 100, maximum: 599 })),
  rota: Type.Optional(Type.String({ maxLength: 200 })),
  de: Type.Optional(DataHora),
  ate: Type.Optional(DataHora),
  ...Paginacao,
});

const FiltroCliente = Type.Object({
  profissionalId: Type.Optional(Uuid),
  dispositivoId: Type.Optional(Uuid),
  acao: Type.Optional(Type.String({ maxLength: 50 })),
  modo: Type.Optional(Modo),
  de: Type.Optional(DataHora),
  ate: Type.Optional(DataHora),
  ...Paginacao,
});

const LogAcesso = Type.Object({
  id: Uuid,
  dataHora: DataHora,
  servico: Type.String(),
  ipCliente: Type.String(),
  profissionalId: Nulavel(Uuid),
  metodo: Type.String(),
  rota: Type.String(),
  statusCode: Type.Integer(),
  tempoMs: Type.Integer(),
  dispositivoId: Nulavel(Uuid),
  userAgent: Nulavel(Type.String()),
});

const LogClienteSalvo = Type.Object({
  id: Uuid,
  profissionalId: Nulavel(Uuid),
  dispositivoId: Uuid,
  dispositivoNome: Nulavel(Type.String()),
  dataHora: DataHora,
  acao: Type.String(),
  modo: Modo,
  detalhes: Nulavel(Type.Record(Type.String(), Type.Unknown())),
  enviadoPorId: Uuid,
  recebidoEm: DataHora,
});

const paginaDe = <T extends ReturnType<typeof Type.Object>>(item: T) =>
  Type.Object({ itens: Type.Array(item), pagina: Type.Integer(), tamanho: Type.Integer(), total: Type.Integer() });

const iso = (valor: unknown) => (valor instanceof Date ? valor.toISOString() : String(valor));

export const rotasLogs: FastifyPluginAsyncTypebox<{ logs: RepositorioLogs }> = async (app, { logs }) => {
  app.post(
    '/api/log',
    {
      schema: {
        tags: ['auditoria'],
        summary: 'Recebe um lote de logs do app cliente (ações feitas no aparelho, principalmente offline)',
        body: CorpoLogs,
        response: {
          200: Type.Object({ recebidos: Type.Integer(), novos: Type.Integer(), repetidos: Type.Integer() }),
        },
      },
    },
    async (req) => {
      const recebidos = req.body.logs.length;
      const novos = await logs.inserirLogsDoCliente(req.body.logs, profissionalLogado(req).id);
      return { recebidos, novos, repetidos: recebidos - novos };
    },
  );

  app.get(
    '/api/log/acesso',
    {
      config: { somenteAdmin: true },
      schema: {
        tags: ['auditoria'],
        summary: 'Log de acesso dos três serviços (mais recente primeiro). Só administradores.',
        querystring: FiltroAcesso,
        response: { 200: paginaDe(LogAcesso) },
      },
    },
    async (req) => {
      const { pagina, tamanho, ...filtro } = req.query;
      const resultado = await logs.listarAcesso(filtro, pagina, tamanho);
      return {
        ...resultado,
        itens: resultado.itens.map((l) => ({
          id: String(l.id),
          dataHora: iso(l.data_hora),
          servico: String(l.servico),
          ipCliente: String(l.ip_cliente),
          profissionalId: (l.profissional_id as string | null) ?? null,
          metodo: String(l.metodo),
          rota: String(l.rota),
          statusCode: Number(l.status_code),
          tempoMs: Number(l.tempo_ms),
          dispositivoId: (l.dispositivo_id as string | null) ?? null,
          userAgent: (l.user_agent as string | null) ?? null,
        })),
      };
    },
  );

  app.get(
    '/api/log/cliente',
    {
      config: { somenteAdmin: true },
      schema: {
        tags: ['auditoria'],
        summary: 'Logs enviados pelos apps clientes (mais recente primeiro). Só administradores.',
        querystring: FiltroCliente,
        response: { 200: paginaDe(LogClienteSalvo) },
      },
    },
    async (req) => {
      const { pagina, tamanho, ...filtro } = req.query;
      const resultado = await logs.listarDoCliente(filtro, pagina, tamanho);
      return {
        ...resultado,
        itens: resultado.itens.map((l) => ({
          id: String(l.id),
          profissionalId: (l.profissional_id as string | null) ?? null,
          dispositivoId: String(l.dispositivo_id),
          dispositivoNome: (l.dispositivo_nome as string | null) ?? null,
          dataHora: iso(l.data_hora),
          acao: String(l.acao),
          modo: l.modo as 'ONLINE' | 'OFFLINE',
          detalhes: (l.detalhes as Record<string, unknown> | null) ?? null,
          enviadoPorId: String(l.enviado_por_id),
          recebidoEm: iso(l.recebido_em),
        })),
      };
    },
  );
};
