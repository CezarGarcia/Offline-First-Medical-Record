import { dataHora } from '@compartilhado/formatos';
import { PERFIL, TIPO_REGISTRO, rotulo } from '@compartilhado/rotulos';
import type { Profissional } from '@compartilhado/tipos';
import { useProfissionais } from '../api/consultas';
import { EstadoDaConsulta, Pagina, Quadro } from '../componentes/Pagina';
import { Etiqueta, NomeComAvatar, SeloSimNao } from '../componentes/Selos';
import { type Coluna, Tabela } from '../componentes/Tabela';

const COLUNAS: Coluna<Profissional>[] = [
  {
    titulo: 'Nome',
    celula: (p) => <NomeComAvatar nome={p.nome} detalhe={`${rotulo(TIPO_REGISTRO, p.tipoRegistro)} ${p.registro}`} />,
  },
  {
    titulo: 'Perfil',
    semQuebra: true,
    celula: (p) => <Etiqueta cor={p.perfil === 'ADMIN' ? 'blue' : 'soft'}>{rotulo(PERFIL, p.perfil)}</Etiqueta>,
  },
  { titulo: 'Situação', semQuebra: true, celula: (p) => <SeloSimNao valor={p.ativo} /> },
  { titulo: 'Cadastrado em', semQuebra: true, celula: (p) => <span className="tabular-nums">{dataHora(p.criadoEm)}</span> },
];

export function Profissionais() {
  const consulta = useProfissionais();
  const lista = [...(consulta.data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return (
    <Pagina
      titulo="Profissionais"
      descricao="Quem pode entrar no sistema (CRM, COREN ou ID de Socorrista). Cadastro de apoio: novos profissionais entram direto no banco."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
      atualizadoEm={consulta.dataUpdatedAt}
    >
      <Quadro
        rodape={
          consulta.isSuccess && (
            <span className="text-body-medium text-text-secondary tabular-nums">
              {lista.length === 1 ? '1 profissional' : `${lista.length} profissionais`} · {lista.filter((p) => p.ativo).length} ativos
            </span>
          )
        }
      >
        <EstadoDaConsulta consulta={consulta}>
          {() => (
            <Tabela
              rotulo="Profissionais"
              itens={lista}
              colunas={COLUNAS}
              chave={(p) => p.id}
              vazio="Nenhum profissional cadastrado."
              larguraMinima={700}
            />
          )}
        </EstadoDaConsulta>
      </Quadro>
    </Pagina>
  );
}
