package br.univates.medicalfield.clinico.unificacao;

import java.time.Instant;

/**
 * Padrão Strategy: a regra que decide o valor de um campo quando o registro que já estava no
 * servidor e o duplicado que chegou têm valores diferentes (docs/07-sincronizacao.md, seção 7.6).
 * Trocar de regra é só configuração (ESTRATEGIA_CONFLITO); nada mais no código muda.
 */
public interface EstrategiaDeMesclagem {

    enum Vencedor { EXISTENTE, RECEBIDO }

    /** Nome gravado no registro do conflito. */
    String nome();

    /**
     * @param carimboDoExistente data/hora de origem do valor que está no servidor
     * @param carimboDoRecebido data/hora em que o profissional registrou o valor que chegou
     */
    Vencedor decidir(Instant carimboDoExistente, Instant carimboDoRecebido);
}
