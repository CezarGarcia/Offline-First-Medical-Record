package br.univates.medicalfield.clinico.prontuario;

import br.univates.medicalfield.clinico.comum.OrigemEntrada;
import br.univates.medicalfield.clinico.comum.Valores;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** Corpo de POST /api/prontuario. {@code id} e {@code origem} são opcionais. */
public record ProntuarioEntrada(
        UUID id,
        @NotNull UUID pessoaId,
        @Pattern(regexp = Valores.TIPO_SANGUINEO, message = Valores.MSG_TIPO_SANGUINEO) String tipoSanguineo,
        @Size(max = 2000) String alergias,
        @Size(max = 2000) String comorbidades,
        @Size(max = 2000) String medicamentosUsoContinuo,
        @Size(max = 2000) String observacoes,
        @Valid OrigemEntrada origem) {
}
