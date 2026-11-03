import { Anchor, Breadcrumbs, Button, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconFileDownload, IconFileText, IconMail } from '@tabler/icons-react';
import { dataHora, numeroDaFicha } from '@compartilhado/formatos';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api/cliente';
import { useAtendimento, useNomesDosProfissionais } from '../api/consultas';
import { mensagemDoErro } from '../api/erros';
import { FichaDoAtendimento } from '../componentes/FichaDoAtendimento';
import { JanelaEmail } from '../componentes/JanelaEmail';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { baixarArquivo } from '../util/baixarArquivo';

export function DetalheAtendimento() {
  const { id = '' } = useParams();
  const consulta = useAtendimento(id);
  const nomes = useNomesDosProfissionais();
  const [janelaAberta, janela] = useDisclosure(false);
  const [baixando, setBaixando] = useState(false);
  const atendimento = consulta.data;

  async function baixarPdf() {
    setBaixando(true);
    try {
      const arquivo = await api.arquivo(`/documentos/ficha/${id}/pdf`);
      baixarArquivo(arquivo.conteudo, arquivo.nome ?? `ficha-atendimento-${numeroDaFicha(id)}.pdf`);
    } catch (falha) {
      notifications.show({ color: 'red', title: 'Não foi possível gerar o PDF', message: mensagemDoErro(falha) });
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Pagina
      titulo={`Ficha Nº ${numeroDaFicha(id)}`}
      descricao={atendimento ? `${atendimento.pessoa.nome} · ${dataHora(atendimento.dataHora)}` : undefined}
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
      acoes={
        atendimento && (
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<IconFileText size={16} />}
              component={Link}
              to={`/prontuarios/${atendimento.pessoa.id}`}
            >
              Ver prontuário
            </Button>
            <Button leftSection={<IconFileDownload size={16} />} onClick={baixarPdf} loading={baixando}>
              Baixar PDF
            </Button>
            <Button leftSection={<IconMail size={16} />} variant="light" onClick={janela.open}>
              Enviar por e-mail
            </Button>
          </Group>
        )
      }
    >
      <Breadcrumbs>
        <Anchor component={Link} to="/atendimentos" size="sm">
          Atendimentos
        </Anchor>
        <Anchor size="sm" c="dimmed" underline="never">
          Ficha Nº {numeroDaFicha(id)}
        </Anchor>
      </Breadcrumbs>
      <EstadoDaConsulta consulta={consulta}>
        {() =>
          atendimento && (
            <>
              <FichaDoAtendimento atendimento={atendimento} nomes={nomes} />
              <JanelaEmail atendimento={atendimento} aberta={janelaAberta} aoFechar={janela.close} />
            </>
          )
        }
      </EstadoDaConsulta>
    </Pagina>
  );
}
