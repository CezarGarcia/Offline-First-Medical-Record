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
};
