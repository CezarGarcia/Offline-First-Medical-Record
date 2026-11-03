import { Alert, Button, Stack, Title } from '@mantine/core';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { diaEmBrasilia } from '@compartilhado/formatos';
import { Link, useParams } from 'react-router';
import { AvisoDeErro, Carregando, Pagina } from '../componentes/Basicos';
import { AvisoDeAlergias, SecaoOrigem, SecaoPaciente, SecaoProntuario } from '../componentes/Ficha';
import { ListaDeAtendimentos } from '../componentes/ListaDeAtendimentos';
import { nucleo } from '../nucleo';

export function Paciente() {
  const { id = '' } = useParams();
  const detalhe = useQuery({ queryKey: ['paciente', id], queryFn: () => nucleo.paciente(id) });

  if (detalhe.isLoading) return <Carregando />;
  if (detalhe.isError) return <AvisoDeErro erro={detalhe.error} />;
  if (!detalhe.data) {
    return (
      <Pagina titulo="Paciente">
        <Alert color="orange" variant="light" title="Pessoa não encontrada neste aparelho">
          Se ela foi unificada com outro cadastro na sincronização (mesmo CPF), procure pelo nome na lista de pacientes.
        </Alert>
        <Button component={Link} to="/pacientes" variant="default" leftSection={<IconArrowLeft size={16} />} w="fit-content">
          Voltar para Pacientes
        </Button>
      </Pagina>
    );
  }

  const { pessoa, prontuarios, atendimentos } = detalhe.data;
  return (
    <Pagina
      titulo={pessoa.nome}
      descricao="Dados da pessoa, prontuário e atendimentos guardados neste aparelho."
      acoes={
        <>
          <Button component={Link} to="/pacientes" variant="default" leftSection={<IconArrowLeft size={16} />}>
            Pacientes
          </Button>
          <Button component={Link} to={`/nova-ocorrencia?pessoa=${pessoa.id}`} leftSection={<IconPlus size={16} />}>
            Novo atendimento
          </Button>
        </>
      }
    >
      <AvisoDeAlergias prontuario={prontuarios[0]} />
      <SecaoPaciente pessoa={pessoa} referencia={diaEmBrasilia(new Date().toISOString())} />
      {prontuarios.length === 0 && (
        <Alert color="blue" variant="light">
          Esta pessoa ainda não tem prontuário neste aparelho. Ele é criado no passo 2 de uma nova ocorrência.
        </Alert>
      )}
      {prontuarios.length > 1 && (
        <Alert color="blue" variant="light">
          Dois prontuários neste aparelho (feitos em aparelhos diferentes): na sincronização, o servidor une os dois num só.
        </Alert>
      )}
      {prontuarios.map((prontuario) => (
        <SecaoProntuario key={prontuario.id} prontuario={prontuario} />
      ))}
      <Stack gap="xs">
        <Title order={4} c="marca.7">
          Atendimentos
        </Title>
        <ListaDeAtendimentos itens={atendimentos} comPaciente={false} vazio="Nenhum atendimento desta pessoa neste aparelho." />
      </Stack>
      <SecaoOrigem origem={pessoa.origem} sincronizacao={pessoa.sincronizacao} estadoSync={pessoa.estadoSync} />
    </Pagina>
  );
}
