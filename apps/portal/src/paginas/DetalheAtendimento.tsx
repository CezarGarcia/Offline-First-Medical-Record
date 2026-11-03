import { RiDownload2Line, RiFileList3Line, RiFirstAidKitLine, RiMailSendLine } from '@remixicon/react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/components/base/buttons/button';
import { Breadcrumb, BreadcrumbItem } from '@/components/base/breadcrumb/breadcrumb';
import { SpinnerGlyph } from '@/components/base/spinner/spinner';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { dataHora, numeroDaFicha } from '@compartilhado/formatos';
import { api } from '../api/cliente';
import { useAtendimento, useNomesDosProfissionais } from '../api/consultas';
import { mensagemDoErro } from '../api/erros';
import { BotaoLink } from '../componentes/BotaoLink';
import { FichaDoAtendimento } from '../componentes/FichaDoAtendimento';
import { JanelaEmail } from '../componentes/JanelaEmail';
import { EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { baixarArquivo } from '../util/baixarArquivo';

function Baixando({ className }: { className?: string }) {
  return <SpinnerGlyph size="sm" className={cx(className, 'text-current')} />;
}

/** Esqueleto no formato da ficha: o cartão do paciente à esquerda e os blocos à direita. */
function FichaCarregando() {
  return (
    <div role="status" aria-label="Carregando" className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <Skeleton className="h-[460px] rounded-3xl" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[200px] rounded-3xl" />
        <Skeleton className="h-[240px] rounded-3xl" />
      </div>
    </div>
  );
}

export function DetalheAtendimento() {
  const { id = '' } = useParams();
  const consulta = useAtendimento(id);
  const nomes = useNomesDosProfissionais();
  const [janelaAberta, setJanelaAberta] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const atendimento = consulta.data;

  async function baixarPdf() {
    if (baixando) return;
    setBaixando(true);
    try {
      const arquivo = await api.arquivo(`/documentos/ficha/${id}/pdf`);
      baixarArquivo(arquivo.conteudo, arquivo.nome ?? `ficha-atendimento-${numeroDaFicha(id)}.pdf`);
      toast.success('PDF gerado', { description: 'O download da ficha começou.', duration: 3000 });
    } catch (falha) {
      toast.error('Não foi possível gerar o PDF', { description: mensagemDoErro(falha) });
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
      atualizadoEm={consulta.dataUpdatedAt}
      migalhas={
        <Breadcrumb aria-label="Caminho">
          <BreadcrumbItem href="/atendimentos" icon={RiFirstAidKitLine}>
            Atendimentos
          </BreadcrumbItem>
          <BreadcrumbItem current>Ficha Nº {numeroDaFicha(id)}</BreadcrumbItem>
        </Breadcrumb>
      }
      acoes={
        atendimento && (
          <>
            <BotaoLink para={`/prontuarios/${atendimento.pessoa.id}`} icone={RiFileList3Line}>
              Ver prontuário
            </BotaoLink>
            <Button variant="secondary" leadingIcon={RiMailSendLine} onClick={() => setJanelaAberta(true)}>
              Enviar por e-mail
            </Button>
            <Button leadingIcon={baixando ? Baixando : RiDownload2Line} onClick={baixarPdf} aria-busy={baixando || undefined}>
              Baixar PDF
            </Button>
          </>
        )
      }
    >
      <EstadoDaConsulta consulta={consulta} carregando={<FichaCarregando />}>
        {() =>
          atendimento && (
            <>
              <FichaDoAtendimento atendimento={atendimento} nomes={nomes} />
              <JanelaEmail atendimento={atendimento} aberta={janelaAberta} aoFechar={() => setJanelaAberta(false)} />
            </>
          )
        }
      </EstadoDaConsulta>
    </Pagina>
  );
}
