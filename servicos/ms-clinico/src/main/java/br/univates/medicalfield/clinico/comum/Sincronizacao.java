package br.univates.medicalfield.clinico.comum;

import java.time.Instant;
import java.util.UUID;

/** Preenchido pelo servidor: quem enviou (dono do token), quando chegou e a última mudança. */
public record Sincronizacao(UUID sincronizadoPorId, Instant recebidoEm, Instant atualizadoEm) {
}
