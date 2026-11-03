package br.univates.medicalfield.clinico.auditoria;

import java.time.Instant;
import java.util.UUID;

/** Uma linha de auditoria.log_acesso. */
public record LogAcesso(
        Instant dataHora,
        String ipCliente,
        UUID profissionalId,
        String metodo,
        String rota,
        int statusCode,
        int tempoMs,
        UUID dispositivoId,
        String userAgent) {
}
