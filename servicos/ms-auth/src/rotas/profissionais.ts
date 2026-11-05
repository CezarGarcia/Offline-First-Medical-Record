import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import { DataHora, Perfil, TipoRegistro, Uuid } from '../esquemas.js';
import type { RepositorioProfissionais } from '../repositorios/profissionais.js';

const Profissional = Type.Object({
  id: Uuid,
  nome: Type.String(),
  tipoRegistro: TipoRegistro,
  registro: Type.String(),
  perfil: Perfil,
  ativo: Type.Boolean(),
  criadoEm: DataHora,
});

const CredencialOffline = Type.Object({
  id: Uuid,
  nome: Type.String(),
  tipoRegistro: TipoRegistro,
  registro: Type.String(),
  perfil: Perfil,
  senhaHash: Type.String({ description: 'Hash bcrypt da senha (o mesmo de auth.profissional)' }),
});

const RespostaCredenciaisOffline = Type.Object({
  geradoEm: DataHora,
  profissionais: Type.Array(CredencialOffline),
});

export const rotasProfissionais: FastifyPluginAsyncTypebox<{ profissionais: RepositorioProfissionais }> = async (
  app,
  { profissionais },
) => {
  app.get(
    '/api/profissional',
    {
      config: { somenteAdmin: true },
      schema: {
        tags: ['profissionais'],
        summary: 'Lista os profissionais (cadastro de apoio). Só administradores.',
        response: { 200: Type.Array(Profissional) },
      },
    },
    async () => {
      const linhas = await profissionais.listar();
      return linhas.map((p) => ({
        id: p.id,
        nome: p.nome,
        tipoRegistro: p.tipo_registro,
        registro: p.registro,
        perfil: p.perfil,
        ativo: p.ativo,
        criadoEm: p.criado_em.toISOString(),
      }));
    },
  );

  // Réplica das credenciais para o login offline (D-51): o app guarda o hash cifrado pelo cofre do sistema e
  // confere a senha de quem nunca entrou online naquele aparelho. Só os ativos: quem sai da lista perde o acesso.
  app.get(
    '/api/auth/credenciais-offline',
    {
      schema: {
        tags: ['autenticação'],
        summary: 'Profissionais ativos com o hash da senha, para o login offline no app cliente (D-51)',
        response: { 200: RespostaCredenciaisOffline },
      },
    },
    async () => {
      const linhas = await profissionais.listarAtivos();
      return {
        geradoEm: new Date().toISOString(),
        profissionais: linhas.map((p) => ({
          id: p.id,
          nome: p.nome,
          tipoRegistro: p.tipo_registro,
          registro: p.registro,
          perfil: p.perfil,
          senhaHash: p.senha_hash,
        })),
      };
    },
  );
};
