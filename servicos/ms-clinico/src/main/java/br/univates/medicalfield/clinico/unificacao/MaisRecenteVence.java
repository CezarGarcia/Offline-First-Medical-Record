package br.univates.medicalfield.clinico.unificacao;

import java.time.Instant;

/** Estratégia padrão: vence o valor com o carimbo de data/hora mais recente do profissional. */
public final class MaisRecenteVence implements EstrategiaDeMesclagem {

    @Override
    public String nome() {
        return "MAIS_RECENTE_VENCE";
    }

    /** Empate fica com o que já estava no servidor. */
    @Override
    public Vencedor decidir(Instant carimboDoExistente, Instant carimboDoRecebido) {
        return carimboDoRecebido.isAfter(carimboDoExistente) ? Vencedor.RECEBIDO : Vencedor.EXISTENTE;
    }
}
