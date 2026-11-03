package br.univates.medicalfield.clinico.comum;

import br.univates.medicalfield.clinico.erros.Detalhe;
import br.univates.medicalfield.clinico.erros.ErroApi;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Junta as regras que envolvem mais de um campo e responde todas de uma vez (400 VALIDACAO). */
public final class Verificacao {

    private final List<Detalhe> detalhes = new ArrayList<>();

    public void exigir(boolean condicao, String campo, String mensagem) {
        if (!condicao) {
            detalhes.add(new Detalhe(campo, mensagem));
        }
    }

    /** Aceita até uma hora de adiantamento, por causa de relógios de aparelho fora de hora. */
    public void naoNoFuturo(String campo, Instant valor, Instant agora) {
        exigir(valor == null || !valor.isAfter(agora.plus(Valores.TOLERANCIA_FUTURO)), campo, "não pode estar no futuro");
    }

    public void lancarSeHouverErros() {
        if (!detalhes.isEmpty()) {
            throw ErroApi.validacao(detalhes);
        }
    }
}
