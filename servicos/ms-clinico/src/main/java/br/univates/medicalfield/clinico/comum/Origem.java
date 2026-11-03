package br.univates.medicalfield.clinico.comum;

import java.time.Instant;
import java.util.UUID;

/**
 * Quem registrou, quando (relógio do aparelho), de qual dispositivo e em que modo.
 * É o objeto "origem" da API (docs/06-api.md, seção 6.4).
 */
public record Origem(
        UUID criadoPorId,
        String criadoPorNome,
        String criadoPorRegistro,
        Instant criadoEm,
        UUID dispositivoId,
        String dispositivoNome,
        String modo) {
}
