import type { FastifyInstance } from 'fastify';
import { SERVICO } from '../config.js';
import type { RepositorioLogs } from '../repositorios/logs.js';

declare module 'fastify' {
  interface FastifyRequest {
    inicioEm: bigint;
    dataHoraInicio: Date | null;
    /** ID do profissional autenticado, para o log de acesso (vazio sem token válido). */
    profissionalIdParaLog: string | null;
  }
  interface FastifyInstance {
    /** Espera as gravações de log em andamento terminarem (usado nos testes e no desligamento). */
    aguardarLogsPendentes(): Promise<void>;
  }
}

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cabecalho(valor: string | string[] | undefined): string | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto?.trim() || undefined;
}

/**
 * Middleware de log de acesso exigido pelo enunciado: registra toda requisição HTTP com
 * data/hora, IP do cliente, ID do profissional, método, rota, status e tempo (ms).
 * A gravação acontece depois da resposta e nunca derruba a requisição.
 */
export function registrarLogDeAcesso(app: FastifyInstance, logs: RepositorioLogs): void {
  const pendentes = new Set<Promise<void>>();

  app.decorateRequest('inicioEm', 0n);
  app.decorateRequest('dataHoraInicio', null);
  app.decorateRequest('profissionalIdParaLog', null);
  app.decorate('aguardarLogsPendentes', async () => {
    await Promise.allSettled([...pendentes]);
  });

  app.addHook('onRequest', async (req) => {
    req.inicioEm = process.hrtime.bigint();
    req.dataHoraInicio = new Date();
  });

  app.addHook('onResponse', async (req, reply) => {
    const tempoMs = Number((process.hrtime.bigint() - req.inicioEm) / 1_000_000n);
    const dispositivo = cabecalho(req.headers['x-dispositivo-id']);
    const tarefa = logs
      .inserirAcesso({
        dataHora: req.dataHoraInicio ?? new Date(),
        servico: SERVICO,
        // O Nginx preenche X-Real-IP com o IP de quem chamou. O serviço não fica exposto
        // fora da rede do Docker, então esse cabeçalho é confiável aqui.
        ipCliente: cabecalho(req.headers['x-real-ip']) ?? req.socket.remoteAddress ?? 'desconhecido',
        profissionalId: req.profissionalIdParaLog,
        metodo: req.method,
        rota: (req.url.split('?')[0] ?? req.url).slice(0, 500),
        statusCode: reply.statusCode,
        tempoMs,
        dispositivoId: dispositivo && FORMATO_UUID.test(dispositivo) ? dispositivo : null,
        userAgent: cabecalho(req.headers['user-agent'])?.slice(0, 300) ?? null,
      })
      .catch((err: unknown) => req.log.error({ err }, 'falha ao gravar o log de acesso'));
    pendentes.add(tarefa);
    void tarefa.finally(() => pendentes.delete(tarefa));
  });

  app.addHook('onClose', async () => {
    await Promise.allSettled([...pendentes]);
  });
}
