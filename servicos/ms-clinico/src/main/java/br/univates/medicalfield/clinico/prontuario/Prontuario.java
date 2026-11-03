package br.univates.medicalfield.clinico.prontuario;

import br.univates.medicalfield.clinico.comum.Origem;
import br.univates.medicalfield.clinico.comum.Sincronizacao;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.UUID;

/**
 * Prontuário (histórico clínico fixo da pessoa; um por pessoa).
 * {@code pessoa} só aparece nas consultas: resumo nas listas e completa no detalhe.
 */
public record Prontuario(
        UUID id,
        UUID pessoaId,
        String tipoSanguineo,
        String alergias,
        String comorbidades,
        String medicamentosUsoContinuo,
        String observacoes,
        Origem origem,
        Sincronizacao sincronizacao,
        @JsonInclude(JsonInclude.Include.NON_NULL) Object pessoa) {

    public Prontuario comPessoa(Object dadosDaPessoa) {
        return new Prontuario(id, pessoaId, tipoSanguineo, alergias, comorbidades, medicamentosUsoContinuo, observacoes,
                origem, sincronizacao, dadosDaPessoa);
    }
}
