import { RiMailSendLine } from '@remixicon/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Label } from '@/components/base/input/label';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/base/modal/modal';
import { RadioGroup } from '@/components/base/radio/radio';
import { RadioCard } from '@/components/base/radio/radio-card';
import { SpinnerGlyph } from '@/components/base/spinner/spinner';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { uuid7 } from '@compartilhado/ids';
import type { AtendimentoDetalhe, EnvioEmail, TipoDestinatario } from '@compartilhado/tipos';
import { api } from '../api/cliente';
import { mensagemDoErro } from '../api/erros';
import { Aviso } from './Pagina';

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PropsDaJanela {
  atendimento: AtendimentoDetalhe;
  aberta: boolean;
  aoFechar: () => void;
}

function Enviando({ className }: { className?: string }) {
  return <SpinnerGlyph size="sm" className={cx(className, 'text-current')} />;
}

/**
 * Envio da ficha por e-mail. O ID do pedido é gerado quando a janela abre e reaproveitado em cada tentativa:
 * clicar duas vezes, ou tentar de novo depois de um erro, nunca manda dois e-mails (D-36).
 */
export function JanelaEmail({ atendimento, aberta, aoFechar }: PropsDaJanela) {
  const consultas = useQueryClient();
  const emailDoPaciente = atendimento.pessoa.email;
  const emailDoFamiliar = atendimento.pessoa.contato?.email ?? null;
  const [pedidoId, setPedidoId] = useState(uuid7);
  const [tipo, setTipo] = useState<TipoDestinatario>('OUTRO');
  const [outro, setOutro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberta) return;
    // Um pedido novo a cada vez que a janela abre
    setPedidoId(uuid7());
    setTipo(emailDoFamiliar ? 'FAMILIAR' : emailDoPaciente ? 'PACIENTE' : 'OUTRO');
    setOutro('');
    setErro(null);
  }, [aberta, emailDoFamiliar, emailDoPaciente]);

  const emailInvalido = tipo === 'OUTRO' && !FORMATO_EMAIL.test(outro.trim());

  async function enviar() {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await api.requisitar(`/documentos/ficha/${atendimento.id}/email`, {
        metodo: 'POST',
        corpo: {
          id: pedidoId,
          destinatario: tipo === 'OUTRO' ? { tipo, email: outro.trim() } : { tipo },
        },
      });
      const envio = (await resposta.json()) as EnvioEmail;
      toast.success(resposta.status === 201 ? 'E-mail enviado' : 'Este pedido já tinha sido enviado', {
        description: `Ficha enviada para ${envio.destinatarioEmail}.`,
      });
      void consultas.invalidateQueries({ queryKey: ['envios-email'] });
      aoFechar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      isOpen={aberta}
      onOpenChange={(aberto) => {
        if (!aberto && !enviando) aoFechar();
      }}
      size="lg"
    >
      <ModalHeader
        title="Enviar a ficha por e-mail"
        description="A ficha em PDF vai anexada. O e-mail avisa que o conteúdo tem dados sensíveis (LGPD)."
        icon={RiMailSendLine}
        closeLabel="Fechar"
      />
      <ModalBody className="flex flex-col gap-4">
        <RadioGroup value={tipo} onChange={(valor) => setTipo(valor as TipoDestinatario)} className="flex flex-col gap-2">
          <Label>Para quem</Label>
          <RadioCard
            value="PACIENTE"
            isDisabled={!emailDoPaciente}
            title="Paciente"
            description={emailDoPaciente ?? 'Sem e-mail no cadastro da pessoa'}
          />
          <RadioCard
            value="FAMILIAR"
            isDisabled={!emailDoFamiliar}
            title="Familiar"
            description={
              emailDoFamiliar
                ? `${atendimento.pessoa.contato?.nome ?? 'Contato'} · ${emailDoFamiliar}`
                : 'Sem e-mail no contato do familiar'
            }
          />
          <RadioCard value="OUTRO" title="Outro endereço" description="Digite o e-mail abaixo" />
        </RadioGroup>
        {tipo === 'OUTRO' && (
          <Input
            label="E-mail"
            type="email"
            placeholder="nome@exemplo.com"
            value={outro}
            onChange={setOutro}
            isInvalid={Boolean(outro) && emailInvalido}
            errorMessage="E-mail inválido"
            autoFocus
            className="cartao-entra"
          />
        )}
        {erro && (
          <Aviso tipo="error" titulo="Não foi possível enviar">
            {erro} Você pode tentar de novo: o mesmo pedido não manda dois e-mails.
          </Aviso>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={aoFechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          leadingIcon={enviando ? Enviando : RiMailSendLine}
          onClick={enviar}
          disabled={emailInvalido}
          aria-busy={enviando || undefined}
        >
          {erro ? 'Tentar de novo' : 'Enviar'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
