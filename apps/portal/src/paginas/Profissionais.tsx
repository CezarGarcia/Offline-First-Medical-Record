import { Badge, Text } from '@mantine/core';
import { dataHora } from '@compartilhado/formatos';
import { PERFIL, TIPO_REGISTRO, rotulo } from '@compartilhado/rotulos';
import type { Profissional } from '@compartilhado/tipos';
import { useProfissionais } from '../api/consultas';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { SeloSimNao } from '../componentes/Selos';
import { type Coluna, Tabela } from '../componentes/Tabela';

const COLUNAS: Coluna<Profissional>[] = [
  {
    titulo: 'Nome',
    celula: (p) => (
      <Text size="sm" fw={600}>
        {p.nome}
      </Text>
    ),
  },
  { titulo: 'Registro', celula: (p) => `${rotulo(TIPO_REGISTRO, p.tipoRegistro)} ${p.registro}` },
  {
    titulo: 'Perfil',
    celula: (p) => (
      <Badge variant="light" color={p.perfil === 'ADMIN' ? 'marca' : 'gray'} size="sm">
        {rotulo(PERFIL, p.perfil)}
      </Badge>
    ),
  },
  { titulo: 'Situação', celula: (p) => <SeloSimNao valor={p.ativo} /> },
  { titulo: 'Cadastrado em', celula: (p) => dataHora(p.criadoEm) },
];

export function Profissionais() {
  const consulta = useProfissionais();
  return (
    <Pagina
      titulo="Profissionais"
      descricao="Quem pode entrar no sistema (CRM, COREN ou ID de Socorrista). Cadastro de apoio: novos profissionais entram direto no banco."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
    >
      <EstadoDaConsulta consulta={consulta}>
        {() => (
          <Tabela
            itens={[...(consulta.data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))}
            colunas={COLUNAS}
            chave={(p) => p.id}
            vazio="Nenhum profissional cadastrado."
            larguraMinima={700}
          />
        )}
      </EstadoDaConsulta>
    </Pagina>
  );
}
