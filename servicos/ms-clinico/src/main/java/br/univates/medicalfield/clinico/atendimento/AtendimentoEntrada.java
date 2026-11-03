package br.univates.medicalfield.clinico.atendimento;

import br.univates.medicalfield.clinico.comum.OrigemEntrada;
import br.univates.medicalfield.clinico.comum.Valores;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Corpo de POST /api/atendimento: a Ficha de Atendimento (docs/09-ficha-e-dominio.md).
 * As regras que envolvem mais de um campo ficam em {@link ServicoAtendimentos}.
 */
public record AtendimentoEntrada(
        UUID id,
        @NotNull UUID prontuarioId,
        @NotNull OffsetDateTime dataHora,
        @Size(max = 300) String localOcorrencia,
        @NotNull @Pattern(regexp = Valores.TIPO_OCORRENCIA, message = Valores.MSG_TIPO_OCORRENCIA) String tipoOcorrencia,
        @NotBlank @Size(max = 2000) String queixaPrincipal,
        @NotNull @Valid Triagem triagem,
        @Valid Glasgow glasgow,
        @Valid SinaisVitais sinaisVitais,
        @Size(max = 50) List<@NotNull @Valid MedicamentoAdministrado> medicamentos,
        @Size(max = 2000) String procedimentos,
        @NotNull @Valid Desfecho desfecho,
        @Size(max = 2000) String observacoes,
        @Valid OrigemEntrada origem) {

    public record Triagem(
            @NotNull @Pattern(regexp = Valores.PROTOCOLO, message = Valores.MSG_PROTOCOLO) String protocolo,
            @NotNull @Pattern(regexp = Valores.COR, message = Valores.MSG_COR) String cor) {
    }

    /** Ou vem completa (os três itens), ou não vem. */
    public record Glasgow(
            @NotNull @Min(1) @Max(4) Integer ocular,
            @NotNull @Min(1) @Max(5) Integer verbal,
            @NotNull @Min(1) @Max(6) Integer motora) {
    }

    /** Faixas que só barram erro de digitação; não são alertas clínicos (D-20). */
    public record SinaisVitais(
            @Min(0) @Max(300) Integer paSistolica,
            @Min(0) @Max(200) Integer paDiastolica,
            @Min(0) @Max(300) Integer frequenciaCardiaca,
            @Min(0) @Max(80) Integer frequenciaRespiratoria,
            @Min(0) @Max(100) Integer spo2,
            @DecimalMin("25.0") @DecimalMax("45.0") BigDecimal temperatura,
            @Min(0) @Max(1500) Integer glicemia) {
    }

    public record MedicamentoAdministrado(
            UUID id,
            @NotNull UUID medicamentoId,
            @NotNull @Positive @Digits(integer = 7, fraction = 3) BigDecimal dose,
            @NotNull @Pattern(regexp = Valores.UNIDADE, message = Valores.MSG_UNIDADE) String unidade,
            @NotNull @Pattern(regexp = Valores.VIA, message = Valores.MSG_VIA) String via,
            @NotNull OffsetDateTime horario,
            @Size(max = 500) String observacao) {
    }

    public record Desfecho(
            @NotNull @Pattern(regexp = Valores.DESFECHO, message = Valores.MSG_DESFECHO) String tipo,
            @Size(max = 200) String destino) {
    }
}
