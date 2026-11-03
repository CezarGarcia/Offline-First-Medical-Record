import {
  RiAlarmWarningLine,
  RiBrainLine,
  RiCalendarLine,
  RiCapsuleLine,
  RiContactsLine,
  RiDropLine,
  RiFirstAidKitLine,
  RiHeartPulseLine,
  RiIdCardLine,
  RiLungsLine,
  RiMailLine,
  RiPhoneLine,
  RiPulseLine,
  RiRefreshLine,
  RiStethoscopeLine,
  RiTempHotLine,
  RiTestTubeLine,
  RiUserLine,
  RiUserHeartLine,
} from '@remixicon/react';
import type { ComponentType } from 'react';
import { type PatientDetail, PatientInfoCard } from '@/components/application/medical/patient-info-card';
import { cx } from '@/utils/cx';
import { cpf, data, dataHora, diaEmBrasilia, gravidadeGlasgow, hora, idade, numero, telefone } from '@compartilhado/formatos';
import {
  DESFECHO,
  GLASGOW_MOTORA,
  GLASGOW_OCULAR,
  GLASGOW_VERBAL,
  PROTOCOLO,
  SEXO,
  SIGNIFICADO_DA_COR,
  TIPO_OCORRENCIA,
  UNIDADE,
  VIA,
  rotulo,
} from '@compartilhado/rotulos';
import type { AtendimentoDetalhe, Contato, Origem, Pessoa, Prontuario, Sincronizacao } from '@compartilhado/tipos';
import { Campos, Secao } from './Campos';
import { Cartao } from './Pagina';
import { SeloModo, SeloTriagem, Valor } from './Selos';
import { Tabela } from './Tabela';

type Icone = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

function textoDoContato(contato: Contato | null): string | null {
  if (!contato) return null;
  const nome = contato.nome && contato.parentesco ? `${contato.nome} (${contato.parentesco})` : contato.nome;
  const partes = [nome, telefone(contato.telefone), contato.email].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}

function tipoSanguineo(prontuario: Pick<Prontuario, 'tipoSanguineo'>): string | null {
  return prontuario.tipoSanguineo === 'DESCONHECIDO' ? 'Desconhecido' : prontuario.tipoSanguineo;
}

/** O paciente no cartão do BoardUI: iniciais, nome e os dados de contato; com o prontuário, também sangue e alergias. */
export function CartaoDoPaciente({
  pessoa,
  referencia,
  prontuario,
  className,
}: {
  pessoa: Pessoa;
  referencia: string;
  prontuario?: Pick<Prontuario, 'tipoSanguineo' | 'alergias'>;
  className?: string;
}) {
  const anos = idade(pessoa.dataNascimento, referencia);
  const nascimento = pessoa.dataNascimento
    ? `${data(pessoa.dataNascimento)}${anos !== null ? ` (${anos} ${anos === 1 ? 'ano' : 'anos'})` : ''}`
    : null;
  const vazio = <Valor>{null}</Valor>;
  const detalhes: PatientDetail[] = [
    { icon: RiIdCardLine, label: 'CPF', value: cpf(pessoa.cpf) ?? vazio },
    { icon: RiCalendarLine, label: 'Nascimento', value: nascimento ?? vazio },
    { icon: RiUserLine, label: 'Sexo', value: rotulo(SEXO, pessoa.sexo) ?? vazio },
    ...(prontuario
      ? [
          { icon: RiDropLine, label: 'Tipo sanguíneo', value: tipoSanguineo(prontuario) },
          {
            icon: RiAlarmWarningLine,
            label: 'Alergias',
            value: prontuario.alergias ?? <Valor vazio="nenhuma informada">{null}</Valor>,
            tone: prontuario.alergias ? ('alert' as const) : ('default' as const),
          },
        ]
      : []),
    { icon: RiPhoneLine, label: 'Telefone', value: telefone(pessoa.telefone) ?? vazio },
    { icon: RiMailLine, label: 'E-mail', value: pessoa.email ?? vazio },
    { icon: RiContactsLine, label: 'Familiar', value: textoDoContato(pessoa.contato) ?? vazio },
  ];
  return (
    <PatientInfoCard
      name={pessoa.nome}
      subtitle="Paciente"
      details={detalhes}
      avatarAction={null}
      className={cx('rounded-3xl border border-border-button-default', className)}
    />
  );
}

export function SecaoProntuario({ prontuario }: { prontuario: Prontuario }) {
  return (
    <Secao titulo="Prontuário" icone={RiFirstAidKitLine}>
      <Campos
        campos={[
          { rotulo: 'Tipo sanguíneo', valor: tipoSanguineo(prontuario), destaque: true },
          { rotulo: 'Alergias', valor: prontuario.alergias, alerta: Boolean(prontuario.alergias), destaque: Boolean(prontuario.alergias) },
          { rotulo: 'Comorbidades', valor: prontuario.comorbidades },
          { rotulo: 'Medicamentos de uso contínuo', valor: prontuario.medicamentosUsoContinuo, largo: true },
          ...(prontuario.observacoes ? [{ rotulo: 'Observações', valor: prontuario.observacoes, largo: true }] : []),
        ]}
      />
    </Secao>
  );
}

