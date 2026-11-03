import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import { BLOQUEIO_MINUTOS, MAX_TENTATIVAS_LOGIN } from '../config.js';
import { erros } from '../erros.js';
import { DataHora, ProfissionalResumo, TipoRegistro, Uuid } from '../esquemas.js';
import { profissionalLogado } from '../plugins/autenticacao.js';
import type { LinhaProfissional, RepositorioProfissionais } from '../repositorios/profissionais.js';
import type { RepositorioSessoes } from '../repositorios/sessoes.js';
import { conferirSenha } from '../seguranca/senha.js';
import { hashDoRefreshToken, novoRefreshToken, type ProfissionalDoToken, type Tokens } from '../seguranca/tokens.js';

export interface OpcoesRotasAuth {
  profissionais: RepositorioProfissionais;
  sessoes: RepositorioSessoes;
  tokens: Tokens;
}

export function resumoDoProfissional(p: LinhaProfissional): ProfissionalDoToken {
  return { id: p.id, nome: p.nome, tipoRegistro: p.tipo_registro, registro: p.registro, perfil: p.perfil };
}

const CorpoLogin = Type.Object(
  {
    tipoRegistro: TipoRegistro,
    registro: Type.String({ minLength: 1, maxLength: 50 }),
    senha: Type.String({ minLength: 1, maxLength: 200 }),
    dispositivo: Type.Optional(
      Type.Object(
        {
          id: Type.Optional(Uuid),
          nome: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const RespostaLogin = Type.Object({
  tokenDeAcesso: Type.String(),
  tokenDeAcessoExpiraEm: DataHora,
  refreshToken: Type.String(),
  sessaoExpiraEm: DataHora,
  profissional: ProfissionalResumo,
});

const CorpoRefresh = Type.Object(
  { refreshToken: Type.String({ minLength: 20, maxLength: 200 }) },
  { additionalProperties: false },
);

const RespostaRefresh = Type.Object({
  tokenDeAcesso: Type.String(),
  tokenDeAcessoExpiraEm: DataHora,
  sessaoExpiraEm: DataHora,
});

export const rotasAuth: FastifyPluginAsyncTypebox<OpcoesRotasAuth> = async (app, { profissionais, sessoes, tokens }) => {
  app.post(
    '/api/auth/login',
    {
      config: { publica: true },
      schema: {
        tags: ['autenticação'],
        summary: 'Login com tipo de registro (CRM, COREN ou SOCORRISTA), registro e senha',
        security: [],
        body: CorpoLogin,
        response: { 200: RespostaLogin },
      },
    },
    async (req) => {
      const { tipoRegistro, registro, senha, dispositivo } = req.body;
      const profissional = await profissionais.buscarPorRegistro(tipoRegistro, registro);

      if (profissional?.bloqueado_ate && profissional.bloqueado_ate > new Date()) {
        throw erros.contaBloqueada(profissional.bloqueado_ate);
      }

      const senhaConfere = await conferirSenha(senha, profissional?.senha_hash);
      if (!profissional || !senhaConfere) {
        if (profissional) {
          const bloqueadoAte = await profissionais.registrarFalha(profissional.id, MAX_TENTATIVAS_LOGIN, BLOQUEIO_MINUTOS);
          if (bloqueadoAte) throw erros.contaBloqueada(bloqueadoAte);
        }
        throw erros.credenciaisInvalidas();
      }

      await profissionais.registrarSucesso(profissional.id);
      // Inativo só é informado depois que a senha confere, para não revelar quem existe
      if (!profissional.ativo) throw erros.profissionalInativo();

      req.profissionalIdParaLog = profissional.id;
      const refreshToken = novoRefreshToken();
      const sessao = await sessoes.criar(profissional.id, hashDoRefreshToken(refreshToken), dispositivo);
      const acesso = await tokens.emitirAcesso(resumoDoProfissional(profissional), sessao.id, sessao.expira_em);

      return {
        tokenDeAcesso: acesso.token,
        tokenDeAcessoExpiraEm: acesso.expiraEm.toISOString(),
        refreshToken,
        sessaoExpiraEm: sessao.expira_em.toISOString(),
        profissional: resumoDoProfissional(profissional),
      };
    },
  );

  app.post(
    '/api/auth/refresh',
    {
      // Sem token de acesso (ele pode estar vencido): quem autentica é o refresh token
      config: { publica: true },
      schema: {
        tags: ['autenticação'],
        summary: 'Renova o token de acesso usando o refresh token',
        security: [],
        body: CorpoRefresh,
        response: { 200: RespostaRefresh },
      },
    },
    async (req) => {
      const encontrada = await sessoes.buscarAtivaPorHash(hashDoRefreshToken(req.body.refreshToken));
      if (!encontrada) throw erros.sessaoInvalida();

      const { profissional } = encontrada;
      req.profissionalIdParaLog = profissional.id;
      if (!profissional.ativo) {
        await sessoes.revogar(encontrada.sessao_id, profissional.id);
        throw erros.profissionalInativo();
      }

      await sessoes.registrarUso(encontrada.sessao_id);
      const acesso = await tokens.emitirAcesso(
        resumoDoProfissional(profissional),
        encontrada.sessao_id,
        encontrada.sessao_expira_em,
      );
      return {
        tokenDeAcesso: acesso.token,
        tokenDeAcessoExpiraEm: acesso.expiraEm.toISOString(),
        sessaoExpiraEm: encontrada.sessao_expira_em.toISOString(),
      };
    },
  );

  app.post(
    '/api/auth/logout',
    {
      schema: {
        tags: ['autenticação'],
        summary: 'Encerra a sessão do token (responde 204, sem corpo)',
      },
    },
    async (req, reply) => {
      const logado = profissionalLogado(req);
      await sessoes.revogar(logado.sessaoId, logado.id);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/auth/me',
    {
      schema: {
        tags: ['autenticação'],
        summary: 'Dados do profissional logado',
        response: { 200: ProfissionalResumo },
      },
    },
    async (req) => {
      const profissional = await profissionais.buscarPorId(profissionalLogado(req).id);
      if (!profissional) throw erros.naoAutenticado();
      if (!profissional.ativo) throw erros.profissionalInativo();
      return resumoDoProfissional(profissional);
    },
  );
};
