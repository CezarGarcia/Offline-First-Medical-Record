package br.univates.medicalfield.clinico.medicamento;

import java.time.Instant;
import java.util.UUID;

/** Item do catálogo de medicamentos (cadastro de apoio, inserido direto no banco). */
public record Medicamento(UUID id, String nome, String apresentacao, String unidadePadrao, boolean ativo, Instant atualizadoEm) {
}