export function SecaoOrigem({
  origem,
  sincronizacao,
  nomes,
}: {
  origem: Origem;
  sincronizacao: Sincronizacao;
  nomes?: Map<string, string>;
}) {
  const sincronizadoPor = nomes?.get(sincronizacao.sincronizadoPorId) ?? sincronizacao.sincronizadoPorId;
  return (
    <Secao titulo="Origem e sincronização" icone={RiRefreshLine}>
      <Campos
        campos={[
          { rotulo: 'Registrado por', valor: `${origem.criadoPorNome} (${origem.criadoPorRegistro})`, destaque: true },
          { rotulo: 'Dispositivo', valor: origem.dispositivoNome },
          { rotulo: 'Modo de registro', valor: <SeloModo modo={origem.modo} /> },
          { rotulo: 'Registrado no dispositivo em', valor: dataHora(origem.criadoEm) },
          { rotulo: 'Recebido pelo servidor em', valor: dataHora(sincronizacao.recebidoEm) },
          { rotulo: 'Sincronizado por', valor: sincronizadoPor },
        ]}
      />
    </Secao>
  );
}

/** Um sinal vital num bloco: ícone, nome e o valor grande. */
function BlocoDeSinal({ icone: IconeDoSinal, nome, valor }: { icone: Icone; nome: string; valor: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-background-bloco p-3">
      <span className="flex items-center gap-1.5 text-caption-1-medium text-text-secondary">
        <span className="flex size-6 items-center justify-center rounded-lg bg-background-cartao shadow-card">
          <IconeDoSinal className="size-3.5 text-foreground-icon-primary" aria-hidden />
        </span>
        {nome}
      </span>
      {valor ? (
        <span className="text-title-3-medium text-text-primary tabular-nums">{valor}</span>
      ) : (
        <Valor vazio="não medido">{null}</Valor>
      )}
    </div>
  );
}

