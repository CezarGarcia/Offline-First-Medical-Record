import { RiArrowLeftRightLine, RiArrowRightLine, RiCheckDoubleLine } from '@remixicon/react';
import { cpf, data, dataHora, telefone } from '@compartilhado/formatos';
import { CAMPO, ENTIDADE_DO_CONFLITO, ESTRATEGIA, MOTIVO_DO_CONFLITO, ORIGEM_DO_VALOR, SEXO, rotulo } from '@compartilhado/rotulos';
import type { Conflito, Sexo } from '@compartilhado/tipos';
import { type ReactNode, useMemo } from 'react';
import { useConflitos, useNomesDosProfissionais, useProntuarios } from '../api/consultas';
import { BotaoLink } from '../componentes/BotaoLink';
import { Cartao, Carregando, EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { Etiqueta, IdCurto, Valor } from '../componentes/Selos';
import { Tabela } from '../componentes/Tabela';

/** O valor de uma diferença no mesmo formato do resto do portal (telefone, CPF, data, listas fixas). */
function valorDoCampo(campo: string, valor: string | null): string | null {
  if (valor === null) return null;
  if (campo === 'telefone' || campo === 'contato.telefone') return telefone(valor);
  if (campo === 'cpf') return cpf(valor);
  if (campo === 'dataNascimento') return data(valor);
  if (campo === 'sexo') return rotulo(SEXO, valor as Sexo);
  if (campo === 'tipoSanguineo') return valor === 'DESCONHECIDO' ? 'Desconhecido' : valor;
  return valor;
}

type Diferenca = Conflito['diferencas'][number];

function Informacao({ rotulo: nome, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2lg bg-background-bloco px-3 py-2.5">
      <span className="text-caption-1-medium text-text-tertiary">{nome}</span>
      <span className="text-body-medium text-text-primary">{children}</span>
    </div>
  );
}

function CartaoDoConflito({
  conflito,
  nomes,
  pessoaDoProntuario,
  ordem,
}: {
  conflito: Conflito;
  nomes: Map<string, string>;
  pessoaDoProntuario: Map<string, string>;
  ordem: number;
}) {
  // O detalhe do prontuário é aberto pelo ID da pessoa
  const pessoaMantida = conflito.entidade === 'PESSOA' ? conflito.idMantido : pessoaDoProntuario.get(conflito.idMantido);
  const conflitos = conflito.diferencas.filter((d) => d.tipo === 'CONFLITO').length;
  return (
    <Cartao className="cartao-entra flex flex-col gap-4 p-5" style={{ ['--ordem' as string]: Math.min(ordem, 8) }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2lg bg-linear-to-b from-accent-500 to-accent-600 shadow-xs">
            <RiArrowLeftRightLine className="size-5 text-white" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Etiqueta cor="blue">{rotulo(ENTIDADE_DO_CONFLITO, conflito.entidade)}</Etiqueta>
              <h2 className="text-headline-medium text-text-primary">{rotulo(MOTIVO_DO_CONFLITO, conflito.motivo)}</h2>
            </div>
            <p className="text-body-regular text-text-secondary">
              Detectado em {dataHora(conflito.detectadoEm)} · regra: {rotulo(ESTRATEGIA, conflito.estrategia)}
            </p>
          </div>
        </div>
        {pessoaMantida && (
          <BotaoLink para={`/prontuarios/${pessoaMantida}`} icone={RiArrowRightLine}>
            Ver o registro mantido
          </BotaoLink>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Informacao rotulo="Registro mantido">
          <IdCurto id={conflito.idMantido} />
        </Informacao>
        <Informacao rotulo="Registro descartado (vira apelido)">
          <IdCurto id={conflito.idDescartado} />
        </Informacao>
        <Informacao rotulo="Veio do dispositivo">
          <Valor vazio="—">{conflito.dispositivoNome}</Valor>
        </Informacao>
        <Informacao rotulo="Sincronizado por">
          <Valor vazio="—">
            {conflito.sincronizadoPorId ? (nomes.get(conflito.sincronizadoPorId) ?? conflito.sincronizadoPorId) : null}
          </Valor>
        </Informacao>
      </div>

      {conflito.diferencas.length === 0 ? (
        <p className="flex items-center gap-2 text-body-regular text-text-secondary">
          <RiCheckDoubleLine className="size-5 text-status-lime-text" aria-hidden />
          Os dois registros tinham os mesmos dados: nada a juntar.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-body-medium text-text-secondary">
            {conflito.diferencas.length} {conflito.diferencas.length === 1 ? 'campo juntado' : 'campos juntados'}
            {conflitos > 0 && ` · ${conflitos} com valores diferentes`}
          </p>
          <div className="overflow-hidden rounded-2xl border border-separator-border">
            <Tabela<Diferenca>
              rotulo="Diferenças entre os registros"
              itens={conflito.diferencas}
              chave={(d) => d.campo}
              larguraMinima={700}
              colunas={[
                { titulo: 'Campo', celula: (d) => <span className="text-body-semibold">{CAMPO[d.campo] ?? d.campo}</span> },
                {
                  titulo: 'Tipo',
                  semQuebra: true,
                  celula: (d) => (
                    <Etiqueta cor={d.tipo === 'CONFLITO' ? 'orange' : 'lime'}>
                      {d.tipo === 'CONFLITO' ? 'Conflito' : 'Complemento'}
                    </Etiqueta>
                  ),
                },
                { titulo: 'Valor que ficou', celula: (d) => <Valor vazio="(vazio)">{valorDoCampo(d.campo, d.valorMantido)}</Valor> },
                {
                  titulo: 'Valor que saiu',
                  celula: (d) => (
                    <span className="text-text-tertiary line-through decoration-text-tertiary/50">
                      <Valor vazio="(vazio)">{valorDoCampo(d.campo, d.valorDescartado)}</Valor>
                    </span>
                  ),
                },
                { titulo: 'O valor que ficou veio', celula: (d) => rotulo(ORIGEM_DO_VALOR, d.origemDoValor) },
              ]}
            />
          </div>
        </div>
      )}
    </Cartao>
  );
}

export function Conflitos() {
  const consulta = useConflitos();
  const prontuarios = useProntuarios();
  const nomes = useNomesDosProfissionais();
  const pessoaDoProntuario = useMemo(() => new Map((prontuarios.data ?? []).map((p) => [p.id, p.pessoaId])), [prontuarios.data]);
  const lista = consulta.data ?? [];

  return (
    <Pagina
      titulo="Conflitos"
      descricao="Cada vez que o servidor recebeu um registro duplicado (mesmo CPF, ou segundo prontuário da mesma pessoa) e juntou os dois. Conflito: os dois tinham o campo preenchido com valores diferentes; complemento: só um tinha."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
      atualizadoEm={consulta.dataUpdatedAt}
    >
      <EstadoDaConsulta
        consulta={consulta}
        carregando={
          <Cartao>
            <Carregando linhas={4} />
          </Cartao>
        }
      >
        {() =>
          lista.length === 0 ? (
            <Cartao className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-status-lime-background">
                <RiCheckDoubleLine className="size-6 text-status-lime-text" aria-hidden />
              </span>
              <p className="text-body-medium text-text-secondary">Nenhum conflito até agora.</p>
            </Cartao>
          ) : (
            <div className="flex flex-col gap-4">
              {lista.map((conflito, ordem) => (
                <CartaoDoConflito
                  key={conflito.id}
                  conflito={conflito}
                  nomes={nomes}
                  pessoaDoProntuario={pessoaDoProntuario}
                  ordem={ordem}
                />
              ))}
            </div>
          )
        }
      </EstadoDaConsulta>
    </Pagina>
  );
}
