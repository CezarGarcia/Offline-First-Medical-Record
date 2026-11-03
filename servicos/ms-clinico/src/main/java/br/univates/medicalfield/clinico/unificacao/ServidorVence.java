package br.univates.medicalfield.clinico.unificacao;

import java.time.Instant;

/** Estratégia alternativa: nos campos em conflito, fica sempre o valor que já estava no servidor. */
public final class ServidorVence implements EstrategiaDeMesclagem {

    @Override
    public String nome() {
        return "SERVIDOR_VENCE";
    }

    @Override
    public Vencedor decidir(Instant carimboDoExistente, Instant carimboDoRecebido) {
        return Vencedor.EXISTENTE;
    }
}
