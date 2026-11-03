package br.univates.medicalfield.clinico.atendimento;

import br.univates.medicalfield.clinico.comum.Origem;
import br.univates.medicalfield.clinico.comum.Sincronizacao;
import br.univates.medicalfield.clinico.pessoa.Pessoa;
import br.univates.medicalfield.clinico.prontuario.Prontuario;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Atendimento completo (a Ficha de Atendimento), como a API devolve.
 * {@code pessoa} e {@code prontuario} só aparecem no detalhe (GET /api/atendimento/detalhe/{id}).
 */
public record Atendimento(
        UUID id,
        UUID prontuarioId,
        Instant dataHora,
        String localOcorrencia,
        String tipoOcorrencia,
        String queixaPrincipal,
        Triagem triagem,
        Glasgow glasgow,
        SinaisVitais sinaisVitais,
        List<MedicamentoAdministrado> medicamentos,
        String procedimentos,
        Desfecho desfecho,
        String observacoes,
        Origem origem,
        Sincronizacao sincronizacao,
        @JsonInclude(JsonInclude.Include.NON_NULL) Pessoa pessoa,
        @JsonInclude(JsonInclude.Include.NON_NULL) Prontuario prontuario) {

    public record Triagem(String protocolo, String cor) {
    }

    public record Glasgow(Integer ocular, Integer verbal, Integer motora, Integer total) {
    }

    public record SinaisVitais(
            Integer paSistolica,
            Integer paDiastolica,
            Integer frequenciaCardiaca,
            Integer frequenciaRespiratoria,
            Integer spo2,
            Double temperatura,
            Integer glicemia) {
    }

    public record MedicamentoAdministrado(
            UUID id, UUID medicamentoId, String nome, Double dose, String unidade, String via, Instant horario,
            String observacao) {
    }

    public record Desfecho(String tipo, String destino) {
    }

    /** Resumo usado em GET /api/atendimento. */
    public record Resumo(
            UUID id,
            Instant dataHora,
            Pessoa.Resumo pessoa,
            String tipoOcorrencia,
            Triagem triagem,
            Desfecho desfecho,
            Origem origem,
            Sincronizacao sincronizacao) {
    }

    public Atendimento comMedicamentos(List<MedicamentoAdministrado> itens) {
        return new Atendimento(id, prontuarioId, dataHora, localOcorrencia, tipoOcorrencia, queixaPrincipal, triagem,
                glasgow, sinaisVitais, itens, procedimentos, desfecho, observacoes, origem, sincronizacao, pessoa,
                prontuario);
    }

    public Atendimento comDetalhes(Pessoa dadosDaPessoa, Prontuario dadosDoProntuario) {
        return new Atendimento(id, prontuarioId, dataHora, localOcorrencia, tipoOcorrencia, queixaPrincipal, triagem,
                glasgow, sinaisVitais, medicamentos, procedimentos, desfecho, observacoes, origem, sincronizacao,
                dadosDaPessoa, dadosDoProntuario);
    }
}
