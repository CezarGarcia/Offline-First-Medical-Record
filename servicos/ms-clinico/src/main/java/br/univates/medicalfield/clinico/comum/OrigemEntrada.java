package br.univates.medicalfield.clinico.comum;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Objeto "origem" enviado pelo cliente. Opcional nos cadastros (ver {@link Autor#origemPara}). */
public record OrigemEntrada(
        @NotNull UUID criadoPorId,
        @NotBlank @Size(max = 200) String criadoPorNome,
        @NotBlank @Size(max = 100) String criadoPorRegistro,
        @NotNull OffsetDateTime criadoEm,
        UUID dispositivoId,
        @Size(max = 100) String dispositivoNome,
        @NotNull @Pattern(regexp = Valores.MODO, message = Valores.MSG_MODO) String modo) {
}