/** A escala de Glasgow: o total em destaque, a barra até 15 e os três componentes. */
function Glasgow({ glasgow }: { glasgow: NonNullable<AtendimentoDetalhe['glasgow']> }) {
  const linhas = [
    ['Abertura ocular', glasgow.ocular, GLASGOW_OCULAR[glasgow.ocular], 4],
    ['Resposta verbal', glasgow.verbal, GLASGOW_VERBAL[glasgow.verbal], 5],
    ['Resposta motora', glasgow.motora, GLASGOW_MOTORA[glasgow.motora], 6],
  ] as const;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-background-bloco p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-caption-1-medium text-text-secondary">Escala de Glasgow</span>
          <span className="text-display-4-medium text-text-primary tabular-nums">
            {glasgow.total}
            <span className="text-title-3-regular text-text-tertiary">/15</span>
          </span>
        </div>
        <span className="rounded-full bg-background-cartao px-2.5 py-1 text-body-medium text-text-primary shadow-card">
          {gravidadeGlasgow(glasgow.total)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-tertiary-default" aria-hidden>
        <div
          className="h-full rounded-full bg-linear-to-r from-accent-400 to-accent-600 transition-[width] duration-500 ease-out"
          style={{ width: `${(glasgow.total / 15) * 100}%` }}
        />
      </div>
      <dl className="flex flex-col gap-1.5">
        {linhas.map(([nome, valor, descricao, maximo]) => (
          <div key={nome} className="flex items-center gap-3 rounded-2lg bg-background-cartao px-2.5 py-2">
            <dt className="w-32 shrink-0 text-body-regular text-text-secondary">{nome}</dt>
            <dd className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="text-body-medium text-text-primary">{descricao}</span>
              <span className="text-caption-1-semibold text-text-tertiary tabular-nums">
                {valor}/{maximo}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type ItemMedicamento = AtendimentoDetalhe['medicamentos'][number];

/** A ficha completa, na mesma ordem do PDF (docs/09-ficha-e-dominio.md, seção 9.5). */
export function FichaDoAtendimento({ atendimento, nomes }: { atendimento: AtendimentoDetalhe; nomes?: Map<string, string> }) {
  const referencia = diaEmBrasilia(atendimento.dataHora);
  const significado = SIGNIFICADO_DA_COR[atendimento.triagem.protocolo]?.[atendimento.triagem.cor];
  const sinais = atendimento.sinaisVitais;
  const comUnidade = (valor: number | null | undefined, unidade: string) =>
    valor === null || valor === undefined ? null : `${numero(valor)} ${unidade}`;
  const pressao =
    sinais && (sinais.paSistolica !== null || sinais.paDiastolica !== null)
      ? `${numero(sinais.paSistolica) ?? '—'} × ${numero(sinais.paDiastolica) ?? '—'} mmHg`
      : null;
  const medicamentos = [...atendimento.medicamentos].sort((a, b) => a.horario.localeCompare(b.horario));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <CartaoDoPaciente pessoa={atendimento.pessoa} referencia={referencia} prontuario={atendimento.prontuario} />

        <div className="flex min-w-0 flex-col gap-4">
          {/* Triagem e ocorrência: o que mais importa, em cima */}
          <Cartao className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-4">
              <SeloTriagem triagem={atendimento.triagem} grande />
              <div className="flex min-w-0 flex-col">
                <span className="text-headline-medium text-text-primary">Protocolo {rotulo(PROTOCOLO, atendimento.triagem.protocolo)}</span>
                {significado && <span className="text-body-regular text-text-secondary">{significado}</span>}
              </div>
            </div>
            <Campos
              colunas={3}
              campos={[
                { rotulo: 'Data/hora', valor: dataHora(atendimento.dataHora) },
                { rotulo: 'Tipo de ocorrência', valor: rotulo(TIPO_OCORRENCIA, atendimento.tipoOcorrencia) },
                { rotulo: 'Local', valor: atendimento.localOcorrencia },
                { rotulo: 'Queixa principal', valor: atendimento.queixaPrincipal, largo: true, destaque: true },
              ]}
            />
          </Cartao>

          <Secao titulo="Avaliação" icone={RiStethoscopeLine}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              {atendimento.glasgow ? (
                <Glasgow glasgow={atendimento.glasgow} />
              ) : (
                <div className="flex flex-col gap-2 rounded-2xl bg-background-bloco p-4">
                  <span className="flex items-center gap-1.5 text-caption-1-medium text-text-secondary">
                    <RiBrainLine className="size-4" aria-hidden /> Escala de Glasgow
                  </span>
                  <Valor vazio="Não avaliada.">{null}</Valor>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <BlocoDeSinal icone={RiHeartPulseLine} nome="Pressão arterial" valor={pressao} />
                <BlocoDeSinal icone={RiPulseLine} nome="Frequência cardíaca" valor={comUnidade(sinais?.frequenciaCardiaca, 'bpm')} />
                <BlocoDeSinal icone={RiLungsLine} nome="Freq. respiratória" valor={comUnidade(sinais?.frequenciaRespiratoria, 'irpm')} />
                <BlocoDeSinal icone={RiDropLine} nome="SpO₂" valor={comUnidade(sinais?.spo2, '%')} />
                <BlocoDeSinal icone={RiTempHotLine} nome="Temperatura" valor={comUnidade(sinais?.temperatura, '°C')} />
                <BlocoDeSinal icone={RiTestTubeLine} nome="Glicemia capilar" valor={comUnidade(sinais?.glicemia, 'mg/dL')} />
              </div>
            </div>
          </Secao>
        </div>
      </div>

      <SecaoProntuario prontuario={atendimento.prontuario} />

      <Secao titulo="Medicamentos administrados" icone={RiCapsuleLine}>
        <div className="overflow-hidden rounded-2xl border border-separator-border">
          <Tabela<ItemMedicamento>
            rotulo="Medicamentos administrados"
            itens={medicamentos}
            chave={(item) => item.id}
            vazio="Nenhum medicamento administrado."
            larguraMinima={640}
            colunas={[
              { titulo: 'Medicamento', celula: (item) => <span className="text-body-semibold">{item.nome}</span> },
              { titulo: 'Dose', semQuebra: true, celula: (item) => `${numero(item.dose)} ${rotulo(UNIDADE, item.unidade)}` },
              { titulo: 'Via', celula: (item) => rotulo(VIA, item.via) },
              {
                titulo: 'Horário',
                semQuebra: true,
                celula: (item) => (diaEmBrasilia(item.horario) === referencia ? hora(item.horario) : dataHora(item.horario)),
              },
              { titulo: 'Observação', celula: (item) => <Valor vazio="—">{item.observacao}</Valor> },
            ]}
          />
        </div>
      </Secao>

      <Secao titulo="Procedimentos e desfecho" icone={RiUserHeartLine}>
        <Campos
          campos={[
            { rotulo: 'Desfecho', valor: rotulo(DESFECHO, atendimento.desfecho.tipo), destaque: true },
            ...(atendimento.desfecho.destino ? [{ rotulo: 'Destino', valor: atendimento.desfecho.destino, destaque: true }] : []),
            { rotulo: 'Procedimentos realizados', valor: atendimento.procedimentos, largo: true },
            ...(atendimento.observacoes ? [{ rotulo: 'Observações', valor: atendimento.observacoes, largo: true }] : []),
          ]}
        />
      </Secao>

      <SecaoOrigem origem={atendimento.origem} sincronizacao={atendimento.sincronizacao} nomes={nomes} />
    </div>
  );
}
